import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaTool,
  BetaToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { SYSTEM_PROMPT, settings } from "./config";
import { type ChatEvent, parseTable, tableFromText } from "./events";
import { connectMcp } from "./mcpClient";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

type Emit = (e: ChatEvent) => void;

// Server-side fallback: if the model declines for policy reasons, the API retries
// on its default fallback model instead of returning a refusal.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const MCP_CONNECTOR_BETA = "mcp-client-2025-11-20";

const baseParams = () => ({
  model: settings.model,
  max_tokens: 32000,
  system: SYSTEM_PROMPT,
  thinking: { type: "adaptive" as const },
  output_config: { effort: settings.effort },
  fallbacks: "default" as const,
});

/** Assistant content goes back to the API exactly as received (thinking blocks included). */
const asParam = (content: BetaContentBlock[]) => content as unknown as BetaContentBlockParam[];

function streamText(stream: { on: (ev: "text", cb: (delta: string) => void) => unknown }, emit: Emit) {
  stream.on("text", (delta) => emit({ type: "text", text: delta }));
}

function handleStop(msg: BetaMessage, emit: Emit): "continue" | "stop" | "refused" {
  switch (msg.stop_reason) {
    case "refusal":
      emit({ type: "notice", message: "Claude declined to answer this request." });
      return "refused";
    case "max_tokens":
      emit({ type: "notice", message: "The answer was cut off because it reached the length limit." });
      return "stop";
    default:
      return "continue";
  }
}

/**
 * MCP_MODE=local: this server is the MCP client. We list the MCP tools, hand
 * them to Claude as regular tools, and execute each tool call against MCP.
 */
async function runLocal(messages: BetaMessageParam[], emit: Emit) {
  const mcp = await connectMcp();
  try {
    const { tools: mcpTools } = await mcp.listTools();
    // Sorted so the tool list is identical on every request (cache + thinking validity).
    const tools: BetaTool[] = [...mcpTools]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => ({
        name: t.name,
        description: t.description ?? "",
        input_schema: t.inputSchema as BetaTool["input_schema"],
        eager_input_streaming: true,
      }));

    for (let step = 0; step < settings.maxSteps; step++) {
      const stream = anthropic.beta.messages.stream({ ...baseParams(), betas: [FALLBACK_BETA], tools, messages });
      streamText(stream, emit);
      const msg = await stream.finalMessage();

      const stop = handleStop(msg, emit);
      if (stop === "refused") return false;
      messages.push({ role: "assistant", content: asParam(msg.content) });
      if (stop === "stop" || msg.stop_reason !== "tool_use") return true;

      const results: BetaToolResultBlockParam[] = [];
      for (const block of msg.content) {
        if (block.type !== "tool_use") continue;
        emit({ type: "tool_call", id: block.id, name: block.name, input: block.input });
        let text: string;
        let isError = false;
        let table;
        if (!block.input || typeof block.input !== "object") {
          text = "Tool input was not a valid JSON object. Please call the tool again.";
          isError = true;
        } else {
          try {
            const res = await mcp.callTool({ name: block.name, arguments: block.input as Record<string, unknown> });
            const content = (res.content ?? []) as { type: string; text?: string }[];
            text = content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n");
            isError = Boolean(res.isError);
            table = parseTable(res.structuredContent);
          } catch (err) {
            text = `Tool call failed: ${(err as Error).message}`;
            isError = true;
          }
        }
        emit({ type: "tool_result", id: block.id, isError, text, table });
        results.push({ type: "tool_result", tool_use_id: block.id, content: text, is_error: isError });
      }
      // All results for one assistant turn go back in a single user message.
      messages.push({ role: "user", content: results });
    }
    emit({ type: "notice", message: `Stopped after ${settings.maxSteps} tool steps.` });
    return true;
  } finally {
    await mcp.close().catch(() => {});
  }
}

/**
 * MCP_MODE=connector: Anthropic's API connects to the MCP server and runs the
 * tool calls itself. We only stream what happened.
 */
async function runConnector(messages: BetaMessageParam[], emit: Emit) {
  if (!settings.mcpPublicUrl) throw new Error("MCP_PUBLIC_URL must be set when MCP_MODE=connector.");
  for (let step = 0; step < settings.maxSteps; step++) {
    const stream = anthropic.beta.messages.stream({
      ...baseParams(),
      betas: [MCP_CONNECTOR_BETA, FALLBACK_BETA],
      mcp_servers: [
        { type: "url", url: settings.mcpPublicUrl, name: "db", authorization_token: settings.mcpApiKey },
      ],
      tools: [{ type: "mcp_toolset", mcp_server_name: "db" }],
      messages,
    });
    streamText(stream, emit);
    stream.on("contentBlock", (block) => {
      if (block.type === "mcp_tool_use") emit({ type: "tool_call", id: block.id, name: block.name, input: block.input });
      if (block.type === "mcp_tool_result") {
        const text = typeof block.content === "string" ? block.content : block.content.map((c) => c.text).join("\n");
        emit({ type: "tool_result", id: block.tool_use_id, isError: block.is_error, text, table: tableFromText(text) });
      }
    });
    const msg = await stream.finalMessage();

    const stop = handleStop(msg, emit);
    if (stop === "refused") return false;
    messages.push({ role: "assistant", content: asParam(msg.content) });
    // pause_turn: the server paused a long turn; send it back to let it continue.
    if (msg.stop_reason !== "pause_turn") return true;
  }
  return true;
}

/**
 * Run one user turn. `history` is what the previous turn's "done" event returned,
 * sent back unchanged: the conversation is append-only.
 */
export async function runTurn(history: BetaMessageParam[], userText: string, emit: Emit) {
  const today = new Date().toISOString().slice(0, 10);
  const messages: BetaMessageParam[] = [
    ...history,
    // The date goes in the user message (not the system prompt) so the prefix stays stable.
    { role: "user", content: [{ type: "text", text: `[Today is ${today}]\n${userText}` }] },
  ];
  const kept = settings.mode === "connector" ? await runConnector(messages, emit) : await runLocal(messages, emit);
  // On a refusal, drop this turn so the user can rephrase.
  emit({ type: "done", history: kept ? messages : history });
}

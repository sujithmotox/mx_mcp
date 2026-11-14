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
import { CHART_TOOL_NAME, ChartSpec, chartTool } from "./chartTool";

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

/** Handle render_chart locally: validate the spec and send it to the browser. */
function runChartTool(id: string, input: unknown, emit: Emit): { text: string; isError: boolean } {
  const parsed = ChartSpec.safeParse(input);
  if (!parsed.success) {
    const text = `Chart not drawn: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`;
    emit({ type: "tool_result", id, isError: true, text });
    return { text, isError: true };
  }
  emit({ type: "chart", id, spec: parsed.data });
  const text = `Chart "${parsed.data.title}" is now shown to the user. Do not repeat its numbers in full; summarise what it shows.`;
  emit({ type: "tool_result", id, isError: false, text });
  return { text, isError: false };
}

/**
 * MCP_MODE=local: this server is the MCP client. We list the MCP tools, hand
 * them to Claude as regular tools, and execute each tool call against MCP.
 */
async function runLocal(messages: BetaMessageParam[], emit: Emit, signal?: AbortSignal) {
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
    tools.push({ ...chartTool, eager_input_streaming: true });

    for (let step = 0; step < settings.maxSteps; step++) {
      const stream = anthropic.beta.messages.stream(
        { ...baseParams(), betas: [FALLBACK_BETA], tools, messages },
        { signal },
      );
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
        if (block.name === CHART_TOOL_NAME) {
          const r = runChartTool(block.id, block.input, emit);
          results.push({ type: "tool_result", tool_use_id: block.id, content: r.text, is_error: r.isError });
          continue;
        }
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
async function runConnector(messages: BetaMessageParam[], emit: Emit, signal?: AbortSignal) {
  if (!settings.mcpPublicUrl) throw new Error("MCP_PUBLIC_URL must be set when MCP_MODE=connector.");
  for (let step = 0; step < settings.maxSteps; step++) {
    const stream = anthropic.beta.messages.stream({
      ...baseParams(),
      betas: [MCP_CONNECTOR_BETA, FALLBACK_BETA],
      mcp_servers: [
        { type: "url", url: settings.mcpPublicUrl, name: "db", authorization_token: settings.mcpApiKey },
      ],
      tools: [{ type: "mcp_toolset", mcp_server_name: "db" }, { ...chartTool, eager_input_streaming: true }],
      messages,
    }, { signal });
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
    if (stop === "stop") return true;
    if (msg.stop_reason === "tool_use") {
      // Only render_chart runs here; MCP tools run on Anthropic's side.
      const results: BetaToolResultBlockParam[] = [];
      for (const block of msg.content) {
        if (block.type !== "tool_use") continue;
        emit({ type: "tool_call", id: block.id, name: block.name, input: block.input });
        const r =
          block.name === CHART_TOOL_NAME
            ? runChartTool(block.id, block.input, emit)
            : { text: `Unknown tool ${block.name}.`, isError: true };
        results.push({ type: "tool_result", tool_use_id: block.id, content: r.text, is_error: r.isError });
      }
      messages.push({ role: "user", content: results });
      continue;
    }
    // pause_turn: the server paused a long turn; send it back to let it continue.
    if (msg.stop_reason !== "pause_turn") return true;
  }
  return true;
}

/**
 * Run one user turn. `history` is what the previous turn's "done" event returned,
 * sent back unchanged: the conversation is append-only.
 */
export async function runTurn(history: BetaMessageParam[], userText: string, emit: Emit, signal?: AbortSignal) {
  const today = new Date().toISOString().slice(0, 10);
  const messages: BetaMessageParam[] = [
    ...history,
    // The date goes in the user message (not the system prompt) so the prefix stays stable.
    { role: "user", content: [{ type: "text", text: `[Today is ${today}]\n${userText}` }] },
  ];
  const kept = settings.mode === "connector" ? await runConnector(messages, emit, signal) : await runLocal(messages, emit, signal);
  // On a refusal, drop this turn so the user can rephrase.
  emit({ type: "done", history: kept ? messages : history });
}

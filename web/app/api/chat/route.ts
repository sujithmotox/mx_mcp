import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import { runTurn } from "@/lib/chat";
import type { ChatEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({
  message: z.string().trim().min(1).max(20000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.unknown() })).max(400).default([]),
});

function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key is missing or invalid.";
  if (err instanceof Anthropic.RateLimitError) return "Claude is rate limited right now. Try again in a moment.";
  if (err instanceof Anthropic.BadRequestError) return `Claude rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `Claude API error (${err.status ?? "network"}): ${err.message}`;
  const msg = err instanceof Error ? err.message : String(err);
  if (/ECONNREFUSED|fetch failed/i.test(msg)) return "Could not reach the MCP server. Is it running?";
  return msg;
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request body" }, { status: 400 });
  const { message, history } = parsed.data;

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: ChatEvent) => {
        if (req.signal.aborted) return;
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      };
      try {
        await runTurn(history as BetaMessageParam[], message, emit, req.signal);
      } catch (err) {
        if (req.signal.aborted) return; // the user pressed Stop
        console.error("chat turn failed", err);
        emit({ type: "error", message: describeError(err) });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed because the client went away
        }
      }
    },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

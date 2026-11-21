import { settings } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Is the MCP server (and through it, the database) reachable? */
export async function GET() {
  const url = new URL(settings.mcpUrl);
  url.pathname = "/health";
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
    return Response.json({ ok: res.ok && body.ok === true, model: settings.model });
  } catch {
    return Response.json({ ok: false, model: settings.model });
  }
}

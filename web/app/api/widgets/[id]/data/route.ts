import { checkEmbedToken, DateRangeQuery, getWidget, widgetData } from "@/lib/widgets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fresh data for one widget: re-runs its query (cached for 30 s unless ?fresh=1).
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD applies the dashboard's date filter.
 * Requests with ?t=<embed token> skip the app's basic auth (see proxy.ts) and can
 * only read this one widget.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  if (token !== null && !checkEmbedToken(id, token)) return Response.json({ error: "Invalid embed link." }, { status: 403 });

  const widget = await getWidget(id);
  if (!widget) return Response.json({ error: "This widget was removed." }, { status: 404 });

  let range;
  if (url.searchParams.has("from") || url.searchParams.has("to")) {
    const r = DateRangeQuery.safeParse({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
    if (!r.success) return Response.json({ error: "Invalid date range." }, { status: 400 });
    if (widget.spec.source.date_from) range = r.data;
  }

  try {
    const data = await widgetData(widget, range, url.searchParams.get("fresh") === "1");
    return Response.json({ widget, data, dateFiltered: Boolean(range) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const msg = (err as Error).message;
    const error = /ECONNREFUSED|fetch failed/i.test(msg) ? "Could not reach the MCP server." : msg;
    return Response.json({ widget, error }, { status: 502 });
  }
}

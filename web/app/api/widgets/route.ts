import { z } from "zod";
import { ChartSource, ChartSpec, inferDates } from "@/lib/chartTool";
import { isEmpty } from "@/lib/chartData";
import { createWidget, embedToken, listWidgets, runChart, WidgetSettings } from "@/lib/widgets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** All dashboard widgets, in display order. */
export async function GET() {
  const widgets = await listWidgets();
  return Response.json({ widgets, embedEnabled: Boolean(process.env.WIDGET_EMBED_SECRET) });
}

const Body = z.object({ settings: WidgetSettings, spec: z.unknown() });

/** Pin a chart. Its source is run once first, so a broken query is never saved. */
export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid widget." }, { status: 400 });
  const spec = ChartSpec.safeParse(body.data.spec);
  if (!spec.success) return Response.json({ error: "Invalid chart." }, { status: 400 });
  const source = ChartSource.safeParse(spec.data.source);
  if (!source.success)
    return Response.json({ error: "This chart doesn't say which query made it, so it can't be pinned. Ask for the chart again." }, { status: 400 });
  try {
    const data = await runChart(spec.data, inferDates(source.data));
    if (isEmpty(data.spec)) throw new Error("The query returned no rows.");
  } catch (err) {
    return Response.json({ error: `Couldn't re-run this chart's query: ${(err as Error).message}` }, { status: 422 });
  }
  const widget = await createWidget(body.data.settings, { ...spec.data, source: source.data });
  return Response.json({ widget, embedToken: embedToken(widget.id) }, { status: 201 });
}

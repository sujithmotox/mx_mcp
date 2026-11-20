import { deleteWidget, embedToken, getWidget, updateWidget, WidgetSettings } from "@/lib/widgets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const widget = await getWidget(id);
  if (!widget) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ widget, embedToken: embedToken(id) });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const patch = WidgetSettings.partial().safeParse(await req.json().catch(() => null));
  if (!patch.success) return Response.json({ error: "Invalid settings." }, { status: 400 });
  const widget = await updateWidget(id, patch.data);
  if (!widget) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ widget });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const ok = await deleteWidget(id);
  return ok ? new Response(null, { status: 204 }) : Response.json({ error: "Not found" }, { status: 404 });
}

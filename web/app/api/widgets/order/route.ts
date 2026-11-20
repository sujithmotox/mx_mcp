import { z } from "zod";
import { reorderWidgets } from "@/lib/widgets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const body = z.object({ ids: z.array(z.string().max(40)).max(500) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid order." }, { status: 400 });
  const widgets = await reorderWidgets(body.data.ids);
  return Response.json({ widgets });
}

import { notFound } from "next/navigation";
import { EmbedWidget } from "@/components/EmbedWidget";
import { checkEmbedToken, getWidget } from "@/lib/widgets";

export const dynamic = "force-dynamic";

/**
 * One widget on its own, for an <iframe> in another app:
 *   /embed/<id>?t=<token>[&theme=dark|light][&from=YYYY-MM-DD&to=YYYY-MM-DD]
 * The token comes from "Copy embed code" and only opens this widget.
 */
export default async function EmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const q = await searchParams;
  if (!checkEmbedToken(id, q.t ?? null)) notFound();
  const widget = await getWidget(id);
  if (!widget) notFound();
  const range = q.from && q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.from) && /^\d{4}-\d{2}-\d{2}$/.test(q.to) ? { from: q.from, to: q.to } : null;
  return <EmbedWidget widget={widget} token={q.t!} theme={q.theme === "dark" || q.theme === "light" ? q.theme : undefined} range={range} />;
}

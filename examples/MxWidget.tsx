/**
 * Show a pinned MotoXchange Data widget inside another Next.js (or React) app.
 *
 * 1. In the data chat app, set WIDGET_EMBED_SECRET in web/.env.local and restart it.
 * 2. On the dashboard, open a widget's menu and choose "Copy embed code".
 *    The copied link has the widget id and its token: /embed/<id>?t=<token>
 * 3. Copy this file into your app and use it:
 *
 *    <MxWidget
 *      baseUrl={process.env.NEXT_PUBLIC_MX_DATA_URL!}   // e.g. https://data.example.com
 *      id="k3j9x2mhz81"
 *      token="Q2h...xyz"
 *      height={380}
 *    />
 *
 * The token only opens that one widget (read-only). Anyone who has it can see
 * that widget's data, so only put it on pages that are already behind your login.
 */
type Props = {
  baseUrl: string;
  id: string;
  token: string;
  height?: number;
  theme?: "light" | "dark";
  /** Optional date filter, YYYY-MM-DD (only for widgets pinned with fixed dates). */
  from?: string;
  to?: string;
  title?: string;
  className?: string;
};

export function MxWidget({ baseUrl, id, token, height = 380, theme, from, to, title = "Data widget", className }: Props) {
  const q = new URLSearchParams({ t: token });
  if (theme) q.set("theme", theme);
  if (from && to) {
    q.set("from", from);
    q.set("to", to);
  }
  return (
    <iframe
      src={`${baseUrl.replace(/\/$/, "")}/embed/${encodeURIComponent(id)}?${q}`}
      title={title}
      width="100%"
      height={height}
      loading="lazy"
      className={className}
      style={{ border: 0, colorScheme: "normal", background: "transparent" }}
    />
  );
}

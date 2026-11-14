import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional HTTP basic auth for the whole app. Set WEB_BASIC_AUTH="user:password"
 * to turn it on. Anyone who can open the chat can read your data through it, so
 * put it behind your own login (or this) before exposing it.
 */
export function proxy(req: NextRequest) {
  const expected = process.env.WEB_BASIC_AUTH;
  if (!expected) return NextResponse.next();
  const header = req.headers.get("authorization") ?? "";
  if (header === `Basic ${btoa(expected)}`) return NextResponse.next();
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="data-chat"' },
  });
}

export const config = { matcher: "/((?!_next/static|_next/image|favicon.ico).*)" };

import { NextRequest, NextResponse } from "next/server";

/**
 * Production's switch while the app is rebuilt (phase 1, slice A).
 *
 * In production every path the matcher sees is rewritten to `/rebuilding`,
 * which says the app is being rebuilt; on a preview and in local development
 * everything passes through, so the destination explorer on /plan keeps
 * working where it is tested. Production showing "being rebuilt" for the
 * whole rebuild is the owner's decision of 2026-09-25 (master spec §0); the
 * phase 1 spec (§4) makes the Vercel environment the switch, since there is no
 * database or sign-in behind any of this to decide with.
 *
 * A rewrite, not a redirect: every URL keeps its address and answers with the
 * page, so nothing has to come back from a redirect once the rebuild lands.
 * `no-store` because next.config.ts gives the topology assets a day-long
 * public cache, and its headers run before the proxy: without it, a CDN or a
 * browser could keep "being rebuilt" parked under an asset's URL past the
 * rebuild.
 */
export function proxy(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "production") return NextResponse.next();

  return NextResponse.rewrite(new URL("/rebuilding", request.url), {
    headers: { "Cache-Control": "no-store" },
  });
}

// Everything but build output. A path left out here is a path production
// would serve in full rather than the "being rebuilt" page, which is why
// everything under public/ and /api/ stays in.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

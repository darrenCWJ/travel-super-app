import type { Metadata } from "next";
import Link from "next/link";

/**
 * What the app says while it is rebuilt (phase 1, slice A).
 *
 * The old store, sign-in and every page that needed them are retired, and
 * their replacements land in later slices. Until then each retired path
 * renders this, and production renders it on every path: `proxy.ts` rewrites
 * everything there to `/rebuilding` while `VERCEL_ENV` is `production`.
 *
 * A server component with no data, so it prerenders and renders the same for
 * everyone. The explorer link is opt-in because only the home page on a
 * preview or in local development has a working explorer to send anyone to.
 */
export const REBUILDING_METADATA: Metadata = {
  title: "Being rebuilt — Itinerary Planner",
  robots: { index: false, follow: false },
};

export function BeingRebuilt({ showExplorerLink = false }: { showExplorerLink?: boolean }) {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-12">
      <div className="rounded-2xl border-2 border-dashed border-[var(--line-1)] bg-[var(--paper)] p-6 sm:p-8">
        <h1 className="font-display text-3xl font-bold text-[var(--ink-0)] [text-wrap:balance]">
          Being rebuilt
        </h1>
        <p className="mt-3 text-base text-[var(--ink-1)]">
          This app is being rebuilt from the ground up. Trips, sign-in and sharing are switched off
          until the new version is ready.
        </p>
        {showExplorerLink && (
          <>
            <p className="mt-3 text-base text-[var(--ink-1)]">
              In the meantime, the destination explorer still works.
            </p>
            <Link
              href="/plan"
              className="mt-6 inline-flex min-h-[var(--tap-min)] items-center rounded-lg bg-[var(--accent-ink)] px-5 text-sm font-semibold text-[var(--paper)] transition-colors hover:bg-[color-mix(in_oklab,var(--accent-ink)_85%,var(--ink-0))]"
            >
              Explore destinations
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

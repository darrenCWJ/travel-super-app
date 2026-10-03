"use client";

import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

/**
 * The application frame (spec §2.3): persistent header and the bottom edge.
 *
 * While the app is rebuilt (phase 1, slice A) it is one frame for every route:
 * the brand link home and the display settings. The account chip, the trip
 * zone (switcher, trip name and dates, crew, Share) and the rail served sign-in
 * and the trip pages, which are retired; TripSwitcher, CrewMenu, ShareMenu,
 * ShareBriefing and RailNav stay in this folder, unmounted, until phase 4.
 *
 * Colours come from the semantic token set (`--surf-*`, `--ink-*`, `--line-*`)
 * via `var()` rather than Tailwind utilities. The old `@theme` colour palette
 * these tokens once had to avoid colliding with is gone (PR3), so `var()` is
 * simply how colour is expressed here now — and it is what lets the ramp swap
 * under `data-theme="dark"`.
 */

interface Props {
  children: React.ReactNode;
  /**
   * The display settings, defaulting to the real piece. A prop rather than
   * hardcoded so a test can render the frame without the preferences behind it.
   */
  themeToggle?: React.ReactNode;
}

export function AppShell({ children, themeToggle = <ThemeToggle /> }: Props) {
  return (
    <div
      // --surf-1 is #f1f5fa in light mode — the value the old mist palette
      // (now retired) gave the body — and a separate dark value (#161d27) in
      // dark mode; --paper is the white the old header used in light mode.
      // Assigning them this way round is what keeps the cutover invisible to
      // every page: content keeps its backdrop and the header keeps its
      // contrast. The reverse — which reads more naturally from the token
      // names — would flip every page from mist to white in one commit.
      className="flex min-h-dvh flex-col"
      style={{ background: "var(--surf-1)", color: "var(--ink-0)" }}
    >
      <header
        // border-b-2 border-dashed reproduces the boarding-pass strip from the
        // old header (--line-1 is the same #d9e7f4 the retired sky border was). The spec
        // redesigns the header's contents, not the project's ticket motif.
        className="flex items-center gap-3 border-b-2 border-dashed px-4 py-2 print:hidden"
        style={{
          borderColor: "var(--line-1)",
          background: "var(--paper)",
          paddingTop: "calc(0.5rem + var(--safe-top))",
          paddingRight: "calc(1rem + var(--safe-right))",
          paddingLeft: "calc(1rem + var(--safe-left))",
        }}
      >
        <Link
          href="/"
          className="flex min-h-[var(--tap-min)] items-center gap-2"
          style={{ color: "var(--ink-0)" }}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--seal)] font-kai text-lg text-[var(--paper)]">
            游
          </span>
          {/* The wordmark is desktop-only: §2.3 collapses the mobile header,
              and the brand is the first thing that should go. */}
          <span className="hidden font-display text-base font-bold leading-tight sm:inline">
            Itinerary Planner
          </span>
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-1">{themeToggle}</div>
      </header>

      {/*
        A div, not a <main>. Every page already renders its own <main> (/plan,
        and the "being rebuilt" page every retired route shows), and wrapping
        them in another one nests a landmark that the spec allows exactly one
        of — verified in the a11y tree as main-inside-main after this shell
        first mounted.
      */}
      <div className="min-w-0 flex-1">{children}</div>

      {/*
        C2 — the shell owns the bottom edge. This region exists empty so that no
        other component ever needs `position: fixed` at the bottom: the mobile
        bottom bar lands here, and Task 19 moves the wizard footer out of
        app/plan/page.tsx into normal flow. Two pinned bottom elements cannot
        coexist, so there is exactly one place for the second one to go.
      */}
      <div
        id="shell-bottom"
        className="print:hidden empty:hidden md:hidden"
        style={{ paddingBottom: "var(--safe-bottom)" }}
      />
    </div>
  );
}

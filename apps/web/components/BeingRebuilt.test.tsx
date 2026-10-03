import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { BeingRebuilt, REBUILDING_METADATA } from "./BeingRebuilt";

/**
 * The page every retired route answers with while the app is rebuilt, and the
 * one production shows on every path (phase 1, slice A).
 *
 * The jsdom project does not enable globals, so RTL's automatic cleanup never
 * registers; without this, renders would accumulate across cases.
 */
afterEach(cleanup);

const STATEMENT =
  "This app is being rebuilt from the ground up. Trips, sign-in and sharing are switched off until the new version is ready.";

describe("BeingRebuilt", () => {
  test("says the app is being rebuilt, in one main landmark with one heading", () => {
    render(<BeingRebuilt />);

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Being rebuilt" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(screen.getByText(STATEMENT)).toBeInTheDocument();
  });

  test("offers no way into the explorer unless it is asked to", () => {
    // Production rewrites every path to this page, the explorer included, so a
    // link there would lead straight back here.
    render(<BeingRebuilt />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/destination explorer/)).toBeNull();
  });

  test("links to the explorer when it is asked to", () => {
    render(<BeingRebuilt showExplorerLink />);

    expect(screen.getByText("In the meantime, the destination explorer still works.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore destinations" })).toHaveAttribute("href", "/plan");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  test("keeps every page that uses it out of search indexes", () => {
    expect(REBUILDING_METADATA.robots).toEqual({ index: false, follow: false });
    // The site's own pattern, as app/trip/[id]/page.tsx wrote it.
    expect(REBUILDING_METADATA.title).toBe("Being rebuilt — Itinerary Planner");
  });
});

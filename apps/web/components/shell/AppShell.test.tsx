import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AppShell } from "./AppShell";

/**
 * The plan declines a test for the shell on the grounds that it is visual
 * work, and the layout genuinely is — header rhythm and safe-area padding are
 * not things a jsdom assertion can judge honestly. What it renders is not.
 *
 * While the app is rebuilt (phase 1, slice A) the shell is one frame for every
 * route: the brand link home, the display settings and the bottom edge. The
 * account chip, the trip zone and the rail served sign-in and the trip pages,
 * which are retired; their components stay, unmounted, until phase 4.
 *
 * The route is mocked even though the shell no longer reads it, so that each
 * case below really is that route: the cases are the routes that used to get
 * a different frame — bare on /login, /signup and /b/, a rail on /trip/.
 */
const pathname = vi.hoisted(() => ({ current: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

function renderShellAt(path: string) {
  pathname.current = path;
  return render(
    <AppShell>
      <p>page body</p>
    </AppShell>
  );
}

describe("AppShell", () => {
  // The jsdom project does not enable globals, so RTL's automatic cleanup never
  // registers and renders would accumulate across cases. Same as
  // PrefsProvider.test.tsx.
  afterEach(cleanup);

  test.each(["/", "/plan", "/rebuilding", "/login", "/signup", "/b/abc123", "/trip/abc"])(
    "gives %s the same header: the brand link home and the display settings",
    (path) => {
      renderShellAt(path);

      expect(screen.getByText("page body")).toBeInTheDocument();
      const header = screen.getByRole("banner");
      expect(within(header).getByRole("link", { name: /Itinerary Planner/ })).toHaveAttribute("href", "/");
      expect(within(header).getByLabelText("Display settings")).toBeInTheDocument();
    }
  );

  test.each(["/plan", "/trip/abc"])("renders no account chip, trip zone or rail on %s", (path) => {
    renderShellAt(path);

    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Account menu/ })).toBeNull();
    expect(screen.queryByLabelText("Switch trip")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Trip sections" })).toBeNull();
  });

  test("keeps the bottom edge, the one place a pinned bottom element may go (C2)", () => {
    const { container } = renderShellAt("/plan");

    expect(container.querySelector("#shell-bottom")).not.toBeNull();
  });

  test("renders a theme slot it is given in place of the real one", () => {
    pathname.current = "/plan";
    render(
      <AppShell themeToggle={<button type="button">theme</button>}>
        <p>page body</p>
      </AppShell>
    );

    expect(within(screen.getByRole("banner")).getByRole("button", { name: "theme" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Display settings")).toBeNull();
  });
});

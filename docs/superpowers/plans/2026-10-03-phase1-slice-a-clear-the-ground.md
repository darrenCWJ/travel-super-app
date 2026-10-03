# Phase 1, slice A: clear the ground. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the old data layer, the old accounts and every route and page that needs them, so that the web app builds and runs with no database. Production shows "being rebuilt", and so do the retired pages. The destination explorer (`/plan`) keeps working signed out. The old repo name is replaced.

**Architecture:** Three pull requests, each of which leaves `main` green and deployable:

1. **PR A1** replaces the old repo name in the User-Agent strings, the links and the tests that pin them.
2. **PR A2** adds the "being rebuilt" page and turns `proxy.ts` from the login wall into the production switch. It also removes every live caller of the old routes: the explorer's last step, its lazy enrichment call, the shell's account and trip pieces, and the preferences sync. The browser tests move to signed out. After A2 the old code still exists, but nothing that renders reaches it.
3. **PR A3** deletes the old store, the accounts, 27 API routes, whatever only they used, their tests and their dependencies, and rewrites the documents that described them.

Spec: `docs/superpowers/specs/2026-10-02-phase1-platform-foundations-design.md`, §4 (slice A), framed by §1–§3 and §13. Its parent is the master spec, `docs/superpowers/specs/2026-09-24-travel-super-app-design.md`, §12 item 1.

**Tech Stack:** Next 16.3.6 (App Router; `proxy.ts` runs on the Node runtime), React 19.2.3, TypeScript 7.0.2, Vitest 4.1.11 (a node project and a jsdom project), Playwright 1.62.1, pnpm 10.34.6, Node 24. Nothing new is installed. Seven packages are removed: `better-auth`, `better-sqlite3`, `@types/better-sqlite3`, `pg`, `@types/pg`, `postgres` and `zod`.


## Global Constraints

Copied from the spec, and from facts checked on 2026-10-03. Every task's requirements include this section.

- **Scope is spec §4.** Gate (spec §3): "The site builds and runs with no database. The explorer and its browser tests pass on a preview. Production shows 'being rebuilt'."
- **No new screens** (spec §1) beyond the one "being rebuilt" page: "One static page with no data and no client code beyond the layout. In production, every route shows it; the switch is the Vercel environment, so previews and local development are unaffected. On previews and locally, the home page links to the explorer." (spec §4)
- **Deleted** (spec §4): `apps/web/lib/server/` `store.ts`, `tripStore.ts`, `pgStore.ts`, `db.ts`, `migrate.ts`, `auth.ts`, `session.ts`, `authz.ts`, "and whatever only they use"; "the 27 API routes that reach the store, the session or auth, wallets included"; the pages `/`, `/trip/[id]`, `/b/[code]`, `/account`, `/login` and `/signup` "as they are today", each of which "answers with the 'being rebuilt' page until its replacement lands"; the tests that pin the deleted code; the dependencies `better-sqlite3`, `postgres`, `pg` and `better-auth` ("`better-auth` goes too and returns in slice C"), the `allowBuilds` entry, and the SQLite lines in `.gitignore` and `.vercelignore`.
- **Kept, dormant** (spec §4): "The trip, money, tickets, journal and briefing components, their shared types and their unit tests. Nothing mounts them. Phase 4 moves them one feature at a time and deletes the old code in the same pull request." "A dormant file that no longer type-checks without the deleted server code is deleted now, and the execution record lists it."
- **Kept, working** (spec §4): the five reference-data routes (`/api/airports/search`, `/api/destinations`, `/api/destinations/resolve`, `/api/map/airports`, `/api/map/cities`); `/plan` as the explorer, whose "last step shows a 'trips are being rebuilt' note instead of creating a trip"; the nightly refresh workflows and the web suite they run.
- **The old repo name** `china-itinerary-planner` is replaced outside `docs/`. "The history documents keep the old name. The display name, the `CIP_` environment names and the `cip-` storage keys are not touched: the product name is phase 3's decision." (spec §4)
- **Hosting does not change in this slice** (spec §4): the Vercel project keeps its name and its `bom1` region, and no environment variable is added or removed. Slice B does all of that.
- **The behaviour of what is kept does not change.** Every Vitest test and Playwright spec that this plan does not delete or rewrite on purpose passes before and after every pull request. A count that moves for any other reason is a finding to explain, never a number to update. "Expected" lines in this plan are claims to check: report the real number.
- **Owner-only actions:** merging, Vercel project settings, and enabling or disabling workflows. The executing agent asks and waits; it never does these on its own (spec §10: "Merging stays the owner's, unless the owner says otherwise for a slice").
- **The owner's shell is PowerShell 5.1.** Every command a step tells the operator to run is written for it: no `VAR=x cmd`, no `&&` (use `;` and check `$?`). Bash appears only inside GitHub workflow files.
- **Windows App Control** blocks native binaries loaded from `%TEMP%` or a scratchpad. Next, Playwright and Vitest run only from the checkout (`C:\dev\travel-super-app`) or a `.claude/worktrees/<name>` under it. Every command in this plan runs from the root of the checkout the task works in, which is usually such a worktree. Never `cd` to the main checkout from a worktree's task.
- **Line endings.** Working copies are CRLF (`core.autocrlf=true`). `apps/web/.gitattributes`, the repo's only one, pins the committed data artifacts to LF. Edit files with the Edit and Write tools. A scripted `sed -i` from Git Bash turns a CRLF file into LF.
- **Merges are rebase-merges.** After every merge, rebase the next branch on `main` and re-run CI. Before deleting a branch, check that `gh pr view <n> --json state` says `MERGED`.
- **Never require `ci-ok` on `main`.** The refresh workflows push with the default token and get no CI run, so a required check would refuse their pushes (phase 0's execution record).
- **Commits:** conventional (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`), each ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Commit messages go through a pipe.** PowerShell 5.1 splits a `-m` argument at every embedded double quote, so `git commit -m @'…'@` fails on half of this plan's messages. Every commit below first sets two encodings, then pipes the message to `git commit -F -`:
  - `$OutputEncoding = New-Object System.Text.UTF8Encoding $false`. Without it, `—` and `§` arrive as `?`.
  - `[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false`. Without it, a host whose console encoding carries a byte-order mark (the agents' PowerShell tool does) puts `EF BB BF` before the message's first letter. Task 1's first commit got one that way, on 2026-10-03.

  After every commit, `[int][char](git log -1 --format="x%B")[0][1]` must print the code of the message's first letter: 99 (`c`), 100 (`d`), 102 (`f`) or 114 (`r`). It must never print 65279, which is a byte-order mark. If it does, amend the unpushed commit with the encodings set.
- **Applying the diffs below.** Use the Edit tool. If you use `git apply` instead, run `git apply --cached <patch>` and then `git checkout -- <files>`. A plain `git apply` fails, because the working copies are CRLF and the patches are not.
- **`next-env.d.ts`.** `next dev` and `next build` rewrite `apps/web/next-env.d.ts`. Put it back with `git checkout -- apps/web/next-env.d.ts` before every commit; it is never part of this slice's changes.
- **Files stay under 800 lines**, except the five test files the owner already exempted.
- **Each slice ends the way phase 0 did** (spec §3): "a review per task, a whole-branch review, Fable's final pass, and an execution record in its plan."


## Decisions this plan takes

The spec leaves these open, or the code contradicted it. Each one takes the default below; the owner can override any of them before the task that uses it.

| # | Decision | Why |
|---|---|---|
| A-D1 | Three pull requests: A1 the repo name, A2 "being rebuilt" and the explorer standing alone, A3 the deletions. | Each is reviewable on its own and leaves `main` deployable. A2 before A3 means the deletions remove only code nothing reachable uses, so A3's diff is almost entirely red. |
| A-D2 | The production switch lives in `proxy.ts`. It reads `VERCEL_ENV` on every request and, when that is `production`, rewrites every matched path to `/rebuilding` with `Cache-Control: no-store`. The page is `noindex`. The answer is a rewrite (status 200), not a 503. | One place decides, and the pages stay static and know nothing of the environment. The proxy runs on Vercel before the CDN cache, so prerendered pages are covered. A 503 would need a hand-built response instead of the real page. |
| A-D3 | Each retired page (`/`, `/trip/[id]`, `/b/[code]`, `/account`, `/login`, `/signup`) becomes a stub file that renders the shared component, rather than a rewrite in the proxy. | A later slice replaces each path by replacing its file, where a proxy entry would silently shadow the new page until someone remembered to remove it. |
| A-D4 | The login wall (`lib/wall.ts`), the secret check (`lib/authSecret.ts`) and the boot check (`instrumentation.ts`) are deleted with the accounts. | They guard sessions that no longer exist. Slice C builds the new wall for `/app`, `/admin` and `/account` on the new identity (spec §6). |
| A-D5 | `/api/cities/enrich` is deleted as the spec says, although `/plan` called it: the explorer's lazy description fetch for a picked city is removed, so a city outside its country's build-time top 30 shows no blurb. `lib/server/cityEnrichment.ts` and `shouldFetchEnrichment` stay, dormant, with their tests. | The route needs a session, and it is the one route that calls a third party on a visitor's behalf, so it should not reopen without a gate. A missing blurb is an accepted state in the explorer (`app/plan/page.tsx`). Phase 4 rebuilds the reference routes under `reference/`. The owner may instead keep the route with its session check removed: nothing is public until phase 6. |
| A-D6 | The README keeps the Vercel domain `china-itinerary-planner.vercel.app`. | It is the Vercel project's name, not the repo's, and slice B renames the project. |
| A-D7 | `components/home/TripsDashboard.tsx` goes with the old home page. The shell's trip pieces (`TripSwitcher`, `CrewMenu`, `ShareMenu`, `ShareBriefing`, `RailNav`) stay, unmounted. | The dashboard is the old home page's account-linked list. The shell pieces are trip components that phase 3 and 4 rebuild from. |
| A-D8 | Every browser test runs signed out. `wall.spec.ts`, `gateways.spec.ts` and `tickets.spec.ts` are deleted, and `rebuilding.spec.ts` is added. | The wall is gone, and the other two create trips through deleted routes. The new spec covers the stubs and checks that the explorer calls only the five kept routes. |
| A-D9 | "Pass on a preview" is checked three ways: CI's `e2e` job on the pull request, the owner opening the pull request's preview, and, after the merge, `curl` against production. | Previews sit behind Vercel's own sign-in, which an agent cannot pass, and Playwright against a preview would need a bypass secret this slice does not create. |
| A-D10 | `components/TripView.tsx` stays dormant. Its session read from the retired auth client becomes `const session = null` and `sessionPending = false`. | Spec §4 deletes "a dormant file that no longer type-checks without the deleted server code", but the auth client is not server code. Deleting TripView would also orphan `useTripPayload`, `tripPayloadCore` and `myTrips`, and force C4, C7 and the country-facts walk to be restructured, all for a page phase 4 rewrites anyway. The owner may prefer the deletion. |
| A-D11 | The ignore lines for the old store's local files (`app.db*`, `uploads/` and `e2e/.auth/`) all go in A3, with the spec's SQLite lines. The owner's checkout is cleaned the same day (Task 12). | The repo is public. Once the lines are gone, a stale `app.db` holding local accounts could be committed by a careless `git add -A`. |
| A-D12 | `lib/rates.ts` and `lib/server/planService.ts` are deleted, although tests still import them, and `zod` goes with `rates.ts`, its last importer. | Each served only a retired route: `/api/rates`, and trip creation and update. Spec §4 deletes "whatever only they use", and a module kept alive by tests alone is dead code. `money.test.ts` loses one guard, which only checked the retired rates allowlist. The worldwide-plan tests keep every assertion, rebuilt on the live generators `planService` wrapped. Zod returns with slice D's commands, in `@tsa/platform`. |


## PR map

| Order | Branch | Tasks | Merge gate |
|---|---|---|---|
| PR A1 | `chore/repo-name` | 1 | CI green; the preview is Ready |
| PR A2 | `feat/being-rebuilt` | 2–7 | CI green; the owner has looked at the preview; the browser glance is done; after the merge, production answers "being rebuilt" on every path, uncached |
| PR A3 | `refactor/retire-old-store` | 8–12 | CI green; the owner has looked at the preview; after the merge, production still answers "being rebuilt" and the stale local files are gone from the owner's checkout. This closes slice A's gate |
| — | (close-out) | 13 | The whole-branch review and Fable's final pass are clean, the execution record is written, and the memory is updated |

- **Who does what.** Tasks 7, 12 and 13 belong to the controlling session and the owner; do not hand them to a subagent. Every other task suits an implementer subagent working in its own worktree under `.claude/worktrees/`.
- **Merging** is the owner's (spec §10). At the start of execution, ask the owner whether the controlling session may merge a pull request of this slice once its CI is green and its reviews are clean, as the owner allowed for most of phase 0.
- **Branching.** Each pull request branches from `main` after the previous one has merged. Rebase-merges rewrite SHAs, so a branch cut from an unmerged one would need rebasing anyway.
- **Before any of this:** the docs pull request that carries the phase 1 spec and this plan should be merged, so that Task 13 can append the execution record to this file on `main`.

## Files at a glance

| | PR A2 | PR A3 |
|---|---|---|
| Created | `components/BeingRebuilt.tsx` and its test, `app/rebuilding/page.tsx`, `e2e/rebuilding.spec.ts` | none |
| Rewritten | `proxy.ts` and `lib/proxy.test.ts`, `playwright.config.ts`, `components/shell/AppShell.tsx` and its test, and the six retired pages (stubs) | `README.md`, `.env.example` |
| Edited | `PlanStep.tsx`, `app/plan/page.tsx`, `PrefsProvider.tsx`, `next.config.ts` (a comment), and the tests and contracts that pin them | `TripView.tsx` (its session read), `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `next.config.ts`, the ignore files, the contracts, and comments in 37 files |
| Deleted | `lib/wall.ts` and its test; `e2e/auth.setup.ts`, `wall.spec.ts`, `gateways.spec.ts` and `tickets.spec.ts` | 72 files: 27 API routes, the stores and accounts, what only they used, and the tests of all of these (Tasks 8 and 9) |

All paths are under `apps/web/` except `README.md`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.gitignore` and `tools/boundaries/src/repo.test.ts`.

## Where the code in this plan comes from

Every code block below was written and run before this plan was written. A throwaway spike did slice A for real on 2026-10-03, in `.claude/worktrees/spike-slice-a`, with one commit per task. Each commit left the type-check and the unit tests green, and the browser tests too at Tasks 3, 4, 6 and 11. The blocks below are those commits' files and diffs, inlined by a script rather than retyped. The expected failures and counts quoted in each task are the ones that run printed.

What the spike measured against `main` at 477569e:

| Check | `main` (with Task 1) | After A2 (Task 6) | After A3 (Task 11) |
|---|---|---|---|
| Web typecheck | green | green | green |
| Web unit tests | 167 files: 2,766 passed, 1 expected fail | 167 files: 2,758 passed, 1 expected fail | 146 files: 2,528 passed, 1 expected fail |
| Web build | 40 routes, 4 warnings | 41 routes, 4 warnings | 14 routes, 2 warnings |
| Playwright | 24 passed | 25 passed | 25 passed |
| registry-gen, boundaries | 23, 562 | 23, 562 | 23, 562 |
| Boundaries repo, ci and lockfile tests | 162 | 162 | 162 |
| Mobile typecheck, jest | green, 1 | green, 1 | green, 1 |

The machine was loaded during the spike: an Android emulator took about two cores. In one full run, `CountryMap.test.tsx` timed out at 5 s, and it passed when run alone. Treat a timeout in a map test the same way, and report it.

The spike's report, logs and per-task diffs are in `.superpowers/sdd/spike-a/`, which is gitignored and exists only on the owner's machine. The plan does not depend on it.


---

### Task 1: Replace the old repo name (PR A1)

**Who:** an implementer subagent for Steps 1–9; the controlling session for Step 10.

**Files:**
- Modify: `apps/web/scripts/user-agent.test.ts` (the contact pattern, and the test that refuses retired tokens)
- Modify: the three tests that pin a User-Agent value: `apps/web/lib/server/cityEnrichment.test.ts`, `apps/web/scripts/country-facts/io.test.ts`, `apps/web/scripts/enrich/io.test.ts`
- Modify: the eleven User-Agent constants, in `apps/web/lib/server/cityEnrichment.ts`, `apps/web/scripts/build-globe-topology.mjs`, `apps/web/scripts/build-provinces.mjs`, `apps/web/scripts/build-world-topology.mjs`, `apps/web/scripts/cities/io.mjs`, `apps/web/scripts/climate/acquire.mjs`, `apps/web/scripts/country-facts/io.mjs`, `apps/web/scripts/enrich/io.mjs`, `apps/web/scripts/ingest-airports.mjs`, `apps/web/scripts/ingest-country-images.mjs` and `apps/web/scripts/ingest-destinations.mjs`
- Modify: `apps/web/lib/server/catalog.ts` (the raw catalog URL) and `README.md` (the source link only)

**Interfaces:**
- Consumes: nothing.
- Produces: every outbound User-Agent reads `travel-super-app/<script> (+https://github.com/darrenCWJ/travel-super-app)`, and `scripts/user-agent.test.ts` refuses both retired product tokens, `ChinaItineraryPlanner/` and `china-itinerary-planner/`.

**Not changed:** the Vercel domain `china-itinerary-planner.vercel.app` (README lines 3 and 203; slice B renames the project, decision A-D6), the display name, the `CIP_` environment names, the `cip-` storage keys, and everything under `docs/`.

- [ ] **Step 1: Branch** (in the worktree the controlling session made for this pull request)

```powershell
git fetch origin
git switch -c chore/repo-name origin/main
```

- [ ] **Step 2: Write the failing test.** Apply this change to `apps/web/scripts/user-agent.test.ts`:

```diff
diff --git a/apps/web/scripts/user-agent.test.ts b/apps/web/scripts/user-agent.test.ts
index ce3d894..1b1b1dd 100644
--- a/apps/web/scripts/user-agent.test.ts
+++ b/apps/web/scripts/user-agent.test.ts
@@ -92,7 +92,7 @@ function declarationsIn(text: string): string[] {
  * refuses an email address added after the URL, not only a missing URL.
  */
 const CONTACT_FORM =
-  /^china-itinerary-planner\/[a-z0-9]+(?:-[a-z0-9]+)* \(\+https:\/\/github\.com\/darrenCWJ\/china-itinerary-planner\)$/;
+  /^travel-super-app\/[a-z0-9]+(?:-[a-z0-9]+)* \(\+https:\/\/github\.com\/darrenCWJ\/travel-super-app\)$/;
 
 /**
  * A Wikimedia project host in a URL, http or https, with any subdomain — a
@@ -203,12 +203,15 @@ describe("every outbound User-Agent carries contact information", () => {
     expect(offenders).toEqual([]);
   });
 
-  it("the retired User-Agent is gone from the code, in whatever syntax", () => {
-    // docs/ keeps it on purpose — a plan is a record of what it prescribed —
-    // and a plan is exactly where a new script would copy it from. The checks
+  it("the retired User-Agents are gone from the code, in whatever syntax", () => {
+    // docs/ keeps them on purpose — a plan is a record of what it prescribed —
+    // and a plan is exactly where a new script would copy one from. The checks
     // above only see the declaration shapes; this sees any spelling, comments
-    // included, which is why no source file quotes it even to explain it.
-    const stale = FILES.filter((file) => file.text.includes("ChinaItineraryPlanner/")).map((file) => file.path);
+    // included, which is why no source file quotes either even to explain it.
+    // The second is the product token from before the repo was renamed to
+    // travel-super-app.
+    const RETIRED = ["ChinaItineraryPlanner/", "china-itinerary-planner/"];
+    const stale = FILES.filter((file) => RETIRED.some((token) => file.text.includes(token))).map((file) => file.path);
     expect(stale).toEqual([]);
   });
 
@@ -224,11 +227,13 @@ describe("every outbound User-Agent carries contact information", () => {
 
     expect(retired).not.toMatch(CONTACT_FORM);
     expect(
-      "china-itinerary-planner/enrich-cities (+https://github.com/darrenCWJ/china-itinerary-planner; ops@example.invalid)"
+      "travel-super-app/enrich-cities (+https://github.com/darrenCWJ/travel-super-app; ops@example.invalid)"
+    ).not.toMatch(CONTACT_FORM);
+    expect("travel-super-app/build-provinces (+https://github.com/darrenCWJ/travel-super-app)").toMatch(CONTACT_FORM);
+    // The form from before the rename is refused too, so it cannot come back.
+    expect(
+      "china-itinerary-planner/build-provinces (+https://github.com/darrenCWJ/china-itinerary-planner)"
     ).not.toMatch(CONTACT_FORM);
-    expect("china-itinerary-planner/build-provinces (+https://github.com/darrenCWJ/china-itinerary-planner)").toMatch(
-      CONTACT_FORM
-    );
   });
 
   it("still recognises a Wikimedia caller that builds its host or goes through a helper", () => {
```

- [ ] **Step 3: Run it and watch it fail**

```powershell
pnpm --filter @tsa/web --fail-if-no-match exec vitest run scripts/user-agent.test.ts
```
Expected: 3 failed, 4 passed (7). The three failures read `AssertionError: expected [ …(11) ] to deeply equal []`, `AssertionError: expected [ …(5) ] to deeply equal []` and `AssertionError: expected [ …(12) ] to deeply equal []`: every declaration still carries the old name.

- [ ] **Step 4: Change the three value pins**

```diff
diff --git a/apps/web/lib/server/cityEnrichment.test.ts b/apps/web/lib/server/cityEnrichment.test.ts
index f43081e..5a7619e 100644
--- a/apps/web/lib/server/cityEnrichment.test.ts
+++ b/apps/web/lib/server/cityEnrichment.test.ts
@@ -114,7 +114,7 @@ describe("enrichCities", () => {
     const init = mock.mock.calls[0]?.[1] as RequestInit | undefined;
     // Through `Headers`, because header names are case-insensitive on the wire.
     expect(new Headers(init?.headers).get("user-agent")).toBe(
-      "china-itinerary-planner/city-enrichment (+https://github.com/darrenCWJ/china-itinerary-planner)"
+      "travel-super-app/city-enrichment (+https://github.com/darrenCWJ/travel-super-app)"
     );
   });
 
diff --git a/apps/web/scripts/country-facts/io.test.ts b/apps/web/scripts/country-facts/io.test.ts
index 90996ae..f8b553f 100644
--- a/apps/web/scripts/country-facts/io.test.ts
+++ b/apps/web/scripts/country-facts/io.test.ts
@@ -88,7 +88,7 @@ describe("fetchWithRetry", () => {
     viTop.stubGlobal("fetch", fetchSpy);
     await fetchWithRetry("https://example.invalid/sparql", { body: "query=x", accept: "text/csv" });
     expect(new Headers(fetchSpy.mock.calls[0][1].headers).get("user-agent")).toBe(
-      "china-itinerary-planner/ingest-country-facts (+https://github.com/darrenCWJ/china-itinerary-planner)"
+      "travel-super-app/ingest-country-facts (+https://github.com/darrenCWJ/travel-super-app)"
     );
   });
 
diff --git a/apps/web/scripts/enrich/io.test.ts b/apps/web/scripts/enrich/io.test.ts
index a64d935..d52d318 100644
--- a/apps/web/scripts/enrich/io.test.ts
+++ b/apps/web/scripts/enrich/io.test.ts
@@ -37,7 +37,7 @@ describe("the User-Agent", () => {
     vi.unstubAllGlobals();
   });
 
-  const EXPECTED = "china-itinerary-planner/enrich-cities (+https://github.com/darrenCWJ/china-itinerary-planner)";
+  const EXPECTED = "travel-super-app/enrich-cities (+https://github.com/darrenCWJ/travel-super-app)";
 
   /** A stand-in `fetch` that answers every request with `body`, and remembers what it was sent. */
   const answering = (body: unknown) => {
```

- [ ] **Step 5: Run them and watch them fail**

```powershell
pnpm --filter @tsa/web --fail-if-no-match exec vitest run lib/server/cityEnrichment.test.ts scripts/country-facts/io.test.ts scripts/enrich/io.test.ts
```
Expected: 4 failed, 43 passed (47). Each failure has the shape `AssertionError: expected 'china-itinerary-planner/city-enrichme…' to be 'travel-super-app/city-enrichment (+ht…' // Object.is equality`. The same shape appears for `ingest-country-facts`, and twice for `enrich-cities`.

- [ ] **Step 6: Replace the name in the constants, the catalog URL and the README's source link.** Use the Edit tool: a scripted `sed -i` turns these CRLF working files into LF.

```diff
diff --git a/README.md b/README.md
index b9d8fff..279e2fb 100644
--- a/README.md
+++ b/README.md
@@ -1,6 +1,6 @@
 # China Itinerary Planner 游
 
-**Live**: <https://china-itinerary-planner.vercel.app> · **Source**: <https://github.com/darrenCWJ/china-itinerary-planner>
+**Live**: <https://china-itinerary-planner.vercel.app> · **Source**: <https://github.com/darrenCWJ/travel-super-app>
 
 Plan a trip to any country in three steps — pick places on a globe and a
 country map, say when and who is going, get a day-by-day plan — then take
diff --git a/apps/web/lib/server/catalog.ts b/apps/web/lib/server/catalog.ts
index 4314267..be8734b 100644
--- a/apps/web/lib/server/catalog.ts
+++ b/apps/web/lib/server/catalog.ts
@@ -142,7 +142,7 @@ export function loadCatalog(): Catalog | null {
 }
 
 const DEFAULT_CATALOG_URL =
-  "https://raw.githubusercontent.com/darrenCWJ/china-itinerary-planner/main/apps/web/data/catalog.json";
+  "https://raw.githubusercontent.com/darrenCWJ/travel-super-app/main/apps/web/data/catalog.json";
 
 let remoteLoad: Promise<void> | null = null;
 
diff --git a/apps/web/lib/server/cityEnrichment.ts b/apps/web/lib/server/cityEnrichment.ts
index e41c1ce..b264512 100644
--- a/apps/web/lib/server/cityEnrichment.ts
+++ b/apps/web/lib/server/cityEnrichment.ts
@@ -55,7 +55,7 @@ const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
  * network rather than a runner's, and a name is all Wikimedia has to tell the
  * two apart.
  */
-const USER_AGENT = "china-itinerary-planner/city-enrichment (+https://github.com/darrenCWJ/china-itinerary-planner)";
+const USER_AGENT = "travel-super-app/city-enrichment (+https://github.com/darrenCWJ/travel-super-app)";
 const TIMEOUT_MS = 15_000;
 /**
  * A user is waiting on this, so it is one round trip and no retries.
diff --git a/apps/web/scripts/build-globe-topology.mjs b/apps/web/scripts/build-globe-topology.mjs
index 8df38cd..997b493 100644
--- a/apps/web/scripts/build-globe-topology.mjs
+++ b/apps/web/scripts/build-globe-topology.mjs
@@ -48,7 +48,7 @@ const WORLD_PATH = join(ROOT_DIR, 'public', 'world-countries.json');
 /** Pinned to the major, exactly as the 50m build pins its own source. */
 const SOURCE_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
 const SOURCE_LICENSE = 'Public domain (Natural Earth 1:110m, via world-atlas@2)';
-const USER_AGENT = 'china-itinerary-planner/build-globe-topology (+https://github.com/darrenCWJ/china-itinerary-planner)';
+const USER_AGENT = 'travel-super-app/build-globe-topology (+https://github.com/darrenCWJ/travel-super-app)';
 
 const FETCH_TIMEOUT_MS = 60_000;
 const RETRY_DELAYS_MS = [2_000, 8_000];
diff --git a/apps/web/scripts/build-provinces.mjs b/apps/web/scripts/build-provinces.mjs
index b16cec1..f2e6f20 100644
--- a/apps/web/scripts/build-provinces.mjs
+++ b/apps/web/scripts/build-provinces.mjs
@@ -408,7 +408,7 @@ const SHARD_DIR = join(process.cwd(), 'public', 'cities');
 const CURATED_PATH = join(process.cwd(), 'public', 'china-provinces.json');
 const REPORT_PATH = join(process.cwd(), 'data', 'provinces-report.md');
 const RETRY_DELAYS_MS = [2000, 8000];
-const USER_AGENT = 'china-itinerary-planner/build-provinces (+https://github.com/darrenCWJ/china-itinerary-planner)';
+const USER_AGENT = 'travel-super-app/build-provinces (+https://github.com/darrenCWJ/travel-super-app)';
 
 /**
  * Write via a PID-suffixed temp file, removing the destination first.
diff --git a/apps/web/scripts/build-world-topology.mjs b/apps/web/scripts/build-world-topology.mjs
index c738717..994c6ec 100644
--- a/apps/web/scripts/build-world-topology.mjs
+++ b/apps/web/scripts/build-world-topology.mjs
@@ -50,7 +50,7 @@ const OUT_PATH = join(ROOT_DIR, 'public', 'world-countries.json');
  */
 const SOURCE_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json';
 const SOURCE_LICENSE = 'Public domain (Natural Earth 1:50m, via world-atlas@2)';
-const USER_AGENT = 'china-itinerary-planner/build-world-topology (+https://github.com/darrenCWJ/china-itinerary-planner)';
+const USER_AGENT = 'travel-super-app/build-world-topology (+https://github.com/darrenCWJ/travel-super-app)';
 
 const FETCH_TIMEOUT_MS = 60_000;
 const RETRY_DELAYS_MS = [2_000, 8_000];
diff --git a/apps/web/scripts/cities/io.mjs b/apps/web/scripts/cities/io.mjs
index 661de99..119b36e 100644
--- a/apps/web/scripts/cities/io.mjs
+++ b/apps/web/scripts/cities/io.mjs
@@ -57,7 +57,7 @@ const ADMIN1_URL = 'https://download.geonames.org/export/dump/admin1CodesASCII.t
  */
 export const SOURCE_LICENSE = 'GeoNames cities500 (CC BY 4.0)';
 export const SOURCE_ATTRIBUTION = 'https://www.geonames.org/ — CC BY 4.0';
-const USER_AGENT = 'china-itinerary-planner/ingest-cities (+https://github.com/darrenCWJ/china-itinerary-planner)';
+const USER_AGENT = 'travel-super-app/ingest-cities (+https://github.com/darrenCWJ/travel-super-app)';
 
 /** 13.5 MB over a CI network. Airports' 120s is not enough headroom for it. */
 const FETCH_TIMEOUT_MS = 300_000;
diff --git a/apps/web/scripts/climate/acquire.mjs b/apps/web/scripts/climate/acquire.mjs
index 51e8074..aa855cf 100644
--- a/apps/web/scripts/climate/acquire.mjs
+++ b/apps/web/scripts/climate/acquire.mjs
@@ -125,7 +125,7 @@ export function readCatalog() {
 
 const RETRY_DELAYS_MS = [2000, 8000];
 const USER_AGENT =
-  'china-itinerary-planner/ingest-climate (+https://github.com/darrenCWJ/china-itinerary-planner)';
+  'travel-super-app/ingest-climate (+https://github.com/darrenCWJ/travel-super-app)';
 
 /**
  * A ceiling on one download, scaled to the file rather than fixed.
diff --git a/apps/web/scripts/country-facts/io.mjs b/apps/web/scripts/country-facts/io.mjs
index 9e2fe3d..b16b207 100644
--- a/apps/web/scripts/country-facts/io.mjs
+++ b/apps/web/scripts/country-facts/io.mjs
@@ -74,7 +74,7 @@ export const SOURCE_NAME = 'Wikidata (CC0)';
  * scripts/user-agent.test.ts has the finding and pins this form across the
  * tree.
  */
-const USER_AGENT = 'china-itinerary-planner/ingest-country-facts (+https://github.com/darrenCWJ/china-itinerary-planner)';
+const USER_AGENT = 'travel-super-app/ingest-country-facts (+https://github.com/darrenCWJ/travel-super-app)';
 
 /**
  * The country universe this ingest asks about: every code the app ships a city
diff --git a/apps/web/scripts/enrich/io.mjs b/apps/web/scripts/enrich/io.mjs
index 806f48c..c0424eb 100644
--- a/apps/web/scripts/enrich/io.mjs
+++ b/apps/web/scripts/enrich/io.mjs
@@ -36,7 +36,7 @@ const ENWIKI_ACTION_API = 'https://en.wikipedia.org/w/api.php';
  * HTTP 403 from Wikidata that day — scripts/user-agent.test.ts has the finding
  * and pins this form across the tree.
  */
-const USER_AGENT = 'china-itinerary-planner/enrich-cities (+https://github.com/darrenCWJ/china-itinerary-planner)';
+const USER_AGENT = 'travel-super-app/enrich-cities (+https://github.com/darrenCWJ/travel-super-app)';
 
 const SPARQL_TIMEOUT_MS = 90_000;
 const REST_TIMEOUT_MS = 30_000;
diff --git a/apps/web/scripts/ingest-airports.mjs b/apps/web/scripts/ingest-airports.mjs
index d05f5f0..e001cc9 100644
--- a/apps/web/scripts/ingest-airports.mjs
+++ b/apps/web/scripts/ingest-airports.mjs
@@ -47,7 +47,7 @@ const REPORT_PATH = join(DATA_DIR, 'airports-report.md');
 
 const SOURCE_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
 const SOURCE_LICENSE = 'Public domain (OurAirports, regenerated nightly)';
-const USER_AGENT = 'china-itinerary-planner/ingest-airports (+https://github.com/darrenCWJ/china-itinerary-planner)';
+const USER_AGENT = 'travel-super-app/ingest-airports (+https://github.com/darrenCWJ/travel-super-app)';
 
 const FETCH_TIMEOUT_MS = 120_000;
 const RETRY_DELAYS_MS = [2_000, 8_000];
diff --git a/apps/web/scripts/ingest-country-images.mjs b/apps/web/scripts/ingest-country-images.mjs
index a928ea0..009b97a 100644
--- a/apps/web/scripts/ingest-country-images.mjs
+++ b/apps/web/scripts/ingest-country-images.mjs
@@ -37,7 +37,7 @@ const OUTPUT_PATH = join(DATA_DIR, 'country-images.json');
 const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
 const COMMONS_ACTION_API = 'https://commons.wikimedia.org/w/api.php';
 /** Contact information, as Wikimedia's User-Agent policy requires of both hosts above — scripts/user-agent.test.ts. */
-const USER_AGENT = 'china-itinerary-planner/ingest-country-images (+https://github.com/darrenCWJ/china-itinerary-planner)';
+const USER_AGENT = 'travel-super-app/ingest-country-images (+https://github.com/darrenCWJ/travel-super-app)';
 
 const SPARQL_TIMEOUT_MS = 90_000;
 const REST_TIMEOUT_MS = 30_000;
diff --git a/apps/web/scripts/ingest-destinations.mjs b/apps/web/scripts/ingest-destinations.mjs
index 97a3bf1..2323112 100644
--- a/apps/web/scripts/ingest-destinations.mjs
+++ b/apps/web/scripts/ingest-destinations.mjs
@@ -34,7 +34,7 @@ const REPORT_PATH = join(DATA_DIR, 'catalog-report.md');
 const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
 const ENWIKI_ACTION_API = 'https://en.wikipedia.org/w/api.php';
 /** Contact information, as Wikimedia's User-Agent policy requires of both hosts above — scripts/user-agent.test.ts. */
-const USER_AGENT = 'china-itinerary-planner/ingest-destinations (+https://github.com/darrenCWJ/china-itinerary-planner)';
+const USER_AGENT = 'travel-super-app/ingest-destinations (+https://github.com/darrenCWJ/travel-super-app)';
 
 const SPARQL_TIMEOUT_MS = 90_000;
 const REST_TIMEOUT_MS = 30_000;
```

- [ ] **Step 7: Run the four files, then everything**

```powershell
pnpm --filter @tsa/web --fail-if-no-match exec vitest run scripts/user-agent.test.ts lib/server/cityEnrichment.test.ts scripts/country-facts/io.test.ts scripts/enrich/io.test.ts
pnpm --filter @tsa/web --fail-if-no-match typecheck
pnpm --filter @tsa/web --fail-if-no-match test
pnpm --filter @tsa/web --fail-if-no-match build
pnpm --filter @tsa/web --fail-if-no-match exec playwright test
```
Expected:
- The four files: 54 passed.
- typecheck: clean.
- test: 167 files, 2,766 passed and 1 expected fail (the spike's run on 2026-10-03).
- build: green.
- Playwright: 24 passed.

On a loaded machine, `CountryMap.test.tsx`, `GlobeLevel.test.tsx` and `MapExplorer.test.tsx` can time out in a full run (5 such timeouts on `main` itself in the spike's baseline). Re-run a timed-out file alone before believing it, and report the CPU picture: `Get-Process | Sort-Object CPU -Descending | Select-Object -First 8`.

- [ ] **Step 8: Check what is left, and that the new URL answers**

```powershell
git grep -n china-itinerary-planner -- ':!docs'
curl.exe -s -o NUL -w "%{http_code} %{size_download}`n" https://raw.githubusercontent.com/darrenCWJ/travel-super-app/main/apps/web/data/catalog.json
```
Expected:
- Exactly four lines from `git grep`: `README.md:3` and `README.md:203` (the Vercel domain), and `apps/web/scripts/user-agent.test.ts:213` and `:235` (the guard that refuses the old token).
- `200 582330` from `curl.exe`: the catalog's raw URL under the new name serves the same file. `curl.exe`, not `curl`: in PowerShell 5.1, `curl` is an alias of `Invoke-WebRequest`.

- [ ] **Step 9: Commit**

```powershell
git add README.md apps/web/lib/server/catalog.ts apps/web/lib/server/cityEnrichment.ts apps/web/lib/server/cityEnrichment.test.ts apps/web/scripts
git status --short
```
`git status --short` must list exactly the 17 files above, all staged, and nothing else. Then commit (the closing `'@` must start its line):

```powershell
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
@'
chore: replace the old repo name with travel-super-app

The GitHub repo is darrenCWJ/travel-super-app. Update the README's source
link, the catalog's raw URL and the eleven User-Agent constants, with the
four tests that pin them. The User-Agent test now also refuses the old
product token, so it cannot come back.

The Vercel domain china-itinerary-planner.vercel.app stays until the Vercel
project is renamed in slice B. The history documents under docs/ keep the
old name.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@ | git commit -F -
```

- [ ] **Step 10 (controlling session): open PR A1 and get it merged**
  - Push the branch: `git push -u origin chore/repo-name`.
  - Open the pull request with `gh pr create --base main --title "chore: replace the old repo name with travel-super-app"`. The body lists the 17 files, what stays and why (the Vercel domain, `docs/`, the display name), and the test-first evidence from Steps 3 and 5. It ends with the attribution line.
  - CI must be green: `changes`, `tools`, `web`, `e2e` and `ci-ok`; `mobile` is skipped by the path filter.
  - The Vercel preview must be Ready (`gh api repos/darrenCWJ/travel-super-app/commits/<sha>/status`).
  - The owner merges, or the controlling session does if the owner allowed it for this slice. It is a rebase-merge pinned to the tested head: `gh pr merge <n> --rebase --match-head-commit <full sha>`.
  - Then check `gh pr view <n> --json state` says `MERGED` before deleting the branch.


---

### Task 2: The "being rebuilt" page (PR A2)

**Who:** an implementer subagent.

**Files:**
- Create: `apps/web/components/BeingRebuilt.tsx`: the page's content, and the metadata every page that shows it uses
- Create: `apps/web/components/BeingRebuilt.test.tsx`
- Create: `apps/web/app/rebuilding/page.tsx`: the route production's rewrite lands on (Task 3)

**Interfaces:**
- Consumes: nothing.
- Produces, used by Tasks 3 and 4:
  - `REBUILDING_METADATA: Metadata`, exported from `@/components/BeingRebuilt`: title `"Being rebuilt — Itinerary Planner"`, `robots: { index: false, follow: false }`.
  - `BeingRebuilt({ showExplorerLink = false }: { showExplorerLink?: boolean })`, exported from the same file. A server component with no data. It renders one `<main>` holding one `<h1>Being rebuilt</h1>` and the paragraph "This app is being rebuilt from the ground up. Trips, sign-in and sharing are switched off until the new version is ready." With `showExplorerLink` it adds "In the meantime, the destination explorer still works." and one link, "Explore destinations", to `/plan`.
  - The route `/rebuilding`, which renders `<BeingRebuilt />` with no link.
- **"No client code beyond the layout"** (spec §4) holds. The component has no `"use client"`. Its one link uses `next/link`, which the root layout's shell (`AppShell`, a client component) already ships for its brand link, and `/rebuilding`, the page production shows, renders no link at all.

- [ ] **Step 1: Branch** (after PR A1 has merged, in the worktree the controlling session made for PR A2)

```powershell
git fetch origin
git switch -c feat/being-rebuilt origin/main
```

- [ ] **Step 2: Write the failing test**, `apps/web/components/BeingRebuilt.test.tsx`:

```tsx
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
```

- [ ] **Step 3: Run it and watch it fail**

```powershell
pnpm --filter @tsa/web --fail-if-no-match exec vitest run components/BeingRebuilt.test.tsx
```
Expected: `Test Files  1 failed (1)`, with `Error: Failed to resolve import "./BeingRebuilt" from "components/BeingRebuilt.test.tsx". Does the file exist?`

- [ ] **Step 4: Write the component**, `apps/web/components/BeingRebuilt.tsx`:

```tsx
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
```

- [ ] **Step 5: Run the test again**

```powershell
pnpm --filter @tsa/web --fail-if-no-match exec vitest run components/BeingRebuilt.test.tsx
```
Expected: `Tests  4 passed (4)`.

- [ ] **Step 6: Add the route**, `apps/web/app/rebuilding/page.tsx`:

```tsx
import { BeingRebuilt, REBUILDING_METADATA } from "@/components/BeingRebuilt";

/**
 * Where production sends every path while the app is rebuilt: `proxy.ts`
 * rewrites to here when VERCEL_ENV is "production". Reachable by name
 * everywhere else, which is what lets the page itself be tested.
 */
export const metadata = REBUILDING_METADATA;

export default function RebuildingPage() {
  return <BeingRebuilt />;
}
```

- [ ] **Step 7: Check everything still passes**

```powershell
pnpm --filter @tsa/web --fail-if-no-match typecheck
pnpm --filter @tsa/web --fail-if-no-match test
```
Expected: typecheck clean. Unit tests: 168 files, 2,770 passed and 1 expected fail. That is `main`'s 2,766, plus these 4.

- [ ] **Step 8: Commit**

```powershell
git add apps/web/components/BeingRebuilt.tsx apps/web/components/BeingRebuilt.test.tsx apps/web/app/rebuilding/page.tsx
git status --short
```
Expected, exactly:

```text
A  apps/web/app/rebuilding/page.tsx
A  apps/web/components/BeingRebuilt.test.tsx
A  apps/web/components/BeingRebuilt.tsx
```

```powershell
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
@'
feat: add the "being rebuilt" page

A server component that says the app is being rebuilt, with an optional
link to the destination explorer, and the /rebuilding route that renders
it. Nothing mounts or links to it yet.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@ | git commit -F -
```


---

### Task 3: The production switch, and the browser tests go signed out (PR A2)

**Who:** an implementer subagent, on `feat/being-rebuilt`.

**Files:**
- Modify: `apps/web/proxy.ts`. The login wall becomes production's switch.
- Modify: `apps/web/lib/proxy.test.ts` (rewritten)
- Delete: `apps/web/lib/wall.ts`, `apps/web/lib/wall.test.ts`
- Modify: `apps/web/next.config.ts` (one comment that described the wall)
- Modify: `apps/web/playwright.config.ts`
- Delete: `apps/web/e2e/auth.setup.ts`, `apps/web/e2e/wall.spec.ts`, `apps/web/e2e/gateways.spec.ts`, `apps/web/e2e/tickets.spec.ts`

**Interfaces:**
- Consumes: the route `/rebuilding` (Task 2).
- Produces: `proxy(request: NextRequest)`, a sync function exported from `apps/web/proxy.ts`, plus its `config`.
  - When `process.env.VERCEL_ENV` is `"production"`, it returns `NextResponse.rewrite(new URL("/rebuilding", request.url))` with `Cache-Control: no-store`. Otherwise it returns `NextResponse.next()`.
  - It reads the variable on every request, so a deployment's environment decides, not its build.
  - Matcher: `["/((?!_next/static|_next/image|favicon.ico).*)"]`, unchanged.
  - Playwright has two projects, both signed out: `chromium` (every spec except `tap-targets.spec.ts`, selected by `testIgnore`) and `mobile` (`tap-targets.spec.ts`, Pixel 5). Its dev server runs with `NODE_ENV=development` and `VERCEL_ENV=development`. Next never lets a `.env` file override a variable that is already set, so a production `.env.local` pulled with `vercel env pull` cannot switch the e2e server to "being rebuilt".

**Why the wall can go now** (decision A-D4). Slice A retires sign-in, and slice C builds a new wall for `/app`, `/admin` and `/account` (spec §6). Until Task 8, the old auth routes still check sessions themselves, and after Task 6 nothing that renders reaches them.

- [ ] **Step 1: Write the failing test.** Replace `apps/web/lib/proxy.test.ts` with:

```ts
import { afterEach, describe, expect, test } from "vitest";
import { NextRequest } from "next/server";
// `unstable_doesMiddlewareMatch`, not the `unstable_doesProxyMatch` that
// Next 16.3.6's own proxy.md names: that export does not exist in this release
// (only the docs mention it). This is the same function under its old name.
import {
  getRewrittenUrl,
  isRewrite,
  unstable_doesMiddlewareMatch,
} from "next/experimental/testing/server";
import { config, proxy } from "@/proxy";

/**
 * proxy.ts itself lives at the repo root, not under lib/ — this file sits
 * here anyway because it's the only `.test.ts` location vitest.config.mts's
 * node project already picks up, and proxy.ts is plain Node-runnable logic
 * (NextRequest/NextResponse work outside an actual Next server).
 *
 * While the app is rebuilt (phase 1, slice A) the proxy is production's
 * switch: there, every path it sees becomes the "being rebuilt" page. On a
 * preview and in local development it passes everything through, so the
 * explorer keeps working where it is tested.
 */

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function inVercelEnv(value: string | undefined) {
  if (value === undefined) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = value;
}

describe("in production, every path is the being-rebuilt page", () => {
  test.each([
    "/",
    "/plan",
    "/api/destinations?q=lima&country=PE",
    "/world-globe.json",
    "/trip/abc",
  ])("rewrites %s to /rebuilding, and keeps it out of every cache", async (path) => {
    inVercelEnv("production");
    const res = await proxy(new NextRequest(`https://example.com${path}`));

    expect(isRewrite(res)).toBe(true);
    expect(getRewrittenUrl(res)).toBe("https://example.com/rebuilding");
    // next.config.ts gives the topology assets a day-long public cache, and
    // its headers run before the proxy. A cached "being rebuilt" answer under
    // an asset's URL would outlive the rebuild.
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("everywhere else, the proxy stands aside", () => {
  test.each([["preview"], ["development"], [undefined]])(
    "VERCEL_ENV=%s passes every path through",
    async (value) => {
      inVercelEnv(value);
      for (const path of ["/", "/plan", "/api/destinations", "/world-globe.json"]) {
        const res = await proxy(new NextRequest(`https://example.com${path}`));
        expect(isRewrite(res), path).toBe(false);
        // What `NextResponse.next()` sets: carry on to the route itself.
        expect(res.headers.get("x-middleware-next"), path).toBe("1");
      }
    }
  );
});

/**
 * Which paths the proxy is asked about at all. A path the matcher excludes is
 * a path production would serve in full, so the exemptions stay the three
 * build-output ones and nothing else.
 *
 * Compiled the way Next compiles a proxy's matcher, through the testing
 * helper above, so these are the real semantics rather than a regex
 * re-implementation.
 */
describe("proxy matcher", () => {
  const seen = (url: string) => unstable_doesMiddlewareMatch({ config, url });

  test("sees every page, route and public file", () => {
    for (const path of [
      "/",
      "/plan",
      "/rebuilding",
      "/trip/abc123",
      "/api/destinations",
      "/world-globe.json",
      "/cities/PE.json",
    ]) {
      expect(seen(path), path).toBe(true);
    }
  });

  test("excludes only the three build-output exemptions", () => {
    for (const path of ["/_next/static/chunk.js", "/_next/image", "/favicon.ico"]) {
      expect(seen(path), path).toBe(false);
    }
  });
});
```
`unstable_doesMiddlewareMatch` is the right import. Next 16.3.6's bundled `proxy.md` names `unstable_doesProxyMatch`, which does not exist in this release.

- [ ] **Step 2: Run it and watch it fail**

```powershell
pnpm --filter @tsa/web --fail-if-no-match exec vitest run lib/proxy.test.ts
```
Expected: `Tests  5 failed | 5 passed (10)`.
- The five production cases fail with `AssertionError: expected false to be true // Object.is equality`, because today's proxy never rewrites.
- The pass-through and matcher cases already pass.

- [ ] **Step 3: Replace `apps/web/proxy.ts`**

```ts
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
```

- [ ] **Step 4: Delete the wall**

```powershell
git rm apps/web/lib/wall.ts apps/web/lib/wall.test.ts
```

- [ ] **Step 5: Correct the comment in `apps/web/next.config.ts`** that described the wall:

```diff
diff --git a/apps/web/next.config.ts b/apps/web/next.config.ts
index 5f4eb27..1a862fc 100644
--- a/apps/web/next.config.ts
+++ b/apps/web/next.config.ts
@@ -31,9 +31,12 @@ const nextConfig: NextConfig = {
    * parsers throw loudly rather than degrade. A shape change is not, and the
    * picker's own "Try again" would re-request the same cached copy.
    *
-   * Note the wall interacts with this: `proxy.ts` puts everything under `public/`
-   * behind the login redirect, and that redirect is `no-store` precisely so a
-   * signed-out request cannot park a day-long cached bounce in front of the asset.
+   * Note the proxy interacts with this: in production `proxy.ts` rewrites
+   * everything under `public/` to the "being rebuilt" page, and that rewrite is
+   * `no-store` precisely so a day-long cached copy of the page cannot sit in
+   * front of the asset once the rebuild lands. Checked with `next start` on
+   * 2026-10-03: the rewrite's `no-store` replaces this header on
+   * `/world-globe.json` rather than joining it.
    */
   async headers() {
     return [
```

- [ ] **Step 6: Run the proxy test and the header rules' test**

```powershell
pnpm --filter @tsa/web --fail-if-no-match exec vitest run lib/proxy.test.ts lib/cacheHeaders.test.ts
```
Expected: `Tests  22 passed (22)` (10 and 12).

- [ ] **Step 7: The browser tests go signed out.** Replace `apps/web/playwright.config.ts` with:

```ts
import { sep } from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * The repo's first end-to-end tests, and the reason they exist.
 *
 * Every test in this project before now ran in jsdom, which parses HTML and
 * computes NO layout: `getBoundingClientRect` is all zeroes there, and CSS
 * variables like `--tap-min` are strings nothing resolves. So the phase's
 * accessibility criterion — WCAG 2.2 AA 2.5.8, a 44x44 CSS px target — was
 * asserted as viewBox arithmetic against a number the test itself computed.
 * That arithmetic was right, and it was never once checked against a browser.
 *
 * These specs measure the rendered box instead. They are deliberately few:
 * the value is in the things jsdom structurally cannot answer — real layout,
 * real CSS, the routes a real browser actually reaches — and not in restating
 * what the unit tests already hold.
 *
 * Every spec runs signed out. Sign-in, the store and the trip pages are retired
 * while the app is rebuilt (phase 1, slice A), so there is no session to set
 * up and nothing that needs one: the explorer on /plan and the "being rebuilt"
 * pages are all there is to test.
 *
 * Port 3100 rather than 3000, and pinned rather than `autoPort`: `baseURL` has
 * to be known before the server starts, and 3000 is the port a developer is
 * most likely to already be using.
 */

/**
 * The checkouts nested inside this one, under `.claude/worktrees/<name>/`.
 *
 * Anchored at this file's own directory because Playwright matches
 * `testIgnore` against each file's ABSOLUTE path. The unanchored `.claude`
 * glob this replaces also matched every spec of a checkout that itself lives
 * under `.claude/worktrees/`, so `npx playwright test` there found no tests.
 *
 * Collection only walks `testDir`, so while that is `./e2e` a nested checkout
 * is out of reach regardless; this keeps it out if `testDir` ever widens, as
 * long as Playwright is started from the checkout's real path. Node resolves
 * `__dirname` through junctions and symlinks, while Playwright keeps the path
 * it was given, so re-check `--list` from the path you use if you widen it.
 *
 * A RegExp rather than a glob built from the path, which would read a `[` or
 * `{` in it as syntax. On Windows Playwright also tests RegExps against a
 * `/`-separated copy of the path, hence `/` here, and `i` because paths there
 * ignore case. `__dirname` exists because the repo is CommonJS. Escaped by
 * hand because `RegExp.escape` needs Node 24 and nothing else here does.
 */
const nestedCheckouts = new RegExp(
  `^${escapeRegExp(__dirname.split(sep).join("/"))}/\\.claude/`,
  "i",
);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** §5.3's tap targets are a claim about phones, so their spec runs at a phone width. */
const PHONE_SPECS = /tap-targets\.spec\.ts/;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: [nestedCheckouts, "**/node_modules/**"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // One worker, everywhere. The shared resource is a single `next dev`, which
  // compiles a route on first request: running specs in parallel does not make
  // them faster, it makes several of them wait on the same compile at once and
  // then time out together. Measured — eleven parallel specs all hit the 60s
  // ceiling on a server that answers one of them in about two seconds.
  workers: 1,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",
  // `next dev` compiles a route on first request, so the first navigation in a
  // cold run is seconds rather than milliseconds.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      // Every spec but the phone one, at a desktop width. Selected by
      // exclusion, so a new spec runs here without anyone remembering to list it.
      name: "chromium",
      testIgnore: PHONE_SPECS,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // 390px is the iPhone 12/13/14 CSS width and the figure the unit tests quote.
      name: "mobile",
      testMatch: PHONE_SPECS,
      use: { ...devices["Pixel 5"] },
    },
  ],

  webServer: {
    command: "pnpm exec next dev -p 3100",
    url: "http://localhost:3100/",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // `next dev` runs as development whatever the shell says, and so does the
      // Vercel environment `proxy.ts` reads: with VERCEL_ENV=production it
      // rewrites every path to /rebuilding and no explorer spec could pass.
      // Next never overrides a variable that is already set with one from a
      // .env file, so this also outranks a production .env.local pulled with
      // `vercel env pull`.
      NODE_ENV: "development",
      VERCEL_ENV: "development",
    },
  },
});
```

Then delete the sign-up setup, and the three specs that need a session or the wall:

```powershell
git rm apps/web/e2e/auth.setup.ts apps/web/e2e/wall.spec.ts apps/web/e2e/gateways.spec.ts apps/web/e2e/tickets.spec.ts
```
`fonts.spec.ts` still opens `/login` in this task. With no `BETTER_AUTH_SECRET` in the dev server's environment, the old `/login` still shows its Email field, so the spec keeps passing (checked in the spike). Task 4 moves it to `/`.

- [ ] **Step 8: Run the checks**

```powershell
pnpm --filter @tsa/web --fail-if-no-match typecheck
pnpm --filter @tsa/web --fail-if-no-match test
pnpm --filter @tsa/web --fail-if-no-match exec playwright test
git checkout -- apps/web/next-env.d.ts
```
Expected:
- typecheck clean;
- unit tests: 167 files, 2,761 passed and 1 expected fail;
- Playwright: 17 passed, chromium 13 and mobile 4: `map` 8, `climate` 3, `fonts` 2, `tap-targets` 4.

- [ ] **Step 9: Commit**

```powershell
git add -A apps/web/proxy.ts apps/web/lib/proxy.test.ts apps/web/next.config.ts apps/web/playwright.config.ts
git status --short
```
Expected, exactly:

```text
D  apps/web/e2e/auth.setup.ts
D  apps/web/e2e/gateways.spec.ts
D  apps/web/e2e/tickets.spec.ts
D  apps/web/e2e/wall.spec.ts
M  apps/web/lib/proxy.test.ts
D  apps/web/lib/wall.test.ts
D  apps/web/lib/wall.ts
M  apps/web/next.config.ts
M  apps/web/playwright.config.ts
M  apps/web/proxy.ts
```

```powershell
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
@'
feat: switch production to "being rebuilt" and run browser tests signed out

proxy.ts rewrites every path to /rebuilding with no-store when VERCEL_ENV
is production and passes everything through elsewhere, replacing the login
wall; lib/wall.ts goes with it. Every Playwright project runs signed out:
the sign-up setup, the wall spec and the two specs that created trips
through the API are deleted.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@ | git commit -F -
```


---

### Task 4: The retired pages answer "being rebuilt" (PR A2)

**Who:** an implementer subagent, on `feat/being-rebuilt`.

**Files:**
- Modify (each replaced by a stub): `apps/web/app/page.tsx`, `apps/web/app/trip/[id]/page.tsx`, `apps/web/app/b/[code]/page.tsx`, `apps/web/app/account/page.tsx`, `apps/web/app/login/page.tsx`, `apps/web/app/signup/page.tsx`
- Create: `apps/web/e2e/rebuilding.spec.ts`. Task 6 adds one more test to it.
- Modify: `apps/web/e2e/fonts.spec.ts`, which moves from `/login` to `/`
- Modify, because they pin the pages being replaced: `apps/web/lib/contracts.test.ts` (C7), `apps/web/lib/climateShard.test.ts`, `apps/web/lib/countryFacts.test.ts`, `apps/web/scripts/cities/report.mjs`, `apps/web/data/cities-report.md`

**Interfaces:**
- Consumes: `BeingRebuilt` and `REBUILDING_METADATA` (Task 2).
- Produces:
  - `/` renders `<BeingRebuilt showExplorerLink />`.
  - `/trip/[id]`, `/b/[code]`, `/account`, `/login` and `/signup` each render `<BeingRebuilt />` and export `REBUILDING_METADATA` as their `metadata`.
  - The components the old pages mounted are now mounted by nothing: `TripView`, the briefing view on `/b/[code]`, the trips dashboard, the account page and the sign-in form. Task 8 deletes the ones that are not dormant.

**Why stubs rather than proxy rewrites** (decision A-D3): a later slice replaces each path by replacing its file. A rewrite would shadow the new page until someone remembered to remove it.

- [ ] **Step 1: Write the failing browser tests.** Create `apps/web/e2e/rebuilding.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

/**
 * The app while it is rebuilt (phase 1, slice A), signed out like every spec.
 *
 * The retired pages answer "being rebuilt", and the home page sends a visitor
 * to the explorer.
 *
 * Production is not tested here. There `proxy.ts` rewrites every path to
 * `/rebuilding`, which `lib/proxy.test.ts` pins, and this server runs as
 * development, where the proxy passes everything through.
 */

const HEADING = { level: 1, name: "Being rebuilt" } as const;
const EXPLORER_LINK = { name: "Explore destinations" } as const;

test("the home page says the app is being rebuilt, and opens the explorer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", HEADING)).toBeVisible();

  await page.getByRole("link", EXPLORER_LINK).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByRole("navigation", { name: "Progress" })).toBeVisible();
});

for (const path of ["/rebuilding", "/trip/abc", "/b/abc", "/account", "/login", "/signup"]) {
  test(`${path} says the app is being rebuilt, with no way into the explorer`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", HEADING)).toBeVisible();
    await expect(page.getByRole("link", EXPLORER_LINK)).toHaveCount(0);
  });
}
```

and point the font checks at the home page:

```diff
diff --git a/apps/web/e2e/fonts.spec.ts b/apps/web/e2e/fonts.spec.ts
index 4130251..6154f2f 100644
--- a/apps/web/e2e/fonts.spec.ts
+++ b/apps/web/e2e/fonts.spec.ts
@@ -23,8 +23,8 @@ import { test, expect } from "@playwright/test";
  *   every unicode-range stripped from fonts.css, /login still fetched just
  *   the four.)
  *
- * Signed out, on /login: the fonts belong to the root layout, and this is the
- * page the wall always serves.
+ * On the home page: the fonts belong to the root layout, so any page shows
+ * them, and the home page is the one every visitor reaches.
  */
 
 /** A few glyphs from each subset, all of which these fonts actually contain. */
@@ -68,8 +68,8 @@ const FAMILIES: { variable: string; font: string; weights: number[]; subsets: Su
 const unquote = (family: string) => family.trim().replace(/^["']|["']$/g, "");
 
 test("every subset of every family draws in its own font, through its CSS variable", async ({ page }) => {
-  await page.goto("/login");
-  await expect(page.getByLabel("Email")).toBeVisible();
+  await page.goto("/");
+  await expect(page.getByRole("heading", { level: 1, name: "Being rebuilt" })).toBeVisible();
 
   // Each variable is the latin family next/font owns, then the family
   // fonts.css declares, then that family's metric-matched Arial.
@@ -151,7 +151,7 @@ test("every subset of every family draws in its own font, through its CSS variab
 });
 
 test("only the four vendored latin files are preloaded", async ({ page }) => {
-  await page.goto("/login");
+  await page.goto("/");
 
   const hrefs = await page
     .locator('link[rel="preload"][as="font"]')
@@ -171,7 +171,6 @@ test("only the four vendored latin files are preloaded", async ({ page }) => {
   }
 
   // By content, not by name: the emitted filenames are next/font's business.
-  // Fetched signed out, so this also shows the wall lets them through.
   const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
   const preloaded = await Promise.all(
     hrefs.map(async ({ href }) => {
```

- [ ] **Step 2: Run them and watch them fail**

```powershell
pnpm --filter @tsa/web --fail-if-no-match exec playwright test e2e/rebuilding.spec.ts e2e/fonts.spec.ts
```
Expected: 7 failed, 2 passed.
- Failing: the home page, the five retired paths and the first font check. Each fails with `Error: expect(locator).toBeVisible() failed`, `Locator: getByRole('heading', { name: 'Being rebuilt', level: 1 })`, `Error: element(s) not found`.
- Passing: `/rebuilding` (Task 2's route) and the font-preload check, which never looks for the heading.

- [ ] **Step 3: Update the GeoNames pins test-first**

```diff
diff --git a/apps/web/lib/climateShard.test.ts b/apps/web/lib/climateShard.test.ts
index 88cd93b..067e388 100644
--- a/apps/web/lib/climateShard.test.ts
+++ b/apps/web/lib/climateShard.test.ts
@@ -729,7 +729,13 @@ function c7AllowedLiteral(text: string): string {
   return bracketSlice(text, openIndex);
 }
 
-/** The six-file `test.each([` GeoNamesCredit floor (contracts.test.ts:1174-1181). */
+/**
+ * The `test.each([` GeoNamesCredit floor in contracts.test.ts, the only
+ * `test.each([` call there. Five paths since phase 1's slice A retired
+ * app/b/[code]/page.tsx; the count is what proves the right literal was read.
+ */
+const CREDIT_FLOOR_SIZE = 5;
+
 function shareBriefingFloorLiteral(text: string): string {
   const marker = "test.each([";
   const markerIndex = text.indexOf(marker);
@@ -737,9 +743,12 @@ function shareBriefingFloorLiteral(text: string): string {
   const openIndex = markerIndex + marker.length - 1;
   const body = bracketSlice(text, openIndex);
   const paths = [...body.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
-  if (paths.length !== 6 || paths[paths.length - 1] !== "components/shell/ShareBriefing.tsx") {
+  if (
+    paths.length !== CREDIT_FLOOR_SIZE ||
+    paths[paths.length - 1] !== "components/shell/ShareBriefing.tsx"
+  ) {
     throw new Error(
-      `lib/contracts.test.ts: expected the six-path GeoNamesCredit floor ending in ` +
+      `lib/contracts.test.ts: expected the ${CREDIT_FLOOR_SIZE}-path GeoNamesCredit floor ending in ` +
         `ShareBriefing.tsx, got ${JSON.stringify(paths)} — is this still the only test.each([ call?`
     );
   }
@@ -778,7 +787,7 @@ describe("the climate artifact adds nothing to the CC BY attribution machinery",
     expect(MENTIONS_CLIMATE_OR_CHELSA.test(c7AllowedLiteral(CONTRACTS_TEST_TEXT))).toBe(false);
   });
 
-  test("the six-file GeoNamesCredit floor names no climate surface", () => {
+  test("the GeoNamesCredit floor names no climate surface", () => {
     expect(MENTIONS_CLIMATE_OR_CHELSA.test(shareBriefingFloorLiteral(CONTRACTS_TEST_TEXT))).toBe(false);
   });
 
diff --git a/apps/web/lib/contracts.test.ts b/apps/web/lib/contracts.test.ts
index fbe3790..1e41008 100644
--- a/apps/web/lib/contracts.test.ts
+++ b/apps/web/lib/contracts.test.ts
@@ -848,8 +848,8 @@ describe("C7 — every surface that renders GeoNames data credits it", () => {
     },
     {
       path: "components/trip/BriefingView.tsx",
-      mountedIn: ["app/b/[code]/page.tsx", "components/shell/ShareBriefing.tsx"],
-      why: "Renders every day panel's destinationName. Both mounts credit it: the public bearer-link page in its footer, and the Share panel's briefing — which had no crediting ancestor until this contract learned to walk the mount graph.",
+      mountedIn: ["components/shell/ShareBriefing.tsx"],
+      why: "Renders every day panel's destinationName. Its one mount credits it: the Share panel's briefing, which had no crediting ancestor until this contract learned to walk the mount graph. The public bearer-link page that mounted it too is retired while the app is rebuilt (phase 1, slice A).",
     },
   ];
 
@@ -1197,7 +1197,6 @@ describe("C7 — every surface that renders GeoNames data credits it", () => {
     "app/plan/page.tsx",
     "components/DestinationStep.tsx",
     "components/TripView.tsx",
-    "app/b/[code]/page.tsx",
     "components/home/TripsDashboard.tsx",
     "components/shell/ShareBriefing.tsx",
   ])(
@@ -1205,7 +1204,7 @@ describe("C7 — every surface that renders GeoNames data credits it", () => {
     (path) => {
       // The enumerated floor, kept alongside the derived scan rather than
       // replaced by it: the derived scan proves no surface is UNCREDITED, and
-      // this proves these six named ones still exist to be credited at all. A
+      // this proves these named ones still exist to be credited at all. A
       // file deleted outright passes the derived scan vacuously.
       const file = FILES.find((f) => f.path === path);
       expect(file, `${path} is not in the scanned tree`).toBeDefined();
diff --git a/apps/web/lib/countryFacts.test.ts b/apps/web/lib/countryFacts.test.ts
index 6763327..3e9ad5a 100644
--- a/apps/web/lib/countryFacts.test.ts
+++ b/apps/web/lib/countryFacts.test.ts
@@ -1045,10 +1045,11 @@ describe("only the surfaces that read a fact pay for the artifact", () => {
     // shape a broken walk produces for free.
     //
     // (1) An app/ entry point that genuinely DOES pay is still detected, so a
-    // walk that resolved no app/ specifier at all cannot pass here. /b/[code]
-    // calls buildBriefing server-side, which is allowed and is the point: the
-    // bytes are on the server, not in that page's client bundle.
-    expect(reaches(GRAPH, "app/b/[code]/page.tsx", ARTIFACT_READER)).toBe(true);
+    // walk that resolved no app/ specifier at all cannot pass here. The plan
+    // page pays through PlanStep, which reads facts for its tips and packing —
+    // the same reason it is on the paying list above. (This used to be
+    // /b/[code], retired with the store in phase 1's slice A.)
+    expect(reaches(GRAPH, "app/plan/page.tsx", ARTIFACT_READER)).toBe(true);
     // (2) The layout's own edges resolved. Pinned rather than counted: a new
     // root-layout import is 70 KB on every route if it reaches the artifact,
     // so admitting one should be a line in this diff.
```
What these change:
- C7's mount allowlist now says the briefing view is mounted only by `ShareBriefing`.
- C7's enumerated floor drops `/b/[code]`.
- `climateShard.test.ts` reads that floor by its size, now a named constant, 5.
- `countryFacts.test.ts` proves its import walk reaches `app/` through `/plan` instead of `/b/[code]`.

- [ ] **Step 4: Run them; only the allowlist fails**

```powershell
pnpm --filter @tsa/web --fail-if-no-match exec vitest run lib/contracts.test.ts lib/climateShard.test.ts lib/countryFacts.test.ts
```
Expected: `Tests  1 failed | 131 passed (132)`, with `AssertionError: allowlist does not name every mount: components/trip/BriefingView.tsx: mounted in app/b/[code]/page.tsx, components/shell/ShareBriefing.tsx: expected [ Array(1) ] to deeply equal []`. The other three changes pass before and after the pages change; they are there so the suite keeps describing the tree.

- [ ] **Step 5: Replace the home page**, `apps/web/app/page.tsx`:

```tsx
import { BeingRebuilt, REBUILDING_METADATA } from "@/components/BeingRebuilt";

/**
 * The home page while the app is rebuilt. The trips dashboard it used to show
 * needs sign-in and the retired store, so this links to the one part that
 * still works, the destination explorer on /plan. Production never renders
 * this: `proxy.ts` sends every path there to /rebuilding, which has no link.
 */
export const metadata = REBUILDING_METADATA;

export default function Home() {
  return <BeingRebuilt showExplorerLink />;
}
```

- [ ] **Step 6: Replace the five retired pages.** Each of these files becomes exactly the file below, byte for byte:
  - `apps/web/app/trip/[id]/page.tsx`
  - `apps/web/app/b/[code]/page.tsx`
  - `apps/web/app/account/page.tsx`
  - `apps/web/app/login/page.tsx`
  - `apps/web/app/signup/page.tsx`

```tsx
import { BeingRebuilt, REBUILDING_METADATA } from "@/components/BeingRebuilt";

/**
 * Retired with the old store and sign-in (phase 1, slice A); answers with the
 * "being rebuilt" page until its replacement lands.
 */
export const metadata = REBUILDING_METADATA;

export default function Page() {
  return <BeingRebuilt />;
}
```

- [ ] **Step 7: Update the cities report's list of credited surfaces.** Change the generator and the committed file it writes together:

```diff
diff --git a/apps/web/data/cities-report.md b/apps/web/data/cities-report.md
index 81373d8..fb1b18a 100644
--- a/apps/web/data/cities-report.md
+++ b/apps/web/data/cities-report.md
@@ -23,13 +23,15 @@ and the modification notice are rendered in the UI by
   inside it, because that footer is `print:hidden` and the generated plan is
   meant to be printed
 - `components/DestinationStep.tsx` — the destination step, under the search
+
+These three are mounted nowhere while the app is rebuilt, and keep their
+credit so that it comes back with them:
+
 - `components/TripView.tsx` — twice: the member view and the join-code guest
   view of the shared trip page
-- `app/b/[code]/page.tsx` — the bearer-link briefing
 - `components/shell/ShareBriefing.tsx` — the briefing behind Share › "View
   briefing". It carries its own credit rather than inheriting one, because
-  nothing in its ancestry renders a credit: ShareMenu, then AppShell, then
-  the root layout, which wraps every route
+  nothing in its ancestry renders a credit
 - `components/home/TripsDashboard.tsx` — the signed-in home page trip list
 
 `lib/contracts.test.ts` (C7) fails if one of the files listed above drops it.
diff --git a/apps/web/scripts/cities/report.mjs b/apps/web/scripts/cities/report.mjs
index b0cbddc..998a764 100644
--- a/apps/web/scripts/cities/report.mjs
+++ b/apps/web/scripts/cities/report.mjs
@@ -64,13 +64,15 @@ export function buildReport({ shards, total, generatedAt, largest }) {
     '  inside it, because that footer is `print:hidden` and the generated plan is',
     '  meant to be printed',
     '- `components/DestinationStep.tsx` — the destination step, under the search',
+    '',
+    'These three are mounted nowhere while the app is rebuilt, and keep their',
+    'credit so that it comes back with them:',
+    '',
     '- `components/TripView.tsx` — twice: the member view and the join-code guest',
     '  view of the shared trip page',
-    '- `app/b/[code]/page.tsx` — the bearer-link briefing',
     '- `components/shell/ShareBriefing.tsx` — the briefing behind Share › "View',
     '  briefing". It carries its own credit rather than inheriting one, because',
-    '  nothing in its ancestry renders a credit: ShareMenu, then AppShell, then',
-    '  the root layout, which wraps every route',
+    '  nothing in its ancestry renders a credit',
     '- `components/home/TripsDashboard.tsx` — the signed-in home page trip list',
     '',
     '`lib/contracts.test.ts` (C7) fails if one of the files listed above drops it.',
```
C7 checks that the report's list matches the files that really credit GeoNames, and `/b/[code]` no longer does.

The report's new line "These three are mounted nowhere" is not yet literally true for `ShareBriefing`, which `ShareMenu`, still in the shell, imports without rendering. Task 5 takes `ShareMenu` out of the shell in the same pull request, and after that the line is exact.

- [ ] **Step 8: Run the checks**

```powershell
pnpm --filter @tsa/web --fail-if-no-match exec vitest run lib/contracts.test.ts lib/climateShard.test.ts lib/countryFacts.test.ts
pnpm --filter @tsa/web --fail-if-no-match typecheck
pnpm --filter @tsa/web --fail-if-no-match test
pnpm --filter @tsa/web --fail-if-no-match exec playwright test
git checkout -- apps/web/next-env.d.ts
```
Expected:
- the three files: `Tests  132 passed (132)`;
- typecheck clean;
- unit tests: 167 files, 2,760 passed and 1 expected fail (C7's floor lost its `/b/[code]` case);
- Playwright: 24 passed, chromium 20 and mobile 4.

- [ ] **Step 9: Commit**

```powershell
git add -A apps/web/app apps/web/e2e apps/web/lib/contracts.test.ts apps/web/lib/climateShard.test.ts apps/web/lib/countryFacts.test.ts apps/web/scripts/cities/report.mjs apps/web/data/cities-report.md
git status --short
```
Expected, exactly:

```text
M  apps/web/app/account/page.tsx
M  apps/web/app/b/[code]/page.tsx
M  apps/web/app/login/page.tsx
M  apps/web/app/page.tsx
M  apps/web/app/signup/page.tsx
M  apps/web/app/trip/[id]/page.tsx
M  apps/web/data/cities-report.md
M  apps/web/e2e/fonts.spec.ts
A  apps/web/e2e/rebuilding.spec.ts
M  apps/web/lib/climateShard.test.ts
M  apps/web/lib/contracts.test.ts
M  apps/web/lib/countryFacts.test.ts
M  apps/web/scripts/cities/report.mjs
```

```powershell
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
@'
feat: answer "being rebuilt" on the retired pages

The home page now links to the explorer, and /trip/[id], /b/[code],
/account, /login and /signup render the "being rebuilt" page. A browser
spec checks every one of them, and the font checks open the home page.
The GeoNames contracts and the cities report stop counting /b/[code] as a
credited surface.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@ | git commit -F -
```


---

### Task 5: The shell and the preferences stand alone (PR A2)

**Who:** an implementer subagent, on `feat/being-rebuilt`.

**Files:**
- Modify: `apps/web/components/shell/AppShell.tsx`. The account chip, the trip zone and the rail come out.
- Modify: `apps/web/components/shell/AppShell.test.tsx`
- Modify: `apps/web/components/shell/PrefsProvider.tsx`. The `PUT /api/me/prefs` comes out; the cookie is the only store.
- Modify: `apps/web/components/shell/PrefsProvider.test.tsx`
- Modify: `apps/web/lib/countryFacts.test.ts`. Its pinned list of the root layout's imports changes with the shell.

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `AppShell({ children, themeToggle = <ThemeToggle /> })`. Only the `themeToggle` slot remains; the `tripSwitcher`, `crew` and `share` props are gone. The frame is the same on every route: the brand link to `/`, the display settings, and `#shell-bottom`.
  - `PrefsProvider`'s `setPrefs` writes the `cip-prefs` cookie and makes no request.
  - `TripSwitcher`, `CrewMenu`, `ShareMenu`, `ShareBriefing` and `RailNav` stay in `components/shell/` with their tests, unmounted. They are dormant until phase 4 (decision A-D7).
  - `AccountChip` is mounted by nothing; Task 8 deletes it.

- [ ] **Step 1: Write the failing tests.** Replace `apps/web/components/shell/AppShell.test.tsx` with:

```tsx
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
```

and apply to `apps/web/components/shell/PrefsProvider.test.tsx` and `apps/web/lib/countryFacts.test.ts`:

```diff
diff --git a/apps/web/components/shell/PrefsProvider.test.tsx b/apps/web/components/shell/PrefsProvider.test.tsx
index e976082..c3a6455 100644
--- a/apps/web/components/shell/PrefsProvider.test.tsx
+++ b/apps/web/components/shell/PrefsProvider.test.tsx
@@ -175,7 +175,7 @@ describe("PrefsProvider", () => {
     );
   });
 
-  test("saving preferences updates state, the cookie and the server", async () => {
+  test("saving preferences updates state and the cookie, and asks the server for nothing", async () => {
     const next: UserPrefs = {
       theme: "dark",
       accent: 120,
@@ -200,10 +200,9 @@ describe("PrefsProvider", () => {
 
     expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual(next);
     expect(document.cookie).toContain("cip-prefs=theme=dark&accent=120&view=globe&hues=JP:40");
-    expect(fetch).toHaveBeenCalledWith(
-      "/api/me/prefs",
-      expect.objectContaining({ method: "PUT" })
-    );
+    // The cookie is the only store: the account-linked copy went with sign-in
+    // while the app is rebuilt (phase 1, slice A), and with it the request.
+    expect(fetch).not.toHaveBeenCalled();
   });
 
   test("saving dark flips the document without a reload", () => {
@@ -250,30 +249,6 @@ describe("PrefsProvider", () => {
     expect(seen).toBe("dark");
   });
 
-  test("a failing save is swallowed rather than crashing the shell", async () => {
-    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
-    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
-    let save: (p: UserPrefs) => void = () => {};
-
-    function Saver() {
-      save = usePrefs().setPrefs;
-      return null;
-    }
-
-    render(
-      <PrefsProvider>
-        <Saver />
-      </PrefsProvider>
-    );
-
-    await act(async () =>
-      save({ theme: "system", accent: "country", accentHues: {}, worldView: "globe" })
-    );
-
-    expect(document.cookie).toContain("theme=system");
-    consoleError.mockRestore();
-  });
-
   test("usePrefs outside a provider still returns usable defaults", () => {
     // A component rendered outside the shell should degrade, not throw: prefs
     // are decoration, and nothing about them is worth a blank page.
diff --git a/apps/web/lib/countryFacts.test.ts b/apps/web/lib/countryFacts.test.ts
index 3e9ad5a..c84e8f3 100644
--- a/apps/web/lib/countryFacts.test.ts
+++ b/apps/web/lib/countryFacts.test.ts
@@ -1030,12 +1030,14 @@ describe("only the surfaces that read a fact pay for the artifact", () => {
    * Measured 2026-08-27: the layout's subtree fell from 41 modules to 18.
    */
   const ROOT_LAYOUT = "app/layout.tsx";
+  // ShareMenu was here until phase 1's slice A took it out of the shell; the
+  // shell's one remaining piece, the display settings, took its place.
   const ROOT_LAYOUT_SUBTREE = [
     ROOT_LAYOUT,
     "components/shell/AppShell.tsx",
     "components/shell/PrefsProvider.tsx",
-    "components/shell/ShareMenu.tsx",
     "components/shell/ShellTripContext.tsx",
+    "components/shell/ThemeToggle.tsx",
     "components/shell/TripAccentProvider.tsx",
     "lib/tripCountry.ts",
   ];
@@ -1091,9 +1093,10 @@ describe("only the surfaces that read a fact pay for the artifact", () => {
   });
 
   test("the in-app briefing is a chunk of its own, not part of the shell", () => {
-    // The other root-layout path: AppShell mounts ShareMenu on every route, and
-    // ShareMenu used to import `buildBriefing`, which resolves the gap note and
-    // therefore the artifact. A static import here is the whole defect.
+    // The other root-layout path, while AppShell mounted ShareMenu on every
+    // route (it is unmounted from phase 1's slice A until phase 4): ShareMenu
+    // used to import `buildBriefing`, which resolves the gap note and therefore
+    // the artifact. A static import here is the whole defect.
     const menu = FILES.find((file) => file.path === "components/shell/ShareMenu.tsx")!;
     expect(valueImportOf(menu.code, /lib\/briefing/)).toBe(false);
     // The dynamic import that replaced it. The walk does not count it as an
```

- [ ] **Step 2: Run them and watch them fail**

```powershell
pnpm --filter @tsa/web --fail-if-no-match exec vitest run components/shell/AppShell.test.tsx components/shell/PrefsProvider.test.tsx lib/countryFacts.test.ts
```
Expected: `Tests  5 failed | 55 passed (60)`.
- Three AppShell cases (`/login`, `/signup` and `/b/abc123` get the same header) fail with `TestingLibraryElementError: Unable to find an accessible element with the role "banner"`.
- The fourth AppShell case, `/trip/abc`, fails with `AssertionError: expected <summary …(3)>…(1)</summary> to be null`, because the trip switcher is still there.
- PrefsProvider fails with `AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times`.
- The countryFacts change passes before and after.

- [ ] **Step 3: Replace `apps/web/components/shell/AppShell.tsx`**

```tsx
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
```

- [ ] **Step 4: Take the request out of `apps/web/components/shell/PrefsProvider.tsx`**

```diff
diff --git a/apps/web/components/shell/PrefsProvider.tsx b/apps/web/components/shell/PrefsProvider.tsx
index ab996f5..6b51f6b 100644
--- a/apps/web/components/shell/PrefsProvider.tsx
+++ b/apps/web/components/shell/PrefsProvider.tsx
@@ -71,19 +71,12 @@ export function PrefsProvider({
   // first render already agrees with the DOM the script produced.
   const [prefs, setPrefsState] = useState<UserPrefs>(() => parsePrefsCookie(readCookie()));
 
+  // The cookie is the only store. The account-linked copy, synced to
+  // /api/me/prefs, went with sign-in while the app is rebuilt (phase 1, slice A).
   const setPrefs = useCallback((next: UserPrefs) => {
     const clean = sanitizePrefs(next);
     setPrefsState(clean);
     document.cookie = `${PREFS_COOKIE}=${serializePrefsCookie(clean)}; Path=/; Max-Age=${YEAR_SECONDS}; SameSite=Lax`;
-    // Fire and forget: the cookie is already authoritative for rendering, so a
-    // failed sync costs cross-device persistence and nothing the user can see.
-    void fetch("/api/me/prefs", {
-      method: "PUT",
-      headers: { "Content-Type": "application/json" },
-      body: JSON.stringify(clean),
-    }).catch((error) => {
-      console.error("PrefsProvider: could not save preferences", error);
-    });
   }, []);
 
   // `false` until the passive effect below corrects it. This value only ever
```

- [ ] **Step 5: Run the three files again**

```powershell
pnpm --filter @tsa/web --fail-if-no-match exec vitest run components/shell/AppShell.test.tsx components/shell/PrefsProvider.test.tsx lib/countryFacts.test.ts
```
Expected: `Tests  60 passed (60)`.

- [ ] **Step 6: Run the checks**

```powershell
pnpm --filter @tsa/web --fail-if-no-match typecheck
pnpm --filter @tsa/web --fail-if-no-match test
```
Expected: typecheck clean. Unit tests: 167 files, 2,763 passed and 1 expected fail.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/components/shell/AppShell.tsx apps/web/components/shell/AppShell.test.tsx apps/web/components/shell/PrefsProvider.tsx apps/web/components/shell/PrefsProvider.test.tsx apps/web/lib/countryFacts.test.ts
git status --short
```
Expected, exactly:

```text
M  apps/web/components/shell/AppShell.test.tsx
M  apps/web/components/shell/AppShell.tsx
M  apps/web/components/shell/PrefsProvider.test.tsx
M  apps/web/components/shell/PrefsProvider.tsx
M  apps/web/lib/countryFacts.test.ts
```

```powershell
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
@'
refactor: let the shell and preferences stand alone

The shell keeps the brand link, the display settings and the bottom edge;
the account chip, the trip zone and the rail are unmounted, and their
components stay for phase 4. Preferences live in the cookie alone, with no
request to the retired /api/me/prefs.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@ | git commit -F -
```


---

### Task 6: The explorer stands alone (PR A2)

**Who:** an implementer subagent, on `feat/being-rebuilt`.

**Files:**
- Modify: `apps/web/components/PlanStep.tsx`. A note replaces the shared-trip card.
- Modify: `apps/web/app/plan/page.tsx`. The lazy enrichment fetch comes out, and so does the `month` prop that only the card used.
- Modify: `apps/web/components/PlanStep.test.tsx`, `apps/web/components/plan/worldwidePlan.test.tsx`, `apps/web/lib/catalogExtras.test.ts`
- Modify: `apps/web/lib/contracts.test.ts` (C4's pin on the create call)
- Modify: `apps/web/components/plan/wizardCountry.test.tsx`, `apps/web/components/map/MapExplorer.airports.test.tsx` (router mocks only the card needed)
- Modify: `apps/web/e2e/rebuilding.spec.ts` (the explorer's route allowlist)

**Interfaces:**
- Consumes: the five kept reference routes, unchanged.
- Produces:
  - `PlanStep({ input, extraDestinations }: { input: TripInput; extraDestinations: Destination[] })`. The `month` prop is gone.
  - The last step renders a note headed "Shared trips are being rebuilt", with the text "You can't save or share this plan yet. It stays on this page until the rebuilt app can keep it." It makes no request.
  - `/plan` no longer calls `/api/cities/enrich`. `shouldFetchEnrichment` (`lib/catalogExtras.ts`) and `lib/server/cityEnrichment.ts` stay, unwired but tested, for phase 4 (decision A-D5).
  - A walk through the explorer now requests only `GET` on `/api/airports/search`, `/api/destinations`, `/api/destinations/resolve`, `/api/map/airports` and `/api/map/cities`.

- [ ] **Step 1: Write the failing unit tests.** Apply to the three test files and C4:

```diff
diff --git a/apps/web/components/PlanStep.test.tsx b/apps/web/components/PlanStep.test.tsx
index c160c08..39c4bba 100644
--- a/apps/web/components/PlanStep.test.tsx
+++ b/apps/web/components/PlanStep.test.tsx
@@ -1,4 +1,4 @@
-import { cleanup, render, screen, within } from "@testing-library/react";
+import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
 import { afterEach, describe, expect, test, vi } from "vitest";
 import type { TripInput } from "@/lib/itinerary";
 import type { Destination } from "@/lib/types";
@@ -11,12 +11,7 @@ import { PlanStep } from "./PlanStep";
  * is drawn, that it is drawn from the *country* rather than from the plan, and
  * that it is structurally a note rather than a sixth tip. The itinerary itself
  * has its own suites; nothing here asserts on the day list.
- *
- * `ShareTripCard` calls `useRouter`, which jsdom has no provider for.
  */
-vi.mock("next/navigation", () => ({
-  useRouter: () => ({ push: vi.fn() }),
-}));
 
 /**
  * One destination per country, minimal but real: `buildItinerary` returns an
@@ -129,3 +124,44 @@ describe("PlanStep — the gap note", () => {
     );
   });
 });
+
+/**
+ * Trips, sign-in and sharing are retired while the app is rebuilt (phase 1,
+ * slice A), and the route that created a trip from this step with them. The
+ * plan stays on screen, printable, and says why it goes no further.
+ */
+describe("PlanStep — the last step while trips are rebuilt", () => {
+  afterEach(() => {
+    vi.unstubAllGlobals();
+  });
+
+  test("says shared trips are being rebuilt, where the create flow used to be", () => {
+    render(<PlanStep input={input("PE", LIMA.id)} extraDestinations={[LIMA]} />);
+
+    expect(screen.getByRole("heading", { name: "Shared trips are being rebuilt" })).toBeInTheDocument();
+    expect(
+      screen.getByText(
+        "You can't save or share this plan yet. It stays on this page until the rebuilt app can keep it."
+      )
+    ).toBeInTheDocument();
+    // The flow it replaces: a trip-name field and a button that created the trip.
+    expect(screen.queryByLabelText(/Trip name/)).toBeNull();
+    expect(screen.queryByRole("button", { name: /shared trip/i })).toBeNull();
+  });
+
+  test("asks the server for nothing, whichever button is pressed", () => {
+    // Never settles, so nothing a press might start can update state outside act().
+    const fetchSpy = vi.fn((_url: string, _init?: RequestInit) => new Promise<Response>(() => {}));
+    vi.stubGlobal("fetch", fetchSpy);
+    // jsdom does not implement print, and the print button is still here.
+    vi.stubGlobal("print", vi.fn());
+
+    render(<PlanStep input={input("PE", LIMA.id)} extraDestinations={[LIMA]} />);
+    const buttons = screen.getAllByRole("button");
+    // Armed: the step really has buttons to press, the print button among them.
+    expect(buttons.map((button) => button.textContent)).toContain("🖨️ Print / save as PDF");
+    for (const button of buttons) fireEvent.click(button);
+
+    expect(fetchSpy).not.toHaveBeenCalled();
+  });
+});
diff --git a/apps/web/components/plan/worldwidePlan.test.tsx b/apps/web/components/plan/worldwidePlan.test.tsx
index c70a788..0cc0cc2 100644
--- a/apps/web/components/plan/worldwidePlan.test.tsx
+++ b/apps/web/components/plan/worldwidePlan.test.tsx
@@ -1,5 +1,5 @@
-import { cleanup, fireEvent, render, within } from "@testing-library/react";
-import { afterEach, describe, expect, test, vi } from "vitest";
+import { cleanup, render } from "@testing-library/react";
+import { afterEach, describe, expect, test } from "vitest";
 import { PlanStep } from "@/components/PlanStep";
 import { BriefingView } from "@/components/trip/BriefingView";
 import { PackingSection } from "@/components/trip/PackingSection";
@@ -47,11 +47,6 @@ import type { Destination } from "@/lib/types";
  * 84cd61e). Each `test` below renders and scans, and nothing more.
  */
 
-/** `ShareTripCard` calls `useRouter`, which jsdom has no provider for. */
-vi.mock("next/navigation", () => ({
-  useRouter: () => ({ push: vi.fn() }),
-}));
-
 /** Lima, Cusco, Arequipa — ids and coordinates from `public/cities/PE.json`. */
 const PERU_CITY_IDS = ["G3936456", "G3941584", "G3947322"];
 const CHINA_CITY_IDS = ["beijing", "xian", "shanghai"];
@@ -112,9 +107,7 @@ const peru = assemble("PE", PERU_CITY_IDS);
 const china = assemble("CN", CHINA_CITY_IDS);
 
 function renderWizard(trip: Assembled): string {
-  const { container } = render(
-    <PlanStep input={trip.input} extraDestinations={trip.destinations} month={JUNE} />
-  );
+  const { container } = render(<PlanStep input={trip.input} extraDestinations={trip.destinations} />);
   return container.innerHTML;
 }
 
@@ -217,10 +210,9 @@ function hopLine(html: string): string {
  * chop changing from `启程` to `同行` is the one deliberate change to China's
  * rendered output this task makes — see the arming test below.
  *
- * `一起走` in the share-a-trip card is still not on T31's file:line list and
- * remains unowned. It is the one entry left below.
+ * `一起走` in the share-a-trip card was never on T31's file:line list. It went
+ * with the card itself in phase 1's slice A, which retired trip creation.
  */
-const UNOWNED_SHARE_CARD_CJK = ["一", "起", "走"];
 
 describe("T30 jsdom — the trip that gets rendered", () => {
   test("is a real Peru trip, or every scan below is vacuous", () => {
@@ -266,16 +258,12 @@ describe("T30 jsdom — the negative half", () => {
     expect(hopLine(renderBriefing(peru))).toContain(`${NEUTRAL_GLYPH} Travel to Cusco`);
   });
 
-  test("the wizard leaks only the unowned share-card CJK, and nothing else", () => {
-    // Post-fix: no token matches at all. `chinaLeaks` reports CHINA_TOKENS
-    // first and CJK codepoints after them, so an empty token half in front of
-    // these three is the whole claim — "China" and 启/程 went with T31, 🚄 with
-    // the country-aware glyph. `一起走` is `ShareTripCard`'s, on no task's
-    // file list; see the constant's docblock.
-    expect(chinaLeaks(renderWizard(peru))).toEqual(["一", "起", "走"]);
-    // Spelled out above, and cross-checked against the constant here, so the
-    // two cannot drift and the constant's docblock stays the explanation.
-    expect(chinaLeaks(renderWizard(peru))).toEqual(UNOWNED_SHARE_CARD_CJK);
+  test("the wizard leaks nothing", () => {
+    // "China" and 启/程 went with T31, 🚄 with the country-aware glyph, and
+    // `一起走` with the share-a-trip card, retired in phase 1's slice A. The
+    // exclusion has shrunk to nothing, as the negative half's docblock says it
+    // should, so the constant that named it is gone too.
+    expect(chinaLeaks(renderWizard(peru))).toEqual([]);
     // Armed the same way as the other two surfaces.
     expect(hopLine(renderWizard(peru))).toContain(`${NEUTRAL_GLYPH} Travel to Cusco`);
     // T31's arming proof, direction one: a country with no curated mark shows
@@ -304,6 +292,16 @@ describe("T30 jsdom — the negative half", () => {
     expect(renderWizard(china)).toContain("Your China itinerary");
   });
 
+  test("a code that is not a country drops the name from the headline", () => {
+    // A blank profile name means the code names no country at all, and the
+    // headline says less rather than something false. An id nothing carries,
+    // so no curated destination resolves and quietly supplies a country.
+    const nowhere: TripInput = { ...peru.input, destinationIds: ["G0000000"], country: "ZZ" };
+    const wizard = renderWizard({ ...peru, input: nowhere, destinations: [] });
+    expect(wizard).toContain("Your itinerary");
+    expect(wizard).not.toContain("undefined");
+  });
+
   test("everything the generators produced is clean — the leaks are render-only", () => {
     // The seam, stated as an assertion. The plan, packing, tips and gap note
     // this page was handed carry no marker at all; the glyph is added by the
@@ -351,171 +349,6 @@ describe("T30 jsdom — the negative half", () => {
   });
 });
 
-/**
- * FINDING 3 (T31b) — the leak that gets WRITTEN DOWN.
- *
- * `ShareTripCard` defaulted a cleared trip-name field to the literal
- * `"China trip"` and pre-filled the field with `${destinationNames[0] ??
- * "China"} trip`. Everything else this file scans is a render, and a render is
- * fixed the moment the code is: a Peru trip created with the blank field went
- * to `/api/trips`, into the trips table, onto the dashboard, onto the trip page
- * and into every share link — under China's name, permanently. It is the only
- * finding in the phase that survives its own fix.
- *
- * No scan above could see it. `renderWizard` reads `container.innerHTML`, and
- * a controlled `<input value>` is a DOM property React assigns, not markup —
- * so the string never appeared in any scanned surface, and the POST body it
- * ends up in is not rendered at all. The only instrument that catches it is
- * driving the button and reading what went on the wire, which is what
- * `shareCardNames` does.
- *
- * Both the pre-fill and the blank-field fallback are checked, because they were
- * two separate literals and only fixing the louder one leaves the other.
- */
-/**
- * A wizard that resolved no destination at all — the resolve-miss branch.
- *
- * Both halves matter. `extraDestinations: []` is not enough on its own: the
- * curated `lib/data` list is merged in ahead of it, so China's `"beijing"` id
- * still resolves and would quietly send this down the first-city branch
- * instead. An id nothing carries is what makes the fallback the thing measured
- * — and it makes the Peru and China cases the same shape, rather than Peru's
- * passing by the accident of GeoNames ids being absent from the curated list.
- */
-const UNRESOLVED_IDS = ["G0000000"];
-
-function unresolved(tripInput: TripInput): TripInput {
-  return { ...tripInput, destinationIds: UNRESOLVED_IDS };
-}
-
-interface ShareCardNames {
-  /** What the field says before anyone touches it. */
-  prefilled: string;
-  /** What `/api/trips` is asked to persist. The one that outlives the fix. */
-  posted: string;
-}
-
-/**
- * Render the wizard, put `typed` in the trip-name field, press the button, and
- * report both names.
- *
- * **The fetch stub never settles, deliberately.** `create()` awaits it and
- * stops there, so no state update lands outside React's `act()` — this needs
- * no `waitFor`, no fake timers and no polling, and so cannot contribute the
- * kind of timing-sensitive test commit 84cd61e had to repair. The request body
- * is captured synchronously when the click handler calls `fetch`, which is
- * everything the assertions below read.
- *
- * `extraDestinations: []` is not a contrived input: `goToPlan` in
- * `app/plan/page.tsx` advances to step 2 on any `res.ok`, so a resolve that
- * comes back with nothing lands a real traveller on exactly this page — and
- * that is the branch where the old code said "China".
- */
-function shareCardNames(
-  tripInput: TripInput,
-  extraDestinations: Destination[],
-  typed: string
-): ShareCardNames {
-  const fetchMock = vi.fn((_url: string, _init: RequestInit) => new Promise<Response>(() => {}));
-  vi.stubGlobal("fetch", fetchMock);
-  try {
-    // Scoped to THIS render's container, not to `document.body`, which is what
-    // `render`'s own bound queries search. `cleanup` runs between tests, not
-    // between two renders inside one — and a test that names a Peru trip and a
-    // China trip in the same breath is exactly what this file wants to write.
-    const { container } = render(
-      <PlanStep input={tripInput} extraDestinations={extraDestinations} month={JUNE} />
-    );
-    const card = within(container);
-    const field = card.getByLabelText(/Trip name/) as HTMLInputElement;
-    const prefilled = field.value;
-    fireEvent.change(field, { target: { value: typed } });
-    fireEvent.click(card.getByRole("button", { name: /Start shared trip/ }));
-
-    expect(fetchMock).toHaveBeenCalledTimes(1);
-    const [url, init] = fetchMock.mock.calls[0];
-    // Armed: this is the trip-creation write path and not some other request.
-    expect(url).toBe("/api/trips");
-    expect(init.method).toBe("POST");
-    const body = JSON.parse(String(init.body)) as { tripName: string };
-    return { prefilled, posted: body.tripName };
-  } finally {
-    vi.unstubAllGlobals();
-  }
-}
-
-describe("T30 jsdom — the name the trip is SAVED under", () => {
-  test("a blank-name Peru trip is never persisted as a China trip", () => {
-    // Whitespace, not "": `.trim() ||` is what makes a space-only field take
-    // the fallback, and a bare "" would not exercise it.
-    const names = shareCardNames(peru.input, peru.destinations, "   ");
-    expect(chinaLeaks(names.posted)).toEqual([]);
-    expect(chinaLeaks(names.prefilled)).toEqual([]);
-    // The most specific true thing the wizard knows.
-    expect(names.posted).toBe("Lima trip");
-    expect(names.prefilled).toBe("Lima trip");
-  });
-
-  test("with no destination resolved it names the country, not China", () => {
-    // The branch the old `destinationNames[0] ?? "China"` covered, and the one
-    // a `/api/destinations/resolve` miss actually reaches.
-    const names = shareCardNames(unresolved(peru.input), [], "");
-    expect(chinaLeaks(names.posted)).toEqual([]);
-    expect(names.posted).toBe("Peru trip");
-    expect(names.prefilled).toBe("Peru trip");
-  });
-
-  test("a code that is not a country gets a country-free name, not a broken one", () => {
-    const nowhere: TripInput = { ...unresolved(peru.input), country: "ZZ" };
-    // Armed: the profile really did resolve no name, which is the case under
-    // test — the headline drops the name for exactly the same reason.
-    expect(renderWizard({ ...peru, input: nowhere, destinations: [] })).toContain(
-      "Your itinerary"
-    );
-    const names = shareCardNames(nowhere, [], "");
-    expect(names.posted).toBe("Untitled trip");
-    expect(names.prefilled).toBe("Untitled trip");
-    // The three ways this could have degraded instead. The last is the worst:
-    // `tripName: z.string().trim().min(1)` rejects it, so a blank name would
-    // turn a cosmetic gap into a trip that cannot be created at all.
-    expect(names.posted).not.toContain("undefined");
-    expect(names.posted).not.toBe(" trip");
-    expect(names.posted.trim()).not.toBe("");
-  });
-
-  test("what the traveller actually typed is written down, trimmed and unchanged", () => {
-    // The fallback must be a fallback. A fix that always names the country
-    // would satisfy every assertion above and silently rename everyone's trip.
-    // `unresolved` so this renders an empty itinerary rather than a second
-    // ten-day one: which fallback it would have used is not what is measured,
-    // and the cheaper render keeps this file's share of the jsdom project's
-    // wall-clock down (commit 84cd61e).
-    expect(shareCardNames(unresolved(peru.input), [], "  Machu Picchu week  ").posted).toBe(
-      "Machu Picchu week"
-    );
-  });
-});
-
-/**
- * The arming half of the finding above, and the reason a fix cannot simply
- * blank every default: China is a country somebody really does travel to, and
- * "China trip" is the *right* name for a China trip. What was wrong was
- * printing it on a Peruvian one.
- */
-describe("T30 jsdom — the saved name, armed from China's side", () => {
-  test("a blank-name China trip is still named, by its city and by its country", () => {
-    expect(shareCardNames(china.input, china.destinations, "").posted).toBe("Beijing trip");
-    expect(shareCardNames(unresolved(china.input), [], "").posted).toBe("China trip");
-  });
-
-  test("and the identical scan over those names reports the leak", () => {
-    // The scanner is live on this surface. Without this, `chinaLeaks` returning
-    // [] for the Peru names above would be indistinguishable from a scan that
-    // matches nothing at all.
-    expect(chinaLeaks(shareCardNames(unresolved(china.input), [], "").posted)).toEqual(["China"]);
-  });
-});
-
 describe("T30 jsdom — the positive half", () => {
   test("the wizard shows Peru's own facts", () => {
     // Stops the negative half passing because the page rendered nothing.
diff --git a/apps/web/lib/catalogExtras.test.ts b/apps/web/lib/catalogExtras.test.ts
index 6bfacb0..bf4dab4 100644
--- a/apps/web/lib/catalogExtras.test.ts
+++ b/apps/web/lib/catalogExtras.test.ts
@@ -120,9 +120,9 @@ describe("mergeCatalogHit", () => {
 /**
  * `app/plan/page.tsx` is the sole call site and no test may render it —
  * `vitest.config.mts` includes only lib/, scripts/ and components/. Without
- * this, the page could be reverted to the wholesale overwrite, or lose the
- * lazy-enrichment fetch entirely, with the whole suite green. Blunt on
- * purpose, in the manner of lib/contracts.test.ts.
+ * this, the page could be reverted to the wholesale overwrite, or call the
+ * retired enrich route again, with the whole suite green. Blunt on purpose, in
+ * the manner of lib/contracts.test.ts.
  */
 describe("app/plan/page.tsx wiring", () => {
   const source = readFileSync(join(import.meta.dirname, "..", "app", "plan", "page.tsx"), "utf8");
@@ -134,18 +134,13 @@ describe("app/plan/page.tsx wiring", () => {
     expect(source).not.toContain("[hit.qid]: hit");
   });
 
-  test("asks the enrich route for a description the pick arrived without", () => {
-    expect(source).toContain("/api/cities/enrich?ids=");
-  });
-
-  test("gates that fetch on shouldFetchEnrichment and records the id it asked about", () => {
-    // The guard and the ref are tested above as logic; this is the wiring
-    // that makes them run. Without it the page could keep the bare
-    // `merged.description !== null` check — which is false on every first
-    // search pick, Q-ids included — with the whole suite green.
-    expect(source).toContain("shouldFetchEnrichment(merged, enrichRequested.current)");
-    expect(source).toContain("enrichRequested.current.add(hit.qid)");
-    expect(source).not.toContain("if (merged.description !== null) return;");
+  test("no longer asks the retired enrich route for a description", () => {
+    // /api/cities/enrich needed a session and is retired in phase 1's slice A,
+    // so the explorer stands alone on the five reference routes. Enrichment
+    // returns with `reference/` in phase 4; `shouldFetchEnrichment` below and
+    // lib/server/cityEnrichment.ts wait for it, unwired.
+    expect(source).not.toContain("/api/cities/enrich");
+    expect(source).not.toContain("shouldFetchEnrichment");
   });
 });
 
diff --git a/apps/web/lib/contracts.test.ts b/apps/web/lib/contracts.test.ts
index 1e41008..9c81efd 100644
--- a/apps/web/lib/contracts.test.ts
+++ b/apps/web/lib/contracts.test.ts
@@ -183,9 +183,10 @@ describe("contract scan harness", () => {
 describe("C4 — one module fetches trip data", () => {
   /**
    * Matches per-trip endpoints only. The trailing slash is load-bearing: it
-   * excludes `POST /api/trips`, the collection-level create call in
-   * components/PlanStep.tsx, which does not read a trip payload and is
-   * therefore outside this contract rather than an exception to it.
+   * excludes the collection path `/api/trips`, where a trip was created rather
+   * than read (from components/PlanStep.tsx, until phase 1's slice A retired
+   * trip creation), so a call there is outside this contract rather than an
+   * exception to it.
    */
   const TRIP_PATH = "/api/trips/";
 
@@ -307,15 +308,6 @@ describe("C4 — one module fetches trip data", () => {
       true
     );
   });
-
-  it("does not treat trip creation as a payload read", () => {
-    // Pins the reasoning above, so a later widening of TRIP_PATH to
-    // "/api/trips" has to confront this deliberately rather than by accident.
-    const create = FILES.find((f) => f.path === "components/PlanStep.tsx");
-    expect(create).toBeDefined();
-    expect(create!.text).toContain('fetch("/api/trips"');
-    expect(create!.text.includes(TRIP_PATH)).toBe(false);
-  });
 });
 
 describe("C1 — one source of truth for the trip tabs", () => {
```
This diff deletes the `vi.mock("next/navigation", …)` block from `PlanStep.test.tsx` and from `worldwidePlan.test.tsx`. **Leave those two blocks in place for now.** The old card still calls `useRouter`, which jsdom cannot provide, so without the mock Step 2 would crash instead of failing on the assertions. Step 7 removes them.

In `worldwidePlan.test.tsx`, also keep `vi` in the `vitest` import for now. The diff's first hunk drops it, and a kept `vi.mock` without `vi` fails the whole file with `ReferenceError: vi is not defined` before any test runs. `PlanStep.test.tsx` keeps importing `vi` anyway, because its new tests use it.

- [ ] **Step 2: Run them and watch them fail**

```powershell
pnpm --filter @tsa/web --fail-if-no-match exec vitest run components/PlanStep.test.tsx components/plan/worldwidePlan.test.tsx lib/catalogExtras.test.ts lib/contracts.test.ts
```
Expected: `Tests  4 failed | 89 passed (93)`.
- `AssertionError: expected '"use client";\r\n\r\nimport { useEffe…' not to contain '/api/cities/enrich'` (catalogExtras: `/plan` still fetches enrichment).
- `TestingLibraryElementError: Unable to find an accessible element with the role "heading" and name "Shared trips are being rebuilt"` (PlanStep).
- `AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times` (PlanStep: the old card's button posts to `/api/trips`).
- `AssertionError: expected [ '一', '起', '走' ] to deeply equal []` (worldwidePlan: the card's Chinese caption is still rendered).

- [ ] **Step 3: Add the route allowlist to the browser test.** Apply to `apps/web/e2e/rebuilding.spec.ts`:

```diff
diff --git a/apps/web/e2e/rebuilding.spec.ts b/apps/web/e2e/rebuilding.spec.ts
index 2540831..fcee278 100644
--- a/apps/web/e2e/rebuilding.spec.ts
+++ b/apps/web/e2e/rebuilding.spec.ts
@@ -3,8 +3,10 @@ import { expect, test } from "@playwright/test";
 /**
  * The app while it is rebuilt (phase 1, slice A), signed out like every spec.
  *
- * The retired pages answer "being rebuilt", and the home page sends a visitor
- * to the explorer.
+ * The retired pages answer "being rebuilt", the home page sends a visitor to
+ * the explorer, and the explorer works on its own: nothing it calls may need
+ * the retired store, a session or auth. The unit tests cover each piece; this
+ * is the one place that sees which routes a real browser actually reaches.
  *
  * Production is not tested here. There `proxy.ts` rewrites every path to
  * `/rebuilding`, which `lib/proxy.test.ts` pins, and this server runs as
@@ -14,6 +16,15 @@ import { expect, test } from "@playwright/test";
 const HEADING = { level: 1, name: "Being rebuilt" } as const;
 const EXPLORER_LINK = { name: "Explore destinations" } as const;
 
+/** The reference-data routes slice A keeps. Everything else under /api/ is retired. */
+const KEPT_ROUTES = [
+  "/api/airports/search",
+  "/api/destinations",
+  "/api/destinations/resolve",
+  "/api/map/airports",
+  "/api/map/cities",
+];
+
 test("the home page says the app is being rebuilt, and opens the explorer", async ({ page }) => {
   await page.goto("/");
   await expect(page.getByRole("heading", HEADING)).toBeVisible();
@@ -30,3 +41,46 @@ for (const path of ["/rebuilding", "/trip/abc", "/b/abc", "/account", "/login",
     await expect(page.getByRole("link", EXPLORER_LINK)).toHaveCount(0);
   });
 }
+
+test("the explorer reaches only the kept reference routes, all the way to the plan", async ({ page }) => {
+  // Recorded from before navigation, so a request fired during hydration is
+  // caught too. Method and path, so a POST to a kept path would still show.
+  const calls: string[] = [];
+  page.on("request", (request) => {
+    const path = new URL(request.url()).pathname;
+    if (path.startsWith("/api/")) calls.push(`${request.method()} ${path}`);
+  });
+
+  await page.goto("/plan");
+  await page.getByRole("button", { name: /Next/ }).first().click();
+  await page.getByRole("combobox", { name: "Or pick from the list" }).selectOption({ label: "Peru" });
+  await expect(page.getByRole("group", { name: "Map of Peru" })).toBeVisible({ timeout: 30_000 });
+
+  // A GeoNames city picked from the search: before slice A this pick also
+  // asked the retired /api/cities/enrich for a description. The search's own
+  // request is debounced and a pick cancels it, so it is waited for first.
+  const searched = page.waitForResponse(
+    (response) => new URL(response.url()).pathname === "/api/destinations"
+  );
+  await page.getByRole("combobox", { name: "Where are you going?" }).fill("Cusco");
+  await searched;
+  await page.getByRole("option", { name: /^Cusco/ }).first().click();
+  await expect(page.getByRole("list", { name: "Selected places" })).toContainText("Cusco");
+
+  await page.getByRole("button", { name: /Build my plan/ }).click();
+  await expect(page.getByRole("heading", { name: "Shared trips are being rebuilt" })).toBeVisible({
+    timeout: 30_000,
+  });
+
+  // Armed: the walk really reached the routes it is meant to exercise.
+  const paths = calls.map((call) => call.split(" ")[1]);
+  expect(paths).toContain("/api/map/cities");
+  expect(paths).toContain("/api/destinations");
+  expect(paths).toContain("/api/destinations/resolve");
+
+  const stray = calls.filter((call) => {
+    const [method, path] = call.split(" ");
+    return method !== "GET" || !KEPT_ROUTES.includes(path);
+  });
+  expect(stray).toEqual([]);
+});
```

- [ ] **Step 4: Run it and watch it fail**

```powershell
pnpm --filter @tsa/web --fail-if-no-match exec playwright test e2e/rebuilding.spec.ts
```
Expected: 1 failed, the new explorer walk. `Locator: getByRole('heading', { name: 'Shared trips are being rebuilt' })`, `Error: element(s) not found`.

- [ ] **Step 5: Replace the shared-trip card with the note.** Apply to `apps/web/components/PlanStep.tsx`:

```diff
diff --git a/apps/web/components/PlanStep.tsx b/apps/web/components/PlanStep.tsx
index 552462e..45ca8d6 100644
--- a/apps/web/components/PlanStep.tsx
+++ b/apps/web/components/PlanStep.tsx
@@ -1,7 +1,5 @@
 "use client";
 
-import Link from "next/link";
-import { useRouter } from "next/navigation";
 import { useMemo, useState } from "react";
 import { GapNote } from "@/components/plan/GapNote";
 import { getCountry } from "@/lib/countries";
@@ -16,16 +14,9 @@ interface PlanStepProps {
   input: TripInput;
   /** Catalog-derived destinations resolved via /api/destinations/resolve. */
   extraDestinations: Destination[];
-  /**
-   * The month the traveller picked, when they picked one (spec §5.2). Sent to
-   * the server so it can derive the season through the country profile rather
-   * than trusting `input.season`, which this client computes with a
-   * northern-hemisphere table.
-   */
-  month?: number | null;
 }
 
-export function PlanStep({ input, extraDestinations, month }: PlanStepProps) {
+export function PlanStep({ input, extraDestinations }: PlanStepProps) {
   const allDestinations = useMemo(
     () => [...DESTINATIONS, ...extraDestinations],
     [extraDestinations]
@@ -145,17 +136,19 @@ export function PlanStep({ input, extraDestinations, month }: PlanStepProps) {
       </div>
 
       {/*
-        `profile.name` again, not `country.name`, and for the same reason the
-        headline uses it: the card names the trip that gets WRITTEN to the
-        database, so a fallback to the bare ISO code would persist "PE trip".
-        See `defaultTripName`.
+        Where the shared-trip card was. Creating a trip needs the store and
+        sign-in, both retired while the app is rebuilt (phase 1, slice A), so
+        this step makes no request at all. Not `role="note"`: that is the gap
+        note's, below, and a screen reader should hear one disclaimer there.
+        Hidden in print like the card was, since it says nothing about the trip.
       */}
-      <ShareTripCard
-        input={input}
-        destinationNames={destinations.map((d) => d.name)}
-        countryName={profile.name}
-        month={month}
-      />
+      <div className="mt-6 rounded-xl border-2 border-dashed border-[var(--accent-ink)]/40 bg-[var(--paper)] p-5 print:hidden">
+        <h3 className="font-display text-lg font-semibold">Shared trips are being rebuilt</h3>
+        <p className="mt-1 text-sm text-[var(--ink-2)]">
+          You can&apos;t save or share this plan yet. It stays on this page until the rebuilt app
+          can keep it.
+        </p>
+      </div>
 
       <div className="mt-8 grid gap-8 lg:grid-cols-3 print:block">
         <div className="space-y-5 lg:col-span-2">
@@ -258,172 +251,6 @@ export function PlanStep({ input, extraDestinations, month }: PlanStepProps) {
   );
 }
 
-/**
- * What a trip nobody has named is called.
- *
- * There used to be two answers to this and both of them said China: the
- * pre-filled field read `${destinationNames[0] ?? "China"} trip`, and a field
- * the traveller *cleared* fell back to the literal `"China trip"`. The second
- * one is the one that mattered — it is what `/api/trips` persists, so a
- * traveller planning Peru who blanked the box got a row in the database called
- * "China trip", shown on their dashboard, on the trip page, and to everyone
- * they sent the share link to. Unlike a wrong sentence on a page, that one
- * outlives the fix.
- *
- * One function for both, so they cannot disagree again, and one ladder:
- *
- *   1. **The first city.** The most specific true thing we know — "Lima trip".
- *      It is what the field has always pre-filled and it stays the first
- *      choice; a traveller reads their own itinerary, not their own passport.
- *   2. **The country.** `CountryProfile.name`, so "Peru trip" — matching the
- *      headline's "Your Peru itinerary" exactly, and resolved the same way.
- *      This is the branch that fires when the catalog resolved no destination
- *      (a `/api/destinations/resolve` miss lands the wizard on step 2 with an
- *      empty list), which is precisely where "China trip" used to appear.
- *   3. **Neither.** `"Untitled trip"` — country-free and never wrong. A blank
- *      `profile.name` means the code is not a country at all, and the profile
- *      is explicit that a caller must drop the name rather than print
- *      something in its place. "undefined trip", " trip" and "" are all worse:
- *      the last one fails `tripName: z.string().trim().min(1)` server-side and
- *      turns a cosmetic gap into a failed trip creation.
- *
- * A country-free default for every case ("Untitled trip" always) was the other
- * defensible option. It is rejected because it is *less* informative than what
- * the wizard already knows and already says one heading above — the defect was
- * never that the default named a place, it was that it named the wrong one.
- *
- * Trimmed before use so a field holding only spaces takes the fallback too:
- * `"   ".trim() || fallback` is the whole reason the caller uses `||` and not
- * `??`, and the same has to hold for the values feeding this.
- */
-function defaultTripName(firstDestination: string | undefined, countryName: string): string {
-  const subject = firstDestination?.trim() || countryName.trim();
-  return subject ? `${subject} trip` : "Untitled trip";
-}
-
-function ShareTripCard({
-  input,
-  destinationNames,
-  countryName,
-  month,
-}: {
-  input: TripInput;
-  destinationNames: string[];
-  /** `CountryProfile.name` — "Peru", "China", or `""`. See `defaultTripName`. */
-  countryName: string;
-  month?: number | null;
-}) {
-  const router = useRouter();
-  /**
-   * Computed once and used twice — as the field's initial value and as what a
-   * cleared field falls back to on submit. Those two being separate literals
-   * is exactly how the China default survived: nobody clearing the box was
-   * looking at the same string the writer used.
-   */
-  const fallbackName = defaultTripName(destinationNames[0], countryName);
-  const [tripName, setTripName] = useState(fallbackName);
-  const [startDate, setStartDate] = useState("");
-  const [creating, setCreating] = useState(false);
-  const [error, setError] = useState<string | null>(null);
-  const [unauthenticated, setUnauthenticated] = useState(false);
-
-  const create = async () => {
-    setCreating(true);
-    setError(null);
-    setUnauthenticated(false);
-    try {
-      const res = await fetch("/api/trips", {
-        method: "POST",
-        headers: { "Content-Type": "application/json" },
-        body: JSON.stringify({
-          // The written value. `||` and not `??`: a field cleared to "" or to
-          // whitespace has to take the fallback, and neither is nullish.
-          tripName: tripName.trim() || fallbackName,
-          startDate: startDate || null,
-          input,
-          // Omitted rather than sent as null when unset: the schema makes it
-          // optional, and null would fail validation.
-          ...(month ? { month } : {}),
-        }),
-      });
-      if (res.status === 401) {
-        setUnauthenticated(true);
-        setCreating(false);
-        return;
-      }
-      if (!res.ok) {
-        const body = (await res.json().catch(() => null)) as { error?: string } | null;
-        setError(
-          typeof body?.error === "string"
-            ? body.error
-            : "Couldn't create the shared trip — is the server running?"
-        );
-        setCreating(false);
-        return;
-      }
-      const json: { id: string; joinCode: string } = await res.json();
-      router.push(`/trip/${json.id}?code=${json.joinCode}`);
-    } catch {
-      setError("Couldn't create the shared trip — is the server running?");
-      setCreating(false);
-    }
-  };
-
-  return (
-    <div className="mt-6 rounded-xl border-2 border-dashed border-[var(--accent-ink)]/40 bg-[var(--paper)] p-5 print:hidden">
-      <h3 className="font-display text-lg font-semibold">Travelling together? 一起走</h3>
-      <p className="mt-1 text-sm text-[var(--ink-2)]">
-        Turn this plan into a shared trip: everyone joins with a code, sees the same live
-        itinerary, and ticks off packing and activities together.
-      </p>
-      <div className="mt-4 grid gap-3 sm:grid-cols-2">
-        <label className="text-xs font-medium text-[var(--ink-2)]">
-          Trip name
-          <input
-            type="text"
-            value={tripName}
-            onChange={(e) => setTripName(e.target.value)}
-            maxLength={60}
-            className="mt-1 w-full rounded-lg border border-[var(--line-1)] bg-[var(--surf-1)] px-3 py-2 text-sm text-[var(--ink-0)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
-          />
-        </label>
-        <label className="text-xs font-medium text-[var(--ink-2)]">
-          Start date (optional)
-          <input
-            type="date"
-            value={startDate}
-            onChange={(e) => setStartDate(e.target.value)}
-            className="mt-1 w-full rounded-lg border border-[var(--line-1)] bg-[var(--surf-1)] px-3 py-2 text-sm text-[var(--ink-0)] focus-visible:outline-2 focus-visible:outline-[var(--accent-ink)]"
-          />
-        </label>
-      </div>
-      <div className="mt-4 flex items-center gap-3">
-        <button
-          type="button"
-          onClick={() => void create()}
-          disabled={creating}
-          className="rounded-lg bg-[var(--seal)] px-5 py-2 text-sm font-semibold text-[var(--paper)] transition-colors hover:bg-[var(--seal)]/85 disabled:opacity-50"
-        >
-          {creating ? "Creating…" : "Start shared trip →"}
-        </button>
-        {unauthenticated ? (
-          <span className="text-xs text-[var(--seal)]">
-            Sign in to share this trip —{" "}
-            <Link
-              href={`/login?next=${encodeURIComponent(window.location.pathname)}`}
-              className="underline"
-            >
-              sign in
-            </Link>
-          </span>
-        ) : (
-          error && <span className="text-xs text-[var(--seal)]">{error}</span>
-        )}
-      </div>
-    </div>
-  );
-}
-
 function PlanItem({ item, travelEmoji }: { item: ScheduledItem; travelEmoji: string }) {
   const slot = SLOT_META[item.slot];
   const isFiller = item.kind === "free";
```

Run Step 4's command again. Expected: still 1 failed, and now for the right reason: `Error: expect(received).toEqual(expected) // deep equality`, with `"GET /api/cities/enrich"` received. `/plan` still asks the retired route for a description when a city is picked.

- [ ] **Step 6: Take the enrichment fetch and the card's `month` out of `/plan`.** Apply to `apps/web/app/plan/page.tsx`:

```diff
diff --git a/apps/web/app/plan/page.tsx b/apps/web/app/plan/page.tsx
index 2b6ae86..27b9ec2 100644
--- a/apps/web/app/plan/page.tsx
+++ b/apps/web/app/plan/page.tsx
@@ -1,12 +1,12 @@
 "use client";
 
-import { useEffect, useMemo, useRef, useState } from "react";
+import { useEffect, useMemo, useState } from "react";
 import { DestinationStep } from "@/components/DestinationStep";
 import { DetailsStep } from "@/components/DetailsStep";
 import { GeoNamesCredit } from "@/components/plan/GeoNamesCredit";
 import { PlanStep } from "@/components/PlanStep";
 import type { AirportPick } from "@/components/trip/AirportPicker";
-import { mergeCatalogHit, shouldFetchEnrichment } from "@/lib/catalogExtras";
+import { mergeCatalogHit } from "@/lib/catalogExtras";
 import { DESTINATIONS } from "@/lib/data";
 import { resolveTripSeason } from "@/lib/tripSeason";
 import { WIZARD_STEPS, canAdvance, tripCountryFromPicks } from "@/lib/wizard";
@@ -23,8 +23,9 @@ export default function PlanPage() {
   const [visited, setVisited] = useState<string[]>([]);
   /**
    * The arrival gateway chosen on the destinations map (spec §10.3, D3).
-   * Sent to the create route as `arrivalAirport` only when set, so an
-   * untouched trip keeps the server's own stamped default (Task 5).
+   * It went to the create route as `arrivalAirport`, which stamped the trip's
+   * gateways; that route is retired while the app is rebuilt (phase 1, slice
+   * A), so the plan input still carries it and nothing reads it yet.
    */
   const [arrival, setArrival] = useState<AirportPick | null>(null);
   const [season, setSeason] = useState<Season>("autumn");
@@ -86,16 +87,6 @@ export default function PlanPage() {
   const [resolving, setResolving] = useState(false);
   const [resolveError, setResolveError] = useState<string | null>(null);
   const [hydrated, setHydrated] = useState(false);
-  /**
-   * Ids the lazy enrichment fetch has already been fired for, this session.
-   *
-   * Never cleared. A city Wikidata has nothing for resolves to a cached miss,
-   * which leaves `description` null forever — so without this the guard in
-   * `shouldFetchEnrichment` stays true and every re-pick re-asks. A ref rather
-   * than state because nothing renders from it and a write must be visible to
-   * the very next `addCatalog` call in the same tick.
-   */
-  const enrichRequested = useRef<Set<string>>(new Set());
 
   useEffect(() => {
     try {
@@ -153,34 +144,18 @@ export default function PlanPage() {
    * catch the residue.
    */
   const addCatalog = (hit: CatalogHit) => {
-    // Read for the fetch decision only; the state writes below use the updater
-    // form so they cannot race a second pick in the same tick.
-    const merged = mergeCatalogHit(extras[hit.qid], hit);
+    // The updater form throughout, so a second pick in the same tick cannot
+    // race this one.
     setExtras((prev) => ({ ...prev, [hit.qid]: mergeCatalogHit(prev[hit.qid], hit) }));
     setSelected((prev) => (prev.includes(hit.qid) ? prev : [...prev, hit.qid]));
     // The country this city is in, captured at the only moment it is known —
     // see `pickedIn`. First write wins, so a re-pick under a switched scope
     // cannot move a city that is already on the trip.
     setPickedIn((prev) => (prev[hit.qid] ? prev : { ...prev, [hit.qid]: country }));
-    // A city outside the build-time top 30 arrives with no description; the
-    // first time anyone selects it, fetch one (spec §4). Fire-and-forget: the
-    // pick is already committed above and a missing blurb is an accepted
-    // state, so nothing here is allowed to block or to fail loudly.
-    //
-    // The three refusals live in `shouldFetchEnrichment` — see lib/catalogExtras.ts
-    // for why each one exists and why the guard is not inline here.
-    if (!shouldFetchEnrichment(merged, enrichRequested.current)) return;
-    enrichRequested.current.add(hit.qid);
-    void fetch(`/api/cities/enrich?ids=${encodeURIComponent(hit.qid)}`)
-      .then((res) => (res.ok ? res.json() : null))
-      .then((json: { enrichment?: Record<string, { description: string | null }> } | null) => {
-        const description = json?.enrichment?.[hit.qid]?.description ?? null;
-        if (description === null) return;
-        setExtras((prev) =>
-          prev[hit.qid] ? { ...prev, [hit.qid]: { ...prev[hit.qid], description } } : prev
-        );
-      })
-      .catch(() => {});
+    // A city outside the build-time top 30 arrives with no description, and
+    // keeps none for now: the route that fetched one needed a session and is
+    // retired in phase 1's slice A. Enrichment returns with `reference/` in
+    // phase 4, and lib/catalogExtras.ts keeps its guard for that.
   };
 
   const removeCatalog = (qid: string) => {
@@ -445,7 +420,7 @@ export default function PlanPage() {
           />
         )}
         {step === 2 && (
-          <PlanStep input={tripInput} extraDestinations={extraDestinations} month={month} />
+          <PlanStep input={tripInput} extraDestinations={extraDestinations} />
         )}
       </main>
 
```

- [ ] **Step 7: Remove the router mocks.** Delete the two blocks Step 1 left in place, and drop `vi` from `worldwidePlan.test.tsx`'s `vitest` import, so that both files now match Step 1's diff exactly. Then delete the two mocks in the files below, which also existed only for the card:

```diff
diff --git a/apps/web/components/map/MapExplorer.airports.test.tsx b/apps/web/components/map/MapExplorer.airports.test.tsx
index c789a1f..0665fd7 100644
--- a/apps/web/components/map/MapExplorer.airports.test.tsx
+++ b/apps/web/components/map/MapExplorer.airports.test.tsx
@@ -202,9 +202,10 @@ describe("the airport layer's toggle", () => {
     // the state went rather than about a dead button.
     expect(marks(container)).toHaveLength(2);
 
-    // `setPrefs` does two observable things, and neither happened: it writes
-    // the cookie `PrefsProvider` reads on mount, and it PUTs the whole object
-    // to the route whose schema would strip an unlisted key back out.
+    // `setPrefs` writes the cookie `PrefsProvider` reads on mount, and that did
+    // not happen. It also PUT the whole object to /api/me/prefs until phase
+    // 1's slice A retired that route; the request stays refused here so a
+    // persistence route for this toggle cannot quietly come back.
     expect(document.cookie).not.toContain(PREFS_COOKIE);
     expect(fetchMock.mock.calls.map((call) => String(call[0]))).not.toContain(
       "/api/me/prefs"
diff --git a/apps/web/components/plan/wizardCountry.test.tsx b/apps/web/components/plan/wizardCountry.test.tsx
index a1794fa..8c016a3 100644
--- a/apps/web/components/plan/wizardCountry.test.tsx
+++ b/apps/web/components/plan/wizardCountry.test.tsx
@@ -52,11 +52,6 @@ import { PrefsProvider } from "@/components/shell/PrefsProvider";
  */
 vi.setConfig({ testTimeout: 15_000, hookTimeout: 15_000 });
 
-/** `PlanStep` mounts `ShareTripCard`, which calls `useRouter`. */
-vi.mock("next/navigation", () => ({
-  useRouter: () => ({ push: vi.fn() }),
-}));
-
 /**
  * `WorldPane` pulls both world-level renderers in through `next/dynamic`.
  * Resolved up front and handed back synchronously, for the reason
```

- [ ] **Step 8: Run this task's files**

```powershell
pnpm --filter @tsa/web --fail-if-no-match exec vitest run components/PlanStep.test.tsx components/plan/worldwidePlan.test.tsx lib/catalogExtras.test.ts lib/contracts.test.ts components/plan/wizardCountry.test.tsx components/map/MapExplorer.airports.test.tsx
pnpm --filter @tsa/web --fail-if-no-match exec playwright test e2e/rebuilding.spec.ts
```
Expected: `Tests  107 passed (107)`, and 8 passed in the browser.

- [ ] **Step 9: Run every check for PR A2's final state**

```powershell
pnpm --filter @tsa/web --fail-if-no-match typecheck
pnpm --filter @tsa/web --fail-if-no-match test
pnpm --filter @tsa/web --fail-if-no-match build
pnpm --filter @tsa/web --fail-if-no-match exec playwright test
git checkout -- apps/web/next-env.d.ts
```
Expected:
- typecheck clean;
- unit tests: 167 files, 2,758 passed and 1 expected fail;
- build green, with 4 Turbopack "dynamic filesystem access" warnings, as on `main`;
- Playwright: 25 passed, chromium 21 and mobile 4.

- [ ] **Step 10: See production's answer locally**

```powershell
Push-Location apps\web
$env:VERCEL_ENV = "production"
pnpm exec next build
$server = Start-Process -FilePath "pnpm.cmd" -ArgumentList "exec", "next", "start", "-p", "3200" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 10
foreach ($p in "/", "/plan", "/api/destinations?q=lima&country=PE", "/world-globe.json", "/trip/abc") {
  $head = curl.exe -s -D - -o NUL "http://localhost:3200$p" | Where-Object { $_ -match "^(HTTP/|cache-control:|x-middleware-rewrite:)" }
  "$p -> " + ($head.Trim() -join " | ")
}
taskkill /PID $server.Id /T /F
Remove-Item Env:VERCEL_ENV
Pop-Location
netstat -ano | findstr :3200 | findstr LISTENING
git checkout -- apps/web/next-env.d.ts
```
Expected:
- **Each of the five paths:** `HTTP/1.1 200 OK | cache-control: no-store | x-middleware-rewrite: /rebuilding`.
  - Every path answers with the "being rebuilt" page.
  - The day-long public cache that `next.config.ts` gives `/world-globe.json` is replaced, not joined.
- **The last `netstat`:** prints nothing, so nothing is left listening.

`VERCEL_ENV` is read when the request arrives, not inlined at build: the spike built with it and started without it, and nothing was rewritten.

- [ ] **Step 11: Commit**

```powershell
git add apps/web/components/PlanStep.tsx apps/web/components/PlanStep.test.tsx apps/web/components/plan/worldwidePlan.test.tsx apps/web/components/plan/wizardCountry.test.tsx apps/web/components/map/MapExplorer.airports.test.tsx apps/web/app/plan/page.tsx apps/web/lib/catalogExtras.test.ts apps/web/lib/contracts.test.ts apps/web/e2e/rebuilding.spec.ts
git status --short
```
Expected, exactly:

```text
M  apps/web/app/plan/page.tsx
M  apps/web/components/PlanStep.test.tsx
M  apps/web/components/PlanStep.tsx
M  apps/web/components/map/MapExplorer.airports.test.tsx
M  apps/web/components/plan/wizardCountry.test.tsx
M  apps/web/components/plan/worldwidePlan.test.tsx
M  apps/web/e2e/rebuilding.spec.ts
M  apps/web/lib/catalogExtras.test.ts
M  apps/web/lib/contracts.test.ts
```

```powershell
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
@'
feat: let the explorer stand alone

The plan's last step shows a note instead of creating a trip, and /plan no
longer asks the retired enrichment route for city descriptions. A browser
test walks the explorer to the plan and checks that every request it makes
goes to one of the five kept reference routes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@ | git commit -F -
```


---

### Task 7: Open PR A2, look at it, merge it, check production (controlling session and owner)

**Who:** the controlling session and the owner. Not a subagent.

**Files:** none in the repo. Locally, the untracked browser-glance harness in `apps/web/.glance/` changes (Step 4).

- [ ] **Step 1: Rebase and push**

```powershell
git fetch origin
git rebase origin/main
git push -u origin feat/being-rebuilt
```
The nightly "Refresh cities" job commits `apps/web/data/cities-report.md` to `main`, and Task 4 changes that file too. If the rebase stops on it: regenerate the file rather than merging it by hand. The shards on disk are `main`'s, the generator is this branch's, and the result is what the nightly would have written with this branch merged. Run from the root of the checkout:

```powershell
Push-Location apps\web
@'
import { readFileSync, writeFileSync } from "node:fs";
import { buildReport } from "./scripts/cities/report.mjs";
const index = JSON.parse(readFileSync("public/cities/index.json", "utf8"));
const shards = new Map();
let total = 0;
let largest = { code: "", bytes: 0 };
for (const { code } of index.countries) {
  const json = readFileSync(`public/cities/${code}.json`, "utf8");
  const cities = JSON.parse(json).cities;
  shards.set(code, cities);
  total += cities.length;
  if (json.length > largest.bytes) largest = { code, bytes: json.length };
}
writeFileSync("data/cities-report.md", buildReport({ shards, total, generatedAt: index.generatedAt, largest }));
'@ | node --input-type=module -
Pop-Location
git add apps/web/data/cities-report.md
git -c core.editor=true rebase --continue
```
On an unchanged tree the script reproduces the committed report byte for byte (checked on 2026-10-03), and it needs no network. Keep the script ASCII: PowerShell 5.1 pipes text to a native program as ASCII unless `$OutputEncoding` says otherwise. Node's warning about the module type is harmless. `core.editor=true` stops the rebase from opening an editor.

- [ ] **Step 2: Open the pull request**

```powershell
gh pr create --base main --title "feat: show being rebuilt in production and let the explorer stand alone" --body-file <file>
```
The body says:
- what A2 does, task by task;
- the decisions it takes (A-D2, A-D3, A-D4 for the wall, A-D5, A-D7, A-D8);
- that the old store, the auth routes and `instrumentation.ts` still exist and are deleted in PR A3;
- each task's test-first evidence;
- how to look at the preview (Step 3).

It ends with the attribution line.

- [ ] **Step 3: CI, the preview, and the owner's look**
  - CI: `changes`, `tools`, `web`, `e2e` and `ci-ok` green; `mobile` skipped.
  - The Vercel preview of the head commit is Ready: `gh api repos/darrenCWJ/travel-super-app/commits/<sha>/status`.
  - The owner opens the preview (it sits behind Vercel's sign-in) and checks:
    - `/` shows "Being rebuilt" and an "Explore destinations" button, and the button opens the explorer;
    - the explorer: the globe, a country's map, a city search and "Build my plan" all work, and the last step says "Shared trips are being rebuilt";
    - `/login` and `/trip/anything` show "Being rebuilt" with no button;
    - the header shows only the brand and the display settings.

- [ ] **Step 4: Browser glance.** This is the standing rule: look at the rendered map before any UI merge. The harness is local and untracked, and since this pull request it runs signed out.
  - Copy `apps/web/.glance/` from the main checkout into the PR worktree's `apps/web/`.
  - In the copy, set `glance.config.ts` to exactly this, with `<worktree>` replaced by the worktree's absolute path written with forward slashes:

```ts
import { defineConfig, devices } from "@playwright/test";
import base from "../playwright.config";

// Local-only browser glance: the e2e harness's dev server, signed out like every spec since phase 1's slice A.
export default defineConfig({
  ...base,
  testDir: ".",
  testIgnore: [],
  reporter: "list",
  projects: [{ name: "glance", testMatch: /\.glance\.ts$/, use: { ...devices["Desktop Chrome"] } }],
  webServer: { ...(base.webServer as object), cwd: "<worktree>/apps/web" } as never,
});
```

  - Replace `login.glance.ts` with `home.glance.ts`:

```ts
import { test } from "@playwright/test";

test("home", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "C:/dev/travel-super-app/.superpowers/sdd/glance/0-home.png" });
});
```

  - Run it from the worktree's `apps/web`: `pnpm exec playwright test -c .glance/glance.config.ts`.
  - Read every screenshot in `C:\dev\travel-super-app\.superpowers\sdd\glance\`:
    - The globe, Japan's map and Japan at 390 px must look as they did before. The header is now only the brand and the display settings.
    - What sits under the map is unchanged.
    - The home page shows the being-rebuilt card and its button.
  - Copy the new `glance.config.ts` and `home.glance.ts` back to the main checkout's `apps/web/.glance/`, with its own path in `cwd`, so the next glance starts signed out.

- [ ] **Step 5: Merge.** The owner merges, or the controlling session does if the owner allowed it for this slice:

```powershell
gh pr merge <n> --rebase --match-head-commit <full sha of the tested head>
gh pr view <n> --json state
```
Delete the branch only after `state` says `MERGED`.

- [ ] **Step 6: Check production** once the production deployment of the merge commit is Ready:

```powershell
foreach ($p in "/", "/plan", "/world-globe.json", "/api/destinations?q=lima&country=PE") {
  $head = curl.exe -s -D - -o NUL "https://china-itinerary-planner.vercel.app$p" | Where-Object { $_ -match "^(HTTP/|cache-control:)" }
  "$p -> " + ($head.Trim() -join " | ")
}
((curl.exe -s https://china-itinerary-planner.vercel.app/plan) -join "") -match "Being rebuilt"
```
Expected:
- 200 on each path, and `True` from the last line.
- `cache-control: no-store` on each path. The spike saw it under `next start`, not on Vercel's edge. If production shows something else, record exactly what, and tell the owner before PR A3.

This is the gate's "Production shows 'being rebuilt'".

- [ ] **Step 7: Leave Vercel's variables alone.** `BETTER_AUTH_SECRET` must stay set on Vercel (Production and Preview) until PR A3 is deployed. Until then `instrumentation.ts` still exists, and it refuses to boot a deployment without a valid secret.


---

### Task 8: Delete the old store, the accounts and their routes (PR A3)

**Who:** an implementer subagent.

**Files:**
- Delete (57 files):
  - **The 27 API routes that reach the store, the session or auth.** These are everything under `apps/web/app/api/` except the five kept routes: `auth/[...all]`, `cities/enrich`, `destinations/refresh`, `me/prefs`, `me/trips`, `rates`, the 18 under `trips/`, and the 3 under `wallet/`.
  - **`apps/web/lib/server/`:** the eight files the spec names (`store.ts`, `tripStore.ts`, `pgStore.ts`, `db.ts`, `migrate.ts`, `auth.ts`, `session.ts`, `authz.ts`), and the 14 tests that pin them or the deleted routes: `authAccounts`, `authBoot`, `authSchema`, `authSchemaParity`, `authz`, `cityEnrichRoute`, `createTripRoute`, `currencyRoute`, `gatewaysRoute`, `migrate`, `pgStore`, `photosRoute`, `tripStore` and `updateTripRoute` (each `.test.ts`).
  - **The client side of the old sign-in:** `apps/web/lib/authClient.ts`, `apps/web/lib/authSecret.ts` and its test, `apps/web/instrumentation.ts`, and `apps/web/components/auth/` (`AccountChip.tsx`, `AuthForm.tsx`).
  - **The wallets and the old home page's list:** `apps/web/lib/walletSync.ts` and `apps/web/components/home/TripsDashboard.tsx` (decision A-D7).
- Modify: `apps/web/components/TripView.tsx`, which reads as signed out (decision A-D10)
- Modify, because they name deleted files: `apps/web/lib/contracts.test.ts`, `apps/web/lib/climateShard.test.ts`, `apps/web/scripts/cities/report.mjs`, `apps/web/data/cities-report.md`, `tools/boundaries/src/repo.test.ts`

**Interfaces:**
- Consumes: PR A2 merged. Nothing that renders reaches these files any more.
- Produces: a tree with no store, no Better Auth and no route but the five reference routes. `better-auth`, `better-sqlite3`, `pg` and `postgres` are still installed until Task 10, but nothing imports them. The orphans this leaves behind go in Task 9.

- [ ] **Step 1: Branch** (after PR A2 has merged, in the worktree the controlling session made for PR A3)

```powershell
git fetch origin
git switch -c refactor/retire-old-store origin/main
```

- [ ] **Step 2: Delete the roots.** These are whole directories wherever possible, so that no path with brackets reaches a git pathspec:

```powershell
git rm -r -q apps/web/app/api/auth apps/web/app/api/cities apps/web/app/api/destinations/refresh apps/web/app/api/me apps/web/app/api/rates apps/web/app/api/trips apps/web/app/api/wallet
git rm -r -q apps/web/components/auth apps/web/components/home
git rm -q apps/web/instrumentation.ts apps/web/lib/authClient.ts apps/web/lib/authSecret.ts apps/web/lib/authSecret.test.ts apps/web/lib/walletSync.ts
git rm -q apps/web/lib/server/store.ts apps/web/lib/server/tripStore.ts apps/web/lib/server/tripStore.test.ts apps/web/lib/server/pgStore.ts apps/web/lib/server/pgStore.test.ts apps/web/lib/server/db.ts apps/web/lib/server/migrate.ts apps/web/lib/server/migrate.test.ts
git rm -q apps/web/lib/server/auth.ts apps/web/lib/server/authAccounts.test.ts apps/web/lib/server/authBoot.test.ts apps/web/lib/server/authSchema.test.ts apps/web/lib/server/authSchemaParity.test.ts apps/web/lib/server/session.ts apps/web/lib/server/authz.ts apps/web/lib/server/authz.test.ts
git rm -q apps/web/lib/server/cityEnrichRoute.test.ts apps/web/lib/server/createTripRoute.test.ts apps/web/lib/server/currencyRoute.test.ts apps/web/lib/server/gatewaysRoute.test.ts apps/web/lib/server/photosRoute.test.ts apps/web/lib/server/updateTripRoute.test.ts
(git status --short | Select-String "^D ").Count
Get-ChildItem -Recurse -Filter route.ts apps/web/app/api | ForEach-Object { $_.FullName.Substring((Get-Location).Path.Length + 1) }
```
Expected: `57`, then the five kept routes and no others:

```text
apps\web\app\api\airports\search\route.ts
apps\web\app\api\destinations\route.ts
apps\web\app\api\destinations\resolve\route.ts
apps\web\app\api\map\airports\route.ts
apps\web\app\api\map\cities\route.ts
```
These commands were run on 2026-10-03 against PR A2's final tree. They delete exactly the 57 files the spike deleted.

- [ ] **Step 3: Type-check, and watch the one reference into deleted code fail.** Next keeps generated route types in `apps/web/.next`, and they still name the deleted routes, so delete that folder first:

```powershell
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue apps/web/.next
pnpm --filter @tsa/web --fail-if-no-match typecheck
```
Expected: exactly one error, `components/TripView.tsx(20,28): error TS2307: Cannot find module '@/lib/authClient' or its corresponding type declarations.` Without deleting `.next` first, you would also get 54 stale errors from `.next/types/validator.ts` and `.next/dev/types/validator.ts`.

- [ ] **Step 4: Watch the boundary scan fail on the same import, and on its pin**

```powershell
pnpm --filter @tsa/boundaries --fail-if-no-match exec vitest run src/repo.test.ts
```
Expected: `Tests  2 failed | 63 passed (65)`.
- `AssertionError: expected [ …(382) ] to include 'apps/web/lib/server/store.ts'`
- "cross no zone boundary" fails on `{"file": "apps/web/components/TripView.tsx", "line": 20, "reason": "cannot resolve @/lib/authClient: Cannot find module '@/lib/authClient'", …}`.

- [ ] **Step 5: Watch the contracts fail on the deleted files**

```powershell
pnpm --filter @tsa/web --fail-if-no-match exec vitest run lib/contracts.test.ts lib/climateShard.test.ts
```
Expected: `Tests  4 failed | 90 passed (94)`:
- `AssertionError: expected [ …(181) ] to include 'instrumentation.ts'`
- `AssertionError: expected [ …(14) ] to include 'components/home/TripsDashboard.tsx'`
- `AssertionError: expected [ 'app/plan/page.tsx', …(4) ] to deeply equal [ 'app/plan/page.tsx', …(3) ]`, the report's list against the files that credit GeoNames
- `AssertionError: components/home/TripsDashboard.tsx is not in the scanned tree: expected undefined to be defined`

- [ ] **Step 6: TripView reads as signed out.** It stays dormant (decision A-D10). Apply to `apps/web/components/TripView.tsx`:

```diff
diff --git a/apps/web/components/TripView.tsx b/apps/web/components/TripView.tsx
index 5138faf..efdca05 100644
--- a/apps/web/components/TripView.tsx
+++ b/apps/web/components/TripView.tsx
@@ -17,7 +17,6 @@ import { PlanTab } from "@/components/trip/PlanTab";
 import { PrivateGate } from "@/components/trip/PrivateGate";
 import type { TicketDraft } from "@/components/trip/TicketsTab";
 import { TodayTab } from "@/components/trip/TodayTab";
-import { authClient } from "@/lib/authClient";
 import { SEASONS } from "@/lib/meta";
 import { forgetMyTrip } from "@/lib/myTrips";
 import { TRIP_NAV, toTripTabId, type TripTabId } from "@/lib/nav";
@@ -35,7 +34,11 @@ export function TripView({ tripId }: { tripId: string }) {
   const { payload, guestView, loadState, forcedAt, mutate, toggleCheck, joinTrip, loadClaimable, probeCode } =
     useTripPayload(tripId);
   const [claimable, setClaimable] = useState<string[] | null>(null);
-  const { data: session, isPending: sessionPending } = authClient.useSession();
+  // Dormant since phase 1's slice A: nothing mounts this page, and its auth
+  // client went with the old sign-in. Read as signed out until phase 4 moves
+  // the trip features onto the new identity (slice C).
+  const session: { user: { name: string } } | null = null;
+  const sessionPending = false;
   const myName = payload?.myMemberName ?? "";
   /** Pre-accounts identity on this device — powers the claim preselect + banner. */
   const legacyName =
```

- [ ] **Step 7: Point the contracts and the report at files that exist**

```diff
diff --git a/apps/web/lib/climateShard.test.ts b/apps/web/lib/climateShard.test.ts
index 067e388..54bce8a 100644
--- a/apps/web/lib/climateShard.test.ts
+++ b/apps/web/lib/climateShard.test.ts
@@ -731,10 +731,11 @@ function c7AllowedLiteral(text: string): string {
 
 /**
  * The `test.each([` GeoNamesCredit floor in contracts.test.ts, the only
- * `test.each([` call there. Five paths since phase 1's slice A retired
- * app/b/[code]/page.tsx; the count is what proves the right literal was read.
+ * `test.each([` call there. Four paths since phase 1's slice A retired
+ * app/b/[code]/page.tsx and the trips dashboard; the count is what proves the
+ * right literal was read.
  */
-const CREDIT_FLOOR_SIZE = 5;
+const CREDIT_FLOOR_SIZE = 4;
 
 function shareBriefingFloorLiteral(text: string): string {
   const marker = "test.each([";
diff --git a/apps/web/lib/contracts.test.ts b/apps/web/lib/contracts.test.ts
index 9c81efd..67d7d76 100644
--- a/apps/web/lib/contracts.test.ts
+++ b/apps/web/lib/contracts.test.ts
@@ -126,10 +126,10 @@ function collect(): SourceFile[] {
   };
   for (const root of ROOTS) walk(join(process.cwd(), root));
   // The repo root, one level deep and not recursively — node_modules and .next
-  // are here too. `proxy.ts` and `instrumentation.ts` run on every request and
-  // can fetch a trip payload as readily as anything under app/, so a collector
-  // that stops at the four source directories reports a clean scan of a tree it
-  // never finished walking.
+  // are here too. `proxy.ts` runs on every request and can fetch a trip payload
+  // as readily as anything under app/, so a collector that stops at the four
+  // source directories reports a clean scan of a tree it never finished
+  // walking.
   for (const entry of readdirSync(process.cwd())) {
     const full = join(process.cwd(), entry);
     if (statSync(full).isDirectory() || !isScannable(entry)) continue;
@@ -149,14 +149,14 @@ describe("contract scan harness", () => {
   });
 
   it("reaches the repo root, not only the four source directories", () => {
-    // The proxy and instrumentation live at the root and are as capable of
-    // fetching a trip payload as anything under app/. A collector that cannot
-    // see them reports a clean scan of a tree it never finished walking, which
-    // is the failure mode the harness check above exists to prevent — it just
-    // did not extend to the root.
+    // The proxy lives at the root and is as capable of fetching a trip payload
+    // as anything under app/. A collector that cannot see it reports a clean
+    // scan of a tree it never finished walking, which is the failure mode the
+    // harness check above exists to prevent — it just did not extend to the
+    // root. (instrumentation.ts was the other root file until phase 1's slice
+    // A retired it with the old sign-in.)
     const paths = FILES.map((f) => f.path);
     expect(paths).toContain("proxy.ts");
-    expect(paths).toContain("instrumentation.ts");
   });
 
   it("does not let a URL's // blank the rest of the line", () => {
@@ -872,9 +872,12 @@ describe("C7 — every surface that renders GeoNames data credits it", () => {
   it("is armed — the scan finds the surfaces it is supposed to be scanning", () => {
     // A derived scan that matches nothing reports a clean tree it never walked,
     // which reads exactly like a passing contract. Two independent floors: a
-    // count, and the file the first version of this contract missed.
+    // count, and a named surface. The named one was the file the first version
+    // of this contract missed, TripsDashboard, until phase 1's slice A deleted
+    // it; the wizard's plan step, which renders every destination's name, took
+    // its place.
     expect(CANDIDATES.length).toBeGreaterThanOrEqual(6);
-    expect(CANDIDATES.map((f) => f.path)).toContain("components/home/TripsDashboard.tsx");
+    expect(CANDIDATES.map((f) => f.path)).toContain("components/PlanStep.tsx");
   });
 
   it("every file that renders GeoNames city names credits it, or is allowlisted", () => {
@@ -1182,14 +1185,14 @@ describe("C7 — every surface that renders GeoNames data credits it", () => {
       .map((f) => f.path)
       .sort();
     expect(listed).toEqual(actual);
-    expect(listed.length).toBeGreaterThanOrEqual(5);
+    // Four since phase 1's slice A retired /b/[code] and the trips dashboard.
+    expect(listed.length).toBeGreaterThanOrEqual(4);
   });
 
   test.each([
     "app/plan/page.tsx",
     "components/DestinationStep.tsx",
     "components/TripView.tsx",
-    "components/home/TripsDashboard.tsx",
     "components/shell/ShareBriefing.tsx",
   ])(
     "%s renders GeoNamesCredit",
```

```diff
diff --git a/apps/web/data/cities-report.md b/apps/web/data/cities-report.md
index fb1b18a..a79c929 100644
--- a/apps/web/data/cities-report.md
+++ b/apps/web/data/cities-report.md
@@ -24,7 +24,7 @@ and the modification notice are rendered in the UI by
   meant to be printed
 - `components/DestinationStep.tsx` — the destination step, under the search
 
-These three are mounted nowhere while the app is rebuilt, and keep their
+These two are mounted nowhere while the app is rebuilt, and keep their
 credit so that it comes back with them:
 
 - `components/TripView.tsx` — twice: the member view and the join-code guest
@@ -32,7 +32,6 @@ credit so that it comes back with them:
 - `components/shell/ShareBriefing.tsx` — the briefing behind Share › "View
   briefing". It carries its own credit rather than inheriting one, because
   nothing in its ancestry renders a credit
-- `components/home/TripsDashboard.tsx` — the signed-in home page trip list
 
 `lib/contracts.test.ts` (C7) fails if one of the files listed above drops it.
 That list is not the whole guarantee, because a hardcoded list cannot catch a
diff --git a/apps/web/scripts/cities/report.mjs b/apps/web/scripts/cities/report.mjs
index 998a764..5539d1a 100644
--- a/apps/web/scripts/cities/report.mjs
+++ b/apps/web/scripts/cities/report.mjs
@@ -65,7 +65,7 @@ export function buildReport({ shards, total, generatedAt, largest }) {
     '  meant to be printed',
     '- `components/DestinationStep.tsx` — the destination step, under the search',
     '',
-    'These three are mounted nowhere while the app is rebuilt, and keep their',
+    'These two are mounted nowhere while the app is rebuilt, and keep their',
     'credit so that it comes back with them:',
     '',
     '- `components/TripView.tsx` — twice: the member view and the join-code guest',
@@ -73,7 +73,6 @@ export function buildReport({ shards, total, generatedAt, largest }) {
     '- `components/shell/ShareBriefing.tsx` — the briefing behind Share › "View',
     '  briefing". It carries its own credit rather than inheriting one, because',
     '  nothing in its ancestry renders a credit',
-    '- `components/home/TripsDashboard.tsx` — the signed-in home page trip list',
     '',
     '`lib/contracts.test.ts` (C7) fails if one of the files listed above drops it.',
     'That list is not the whole guarantee, because a hardcoded list cannot catch a',
```

- [ ] **Step 8: Point the boundary scan's pin at a file that exists**

```diff
diff --git a/tools/boundaries/src/repo.test.ts b/tools/boundaries/src/repo.test.ts
index d94936d..7fef341 100644
--- a/tools/boundaries/src/repo.test.ts
+++ b/tools/boundaries/src/repo.test.ts
@@ -33,7 +33,7 @@ describe("this repo's imports", () => {
   it("reach the whole web app and the mobile app", () => {
     expect(scannedFiles).toContain("apps/web/proxy.ts");
     expect(scannedFiles).toContain("apps/web/app/layout.tsx");
-    expect(scannedFiles).toContain("apps/web/lib/server/store.ts");
+    expect(scannedFiles).toContain("apps/web/lib/server/catalog.ts");
     expect(scannedFiles).toContain("apps/mobile/src/app/index.tsx");
     expect(scannedFiles).toContain("apps/mobile/tests/home.test.tsx");
     expect(scannedFiles.length).toBeGreaterThan(300);
```

- [ ] **Step 9: Run the checks**

```powershell
pnpm --filter @tsa/web --fail-if-no-match typecheck
pnpm --filter @tsa/web --fail-if-no-match exec vitest run lib/contracts.test.ts lib/climateShard.test.ts
pnpm --filter @tsa/web --fail-if-no-match test
pnpm --filter "!@tsa/web" --filter "!@tsa/mobile" --fail-if-no-match typecheck
pnpm --filter "!@tsa/web" --filter "!@tsa/mobile" --fail-if-no-match test
pnpm --filter @tsa/boundaries --fail-if-no-match exec vitest run src/repo.test.ts src/ci.test.ts src/lockfile.test.ts
```
Expected:
- typecheck clean;
- the two contract files: `Tests  93 passed (93)`;
- unit tests: 152 files, 2,646 passed and 1 expected fail;
- tools: registry-gen 23 and boundaries 562;
- the three named guard files: 162.

- [ ] **Step 10: Commit**

```powershell
git add apps/web/components/TripView.tsx apps/web/lib/contracts.test.ts apps/web/lib/climateShard.test.ts apps/web/scripts/cities/report.mjs apps/web/data/cities-report.md tools/boundaries/src/repo.test.ts
git status --short | Select-String -NotMatch "^D "
(git status --short | Select-String "^D ").Count
```
Expected:
- The first command lists exactly these six modifications:

```text
M  apps/web/components/TripView.tsx
M  apps/web/data/cities-report.md
M  apps/web/lib/climateShard.test.ts
M  apps/web/lib/contracts.test.ts
M  apps/web/scripts/cities/report.mjs
M  tools/boundaries/src/repo.test.ts
```

- The second prints `57`.

```powershell
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
@'
refactor: delete the old store, accounts and their routes

Delete the SQLite and Postgres stores, Better Auth and its session and
authorisation helpers, the 27 API routes that reached them, the auth client,
the sign-in components, the wallet sync, the trips dashboard and the boot
check, with the tests of those files. TripView stays, unmounted, reading as
signed out. The contracts and the boundary scan now name files that remain.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@ | git commit -F -
```


---

### Task 9: Delete what only the retired code used (PR A3)

**Who:** an implementer subagent, on `refactor/retire-old-store`.

**Files:**
- Delete (15 files):
  - **Used only by the deleted routes:** `apps/web/lib/gatewayDefaults.ts` and its test, `apps/web/lib/redactTrip.ts` and its test, `apps/web/lib/server/gatewayGuard.ts`, `apps/web/lib/server/ids.ts`, `apps/web/lib/server/photoStore.ts` and its test, `apps/web/lib/server/trustedOrigins.ts` and its test, and `apps/web/lib/server/schemas.ts` and its test (its last importer is `photoStore.ts`).
  - **Imported now only by tests** (decision A-D12): `apps/web/lib/rates.ts` and its test, and `apps/web/lib/server/planService.ts`.
- Modify: the three tests that imported a deleted module as a helper: `apps/web/lib/money.test.ts`, `apps/web/lib/worldwidePlan.test.ts`, `apps/web/components/plan/worldwidePlan.test.tsx`

**Interfaces:**
- Consumes: Task 8's tree.
- Produces:
  - No module outside the dormant set that nothing but tests imports.
  - The two worldwide-plan tests build their trip snapshot from the live functions `buildTripData` wrapped: `resolveDestinations`, `buildItinerary` and `buildPackingList`. They keep their counts, 25 and 19.
  - `money.test.ts` drops its one guard against the retired rates allowlist, going from 57 tests to 56.
  - `zod` has no importer left. Task 10 removes the package.

- [ ] **Step 1: Prove what imports them.** Run this before deleting anything:

```powershell
git grep -n -P '(@/lib/(gatewayDefaults|redactTrip|rates)|@/lib/server/(gatewayGuard|ids|photoStore|trustedOrigins|schemas|planService)|\./(gatewayDefaults|redactTrip|rates|gatewayGuard|ids|photoStore|trustedOrigins|schemas|planService)|\./server/(planService|schemas|ids|photoStore|trustedOrigins|gatewayGuard))[\x22'']' -- apps/web
```
The pattern is PCRE (`-P`), with `\x22` standing for the double quote. PowerShell 5.1 would mangle a literal `"` inside an argument to a native program.
Expected, exactly these ten lines. Each is either a test of a module being deleted, a module being deleted, or one of the three tests this task rewrites:

```text
apps/web/components/plan/worldwidePlan.test.tsx:12:import { buildTripData } from "@/lib/server/planService";
apps/web/lib/gatewayDefaults.test.ts:5:import { applyDefaultGateways, defaultGateways } from "./gatewayDefaults";
apps/web/lib/money.test.ts:3:import { isKnownCurrencyCode } from "./rates";
apps/web/lib/rates.test.ts:16:} from "./rates";
apps/web/lib/redactTrip.test.ts:2:import { guestTripView } from "./redactTrip";
apps/web/lib/server/photoStore.test.ts:16:} from "./photoStore";
apps/web/lib/server/photoStore.ts:4:import { PHOTO_REF_RE } from "./schemas";
apps/web/lib/server/schemas.test.ts:13:} from "./schemas";
apps/web/lib/server/trustedOrigins.test.ts:2:import { trustedOriginsFrom } from "./trustedOrigins";
apps/web/lib/worldwidePlan.test.ts:23:import { buildTripData } from "./server/planService";
```
`gatewayGuard.ts` and `ids.ts` have no importer at all. If anything else appears, stop and report it: it would be a live importer this plan did not know about.

- [ ] **Step 2: Delete them**

```powershell
git rm -q apps/web/lib/gatewayDefaults.ts apps/web/lib/gatewayDefaults.test.ts apps/web/lib/redactTrip.ts apps/web/lib/redactTrip.test.ts apps/web/lib/rates.ts apps/web/lib/rates.test.ts
git rm -q apps/web/lib/server/gatewayGuard.ts apps/web/lib/server/ids.ts apps/web/lib/server/photoStore.ts apps/web/lib/server/photoStore.test.ts apps/web/lib/server/trustedOrigins.ts apps/web/lib/server/trustedOrigins.test.ts apps/web/lib/server/schemas.ts apps/web/lib/server/schemas.test.ts apps/web/lib/server/planService.ts
```

- [ ] **Step 3: Type-check, and watch the three helper imports fail**

```powershell
pnpm --filter @tsa/web --fail-if-no-match typecheck
```
Expected, exactly three errors:
- `components/plan/worldwidePlan.test.tsx(12,31): error TS2307: Cannot find module '@/lib/server/planService' or its corresponding type declarations.`
- `lib/money.test.ts(3,37): error TS2307: Cannot find module './rates' or its corresponding type declarations.`
- `lib/worldwidePlan.test.ts(23,31): error TS2307: Cannot find module './server/planService' or its corresponding type declarations.`

- [ ] **Step 4: Rewrite the three tests onto live code**

```diff
diff --git a/apps/web/lib/money.test.ts b/apps/web/lib/money.test.ts
index 5d3090a..fbd08dd 100644
--- a/apps/web/lib/money.test.ts
+++ b/apps/web/lib/money.test.ts
@@ -1,6 +1,5 @@
 import { describe, expect, test } from "vitest";
 import { getCountryProfile } from "./countryProfile";
-import { isKnownCurrencyCode } from "./rates";
 import { currencyPivot, type Expense, type Settlement } from "./tripShared";
 import {
   balancesByCurrency,
@@ -10,7 +9,6 @@ import {
   expensesOnDate,
   formatMinor,
   majorToMinor,
-  MINOR_UNIT_DIGITS,
   minorToMajorInput,
   minorUnitDigits,
   settleUp,
@@ -330,17 +328,8 @@ describe("currencySymbol", () => {
 });
 
 describe("currency-table drift guards (Minor 5 / Minor 6)", () => {
-  test("every MINOR_UNIT_DIGITS key is a currency this app actually recognises", () => {
-    // MINOR_UNIT_DIGITS (this file) and the rates allowlist
-    // (KNOWN_CURRENCY_CODES, lib/rates.ts) are maintained by different parts
-    // of this codebase with nothing enforcing they agree. A currency listed
-    // here that the allowlist doesn't know about would still format fine
-    // locally but could never have a live rate looked up for it.
-    for (const code of Object.keys(MINOR_UNIT_DIGITS)) {
-      expect(isKnownCurrencyCode(code)).toBe(true);
-    }
-  });
-
+  // The guard that every MINOR_UNIT_DIGITS key was on the live-rates allowlist
+  // went with that allowlist (the retired lib/rates.ts) in phase 1's slice A.
   test("every symbol collision in CONTEXTUAL_SYMBOLS has a disambiguation entry for every code that shares it", () => {
     // currencySymbol falls back to the ambiguous plain symbol whenever
     // SYMBOL_DISAMBIGUATION has no entry for a code — even after it has
```

```diff
diff --git a/apps/web/components/plan/worldwidePlan.test.tsx b/apps/web/components/plan/worldwidePlan.test.tsx
index 0cc0cc2..df7c7bf 100644
--- a/apps/web/components/plan/worldwidePlan.test.tsx
+++ b/apps/web/components/plan/worldwidePlan.test.tsx
@@ -6,10 +6,10 @@ import { PackingSection } from "@/components/trip/PackingSection";
 import { PlanTab } from "@/components/trip/PlanTab";
 import { buildBriefing, type Briefing } from "@/lib/briefing";
 import { chinaLeaks, peruMisses } from "@/lib/chinaLeakScan";
-import type { TripInput } from "@/lib/itinerary";
+import { buildItinerary, type TripInput } from "@/lib/itinerary";
 import { NEUTRAL_TRAVEL_EMOJI, RAIL_TRAVEL_EMOJI } from "@/lib/meta";
+import { buildPackingList } from "@/lib/packing";
 import { resolveDestinations } from "@/lib/server/catalog";
-import { buildTripData } from "@/lib/server/planService";
 import { resolveTripSeason } from "@/lib/tripSeason";
 import type { TripData, TripPayload } from "@/lib/tripShared";
 import type { Destination } from "@/lib/types";
@@ -61,7 +61,8 @@ interface Assembled {
 
 /**
  * The same assembly the node half runs, through the same production functions:
- * `resolveDestinations` → `buildTripData` → `buildBriefing`. Duplicated across
+ * `resolveDestinations` → `buildItinerary` and `buildPackingList` (what the
+ * retired `buildTripData` ran) → `buildBriefing`. Duplicated across
  * the two files rather than shared, because they run in different vitest
  * projects and importing one suite from the other re-runs its `describe` blocks
  * — the hazard `lib/tripFixtures.ts` documents. What the two files must NOT
@@ -79,11 +80,17 @@ function assemble(country: string, ids: string[]): Assembled {
     country,
   };
   const destinations = resolveDestinations(ids);
-  const data = buildTripData({
+  const data: TripData = {
     tripName: `${destinations[0]?.name ?? country} trip`,
     startDate: "2026-06-05",
     input,
-  });
+    plan: buildItinerary(input, destinations),
+    packing: buildPackingList(input, destinations),
+    foods: destinations
+      .filter((d) => d.foods.length > 0)
+      .map((d) => ({ destination: d.name, emoji: d.emoji, dishes: d.foods })),
+    destinationNames: destinations.map((d) => d.name),
+  };
   const payload: TripPayload = {
     id: "trip-t30",
     version: 1,
diff --git a/apps/web/lib/worldwidePlan.test.ts b/apps/web/lib/worldwidePlan.test.ts
index afd2208..c35cd18 100644
--- a/apps/web/lib/worldwidePlan.test.ts
+++ b/apps/web/lib/worldwidePlan.test.ts
@@ -14,13 +14,13 @@ import {
   CN_WINTER_CLOTHING_NOTE,
 } from "./countryData/cn";
 import { getCountryProfile } from "./countryProfile";
-import type { TripInput } from "./itinerary";
+import { buildItinerary, type TripInput } from "./itinerary";
 import { KIND_EMOJI, travelEmoji } from "./meta";
 import { HOLIDAY_BANDS } from "./months";
+import { buildPackingList } from "./packing";
 import { suggestRoute, type RoutePlace, type RouteSuggestion } from "./route";
 import { airportsForCountry } from "./server/airports";
 import { resolveDestinations } from "./server/catalog";
-import { buildTripData } from "./server/planService";
 import { resolveTripSeason } from "./tripSeason";
 import type { TripData, TripPayload } from "./tripShared";
 
@@ -117,9 +117,10 @@ interface Assembled {
 /**
  * One country's whole trip, assembled through the production path.
  *
- * `buildTripData` is what `/api/trips` calls — it resolves the destinations,
- * runs `buildItinerary` and `buildPackingList` and returns the snapshot that is
- * persisted. `suggestRoute` is what the wizard's map runs, handed the same
+ * The snapshot is built the way `buildTripData` built it for `/api/trips`,
+ * both retired in phase 1's slice A: resolve the destinations, run
+ * `buildItinerary` and `buildPackingList`, keep the foods and the names.
+ * `suggestRoute` is what the wizard's map runs, handed the same
  * country's transport profile and the same country's airports. `buildBriefing`
  * is what the unauthenticated `/b/[code]` page calls, in its redacted form.
  *
@@ -131,11 +132,17 @@ function assemble(country: string, ids: string[]): Assembled {
   const season = resolveTripSeason("summer", JUNE, country);
   const input = tripFor(country, ids, season);
   const destinations = resolveDestinations(ids);
-  const data = buildTripData({
+  const data: TripData = {
     tripName: `${destinations[0]?.name ?? country} trip`,
     startDate: "2026-06-05",
     input,
-  });
+    plan: buildItinerary(input, destinations),
+    packing: buildPackingList(input, destinations),
+    foods: destinations
+      .filter((d) => d.foods.length > 0)
+      .map((d) => ({ destination: d.name, emoji: d.emoji, dishes: d.foods })),
+    destinationNames: destinations.map((d) => d.name),
+  };
   const profile = getCountryProfile(country);
   const places: RoutePlace[] = destinations.map((d) => ({
     id: d.id,
@@ -386,7 +393,7 @@ describe("T30 — the negative half", () => {
    * The one scanned key where "clean" and "empty" are the same thing, said out
    * loud so it is a known limit rather than an accident.
    *
-   * `buildTripData` filters `foods` to destinations with dishes, and a GeoNames
+   * The snapshot filters `foods` to destinations with dishes, and a GeoNames
    * city carries none — so `peru.data.foods` is `[]` by construction and
    * scanning it can never fail. That is the design's own "these make Peru
    * *thin*, not *wrong*" non-goal, not a defect. The China side is asserted
```

- [ ] **Step 5: Run them**

```powershell
pnpm --filter @tsa/web --fail-if-no-match typecheck
pnpm --filter @tsa/web --fail-if-no-match exec vitest run lib/money.test.ts lib/worldwidePlan.test.ts components/plan/worldwidePlan.test.tsx
```
Expected: typecheck clean, and `Tests  100 passed (100)`: money 56, the node worldwide-plan test 25, the jsdom one 19.

- [ ] **Step 6: Check that nothing imports a package Task 10 removes, then run the suite**

```powershell
git grep -n -P '(from|import|require\()\s*\(?[\x22''](better-auth|better-sqlite3|pg|postgres|zod)([\x22''/])' -- apps/web
pnpm --filter @tsa/web --fail-if-no-match test
```
Expected:
- `git grep` prints nothing, and exits 1, which is how it reports "no match". On `main` the same command finds 14 imports.
- Unit tests: 146 files, 2,528 passed and 1 expected fail.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/lib/money.test.ts apps/web/lib/worldwidePlan.test.ts apps/web/components/plan/worldwidePlan.test.tsx
git status --short
```
Expected, exactly:

```text
M  apps/web/components/plan/worldwidePlan.test.tsx
D  apps/web/lib/gatewayDefaults.test.ts
D  apps/web/lib/gatewayDefaults.ts
M  apps/web/lib/money.test.ts
D  apps/web/lib/rates.test.ts
D  apps/web/lib/rates.ts
D  apps/web/lib/redactTrip.test.ts
D  apps/web/lib/redactTrip.ts
D  apps/web/lib/server/gatewayGuard.ts
D  apps/web/lib/server/ids.ts
D  apps/web/lib/server/photoStore.test.ts
D  apps/web/lib/server/photoStore.ts
D  apps/web/lib/server/planService.ts
D  apps/web/lib/server/schemas.test.ts
D  apps/web/lib/server/schemas.ts
D  apps/web/lib/server/trustedOrigins.test.ts
D  apps/web/lib/server/trustedOrigins.ts
M  apps/web/lib/worldwidePlan.test.ts
```

```powershell
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
@'
refactor: delete what only the retired code used

Delete the gateway defaults, guest redaction, the gateway guard, ids, the
photo store, trusted origins and the request schemas, which only the
retired routes used, and the live-rates module and the trip-snapshot
service, which only their own and other modules' tests still imported. The
worldwide-plan tests now build the snapshot from the live generators, and
the money test drops its guard against the retired rates allowlist.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@ | git commit -F -
```


---

### Task 10: Drop the packages and settings the old store needed (PR A3)

**Who:** an implementer subagent, on `refactor/retire-old-store`.

**Files:**
- Modify: `apps/web/package.json`. `better-auth`, `better-sqlite3`, `@types/better-sqlite3`, `pg`, `postgres` and `zod` go from `dependencies`, and `@types/pg` from `devDependencies`.
- Modify: `pnpm-lock.yaml` (by `pnpm install`, never by hand)
- Modify: `pnpm-workspace.yaml`. The `allowBuilds` block and its comment go.
- Modify: `apps/web/next.config.ts`. `serverExternalPackages` goes.
- Modify: `.gitignore`. The lines for `app.db*`, the photo uploads and the old e2e session go (decision A-D11).
- Modify: `apps/web/.vercelignore`. The three `data/app.db*` lines go. Keep the file: slice E adds `.claude` to it.

**Interfaces:**
- Consumes: Task 9's tree, in which nothing imports these packages (Task 9, Step 6).
- Produces: a lockfile 40 packages smaller, and no ignore rule for a file the old store wrote.

- [ ] **Step 1: Edit the manifests**

```diff
diff --git a/apps/web/next.config.ts b/apps/web/next.config.ts
index 1a862fc..0f2aad5 100644
--- a/apps/web/next.config.ts
+++ b/apps/web/next.config.ts
@@ -1,7 +1,6 @@
 import type { NextConfig } from "next";
 
 const nextConfig: NextConfig = {
-  serverExternalPackages: ["better-sqlite3"],
   /**
    * Scope: this block describes the FIRST rule below only — the committed
    * topology assets. Every rule after it carries its own docblock and its own
diff --git a/apps/web/package.json b/apps/web/package.json
index 749b512..9392938 100644
--- a/apps/web/package.json
+++ b/apps/web/package.json
@@ -13,18 +13,12 @@
     "test:e2e:ui": "playwright test --ui"
   },
   "dependencies": {
-    "@types/better-sqlite3": "^9.6.0",
-    "better-auth": "1.7.1",
-    "better-sqlite3": "^13.0.3",
     "d3-geo": "^3.1.1",
     "next": "^16.3.6",
-    "pg": "8.23.0",
-    "postgres": "^3.4.9",
     "react": "catalog:",
     "react-dom": "catalog:",
     "server-only": "^0.0.1",
-    "topojson-client": "^3.1.0",
-    "zod": "^4.4.3"
+    "topojson-client": "^3.1.0"
   },
   "devDependencies": {
     "@playwright/test": "^1.62.1",
@@ -35,7 +29,6 @@
     "@types/d3-geo": "^3.1.1",
     "@types/geojson": "^7946.0.16",
     "@types/node": "catalog:",
-    "@types/pg": "^8.23.1",
     "@types/react": "^19.2.18",
     "@types/react-dom": "^19.2.4",
     "@types/topojson-client": "^3.1.5",
diff --git a/pnpm-workspace.yaml b/pnpm-workspace.yaml
index f49b936..82e8b85 100644
--- a/pnpm-workspace.yaml
+++ b/pnpm-workspace.yaml
@@ -42,11 +42,3 @@ packageExtensions:
 # it needs none while every package that depends on it says "catalog:".
 overrides:
   react-dom: "catalog:"
-
-# Dependency install scripts stay OFF unless a package is listed `true` here.
-# better-sqlite3 ships prebuilt binaries (prebuilds/win32-x64.node, linux-x64)
-# and this machine has no C++ toolchain, so the `node-gyp rebuild` npm used to
-# infer for it must never run. `false` records that decision and silences the
-# "ignored build scripts" warning.
-allowBuilds:
-  better-sqlite3: false
```
`zod` was the last entry in `dependencies`. Deleting its line leaves a trailing comma after `topojson-client` that JSON does not allow, so delete that comma too, as the diff shows.

- [ ] **Step 2: Update the lockfile**

```powershell
pnpm install
pnpm install --frozen-lockfile
git diff --stat pnpm-lock.yaml
```
Expected:
- The first install prints `Packages: -40`. Its only warning is `6 deprecated subdependencies found: abab@2.0.6, domexception@4.0.0, glob@7.2.3, inflight@1.0.6, uuid@7.0.3, whatwg-encoding@2.0.0`. That warning comes from the mobile app's Jest and predates this change.
- The frozen install is clean.
- The lockfile diff is `2 insertions(+), 460 deletions(-)`.
- There is no "ignored build scripts" warning: with `better-sqlite3` gone, nothing has a build script to ignore.

- [ ] **Step 3: Delete the old store's leftover local files from this checkout,** then stop ignoring them. The repository is public. Once these lines are gone, a SQLite file written by the old store's tests or a session file from the old e2e setup would show up as untracked and could be committed.

```powershell
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue apps/web/data/app.db, apps/web/data/app.db-shm, apps/web/data/app.db-wal, apps/web/data/uploads, apps/web/e2e/.auth
```

```diff
diff --git a/.gitignore b/.gitignore
index 0a14f3a..e5b2d7a 100644
--- a/.gitignore
+++ b/.gitignore
@@ -33,12 +33,9 @@ pnpm-debug.log*
 # vercel
 .vercel
 
-# local data (SQLite db, ingest artifacts)
-/apps/web/data/app.db*
+# local data (ingest artifacts)
 /apps/web/data/ingest.log
 /apps/web/data/.ingest.lock
-# photos uploaded to a local server (apps/web/lib/server/photoStore.ts writes them here)
-/apps/web/data/uploads/
 
 # Written by tools/registry-gen on every install (spec §0 "Registry"); never committed,
 # so parallel feature branches never conflict on it.
@@ -53,7 +50,6 @@ pnpm-debug.log*
 /apps/web/playwright-report/
 /apps/web/blob-report/
 /apps/web/playwright/.cache/
-/apps/web/e2e/.auth/
 
 # the local browser-glance harness (never committed)
 /apps/web/.glance/
diff --git a/apps/web/.vercelignore b/apps/web/.vercelignore
index 2a0fa46..93cc686 100644
--- a/apps/web/.vercelignore
+++ b/apps/web/.vercelignore
@@ -1,8 +1,5 @@
 .next
 node_modules
-data/app.db
-data/app.db-shm
-data/app.db-wal
 data/ingest.log
 data/.ingest.lock
 docs
```

```powershell
git status --porcelain --ignored -- apps/web/data apps/web/e2e
```
Expected: no line naming `app.db`, `uploads` or `.auth`.

- [ ] **Step 4: Run the checks**

```powershell
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue apps/web/.next
pnpm --filter @tsa/web --fail-if-no-match typecheck
pnpm --filter @tsa/web --fail-if-no-match test
pnpm --filter @tsa/web --fail-if-no-match build
pnpm --filter "!@tsa/web" --filter "!@tsa/mobile" --fail-if-no-match typecheck
pnpm --filter "!@tsa/web" --filter "!@tsa/mobile" --fail-if-no-match test
pnpm --filter @tsa/boundaries --fail-if-no-match exec vitest run src/repo.test.ts src/ci.test.ts src/lockfile.test.ts
git checkout -- apps/web/next-env.d.ts
```
Expected:
- typecheck clean;
- unit tests: 146 files, 2,528 passed and 1 expected fail;
- build green, with 2 Turbopack warnings, both in `lib/server/catalog.ts` (the two in the deleted `photoStore.ts` are gone);
- tools: 23 and 562;
- the named guards: 162, including `lockfile.test.ts`, which checks the lockfile's one React and the Expo SDK's native versions.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/package.json pnpm-lock.yaml pnpm-workspace.yaml apps/web/next.config.ts .gitignore apps/web/.vercelignore
git status --short
```
Expected, exactly:

```text
M  .gitignore
M  apps/web/.vercelignore
M  apps/web/next.config.ts
M  apps/web/package.json
M  pnpm-lock.yaml
M  pnpm-workspace.yaml
```

```powershell
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
@'
chore: drop the packages and settings the old store needed

Remove better-auth, better-sqlite3, pg, postgres, their types and zod from
the web app, the allowBuilds entry for better-sqlite3 and the
serverExternalPackages setting, and stop ignoring the SQLite files, the
photo uploads and the old e2e session, after deleting the local copies.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@ | git commit -F -
```


---

### Task 11: Say what the app is now (PR A3)

**Who:** an implementer subagent, on `refactor/retire-old-store`.

**Files:**
- Modify: `README.md`. The app needs no database or secret, production shows "being rebuilt", and the explorer is on previews and local development. The routes table lists the five kept routes, and the local production check is written for PowerShell.
- Modify: `apps/web/.env.example`. It documents only `CATALOG_URL`, and explains `VERCEL_ENV`.
- Modify: 37 source and test files whose comments cited a file, route or function this slice deleted. **Comments only; no code changes.**

**Interfaces:**
- Consumes: Task 10's tree.
- Produces: no behaviour change. Every count from Task 10 holds.

**Not changed:** the explorer's plan tip "Set your home currency on the Money tab" (`currencyTip()` in `lib/countryTips.ts`). It points at a tab nobody can reach while the app is rebuilt, but the template also feeds the dormant trip and briefing views, and five tests in three files pin it. The execution record lists it for phase 4.

- [ ] **Step 1: Rewrite the README's account of the app**

```diff
diff --git a/README.md b/README.md
index 279e2fb..2e2e18e 100644
--- a/README.md
+++ b/README.md
@@ -1,14 +1,19 @@
 # China Itinerary Planner 游
 
-**Live**: <https://china-itinerary-planner.vercel.app> · **Source**: <https://github.com/darrenCWJ/travel-super-app>
+**Live** (showing "being rebuilt" for now): <https://china-itinerary-planner.vercel.app> · **Source**: <https://github.com/darrenCWJ/travel-super-app>
 
 Plan a trip to any country in three steps — pick places on a globe and a
-country map, say when and who is going, get a day-by-day plan — then take
-everyone along: shared trips with accounts, a live-syncing itinerary you can
-tick off mid-trip, tickets, packing, money and a journal. It began as a China
-planner and China is still the deepest country, with 16 curated destinations
-and a catalog of every Chinese city; beside them sits a worldwide catalog of
-58,759 GeoNames cities across 246 countries.
+country map, say when and who is going, get a day-by-day plan. It began as a
+China planner and China is still the deepest country, with 16 curated
+destinations and a catalog of every Chinese city; beside them sits a worldwide
+catalog of 58,759 GeoNames cities across 246 countries.
+
+**Being rebuilt.** The app is being rebuilt from the ground up as a travel
+super app (the design is in `docs/superpowers/specs/`). Until the new version
+is ready, production answers every path with a "being rebuilt" page, and
+shared trips, accounts and sign-in are switched off everywhere. On preview
+deployments and in local development the destination explorer on `/plan`
+still works, and the home page links to it.
 
 ## Features
 
@@ -26,9 +31,8 @@ and a catalog of every Chinese city; beside them sits a worldwide catalog of
   China from its curated climate tables, everywhere else from CHELSA 1981–2010
   normals with an elevation correction, under a legend and a note that says
   what the model does not know.
-- **Airports and gateways** — an airport layer on every country map, a
-  suggested route with real airport-pair estimates, and fly-in/fly-out
-  gateways stamped on every trip.
+- **Airports** — an airport layer on every country map, and a suggested route
+  with real airport-pair estimates.
 - **Country facts as tips** — currency, voltage and plugs, emergency numbers,
   driving side, calling code and languages from Wikidata; a gap note names
   what no source supplies rather than guessing.
@@ -40,60 +44,24 @@ and a catalog of every Chinese city; beside them sits a worldwide catalog of
 - **"Already been" tracking** — visited places drop out of selection and can
   be restored any time.
 
-### Travelling together (shared trips)
-- Turn any plan into a **shared trip**: members sign in, and a 6-letter join
-  code gives anyone a read-only view of the same live itinerary.
-- **Shared ticking** — packing items and activities can be checked off by any
-  member, with attribution ("done by Bob"), synced to all members within
-  seconds (polling).
-- **Trip-app mode** — set a start date and the current day is badged **TODAY**;
-  keep the page open on your phone during the trip.
+### Switched off while the app is rebuilt
+Shared trips with join codes, accounts and sign-in, the trip tabs (Plan,
+Today, Kit, Money), the journal and briefing links are retired with the store
+that held them. Their components stay in the tree, unmounted, until the new
+app brings each feature back.
 
-### During the trip
-- **Plan tab** — the day-by-day plan, editable by any member, with the route
-  map and the gateways strip.
-- **Today tab** — countdown before departure; during the trip a live
-  dashboard: day X of Y, now/next by time of day, tick-off synced with the
-  itinerary, spend snapshot and stats; a recap once you're home.
-- **Kit tab** — tickets, trains and stays with airport autocomplete for
-  flights, and the packing list.
-- **Money tab** — multi-currency group expenses with equal splits,
-  per-currency totals, optional converted totals via manual rates,
-  who-owes-whom balances, settle-up suggestions and repayment tracking.
-- **Trip journal** — day-by-day entries from any member, with photo uploads
-  on self-hosted installs (writable disk) and photo links everywhere.
+### API
+Five read-only routes over committed reference data. None needs a session or
+a database, and in production each answers with the "being rebuilt" page like
+every other path.
 
-### API-first
 | Endpoint | Method | Purpose |
 |---|---|---|
-| `/api/trips` | POST | Create a shared trip (returns id + join code) |
-| `/api/trips/:id` | GET · PATCH | Trip state (member session = full; `?code=` = guest view; else 403) · update the input, plan regenerates (version-guarded) |
-| `/api/trips/:id/plan` | POST | One member edit to the plan — add, update, remove or move an item, add a day (version-guarded) |
-| `/api/trips/:id/join` | POST · GET | Join/claim with account + code · list claimable names |
-| `/api/trips/:id/checks` | POST | Tick/untick an item `{ key, checked }` (attributed to the signed-in member) |
-| `/api/trips/:id/tickets` (+`/:ticketId`) | POST · PATCH/DELETE | Tickets and bookings (members only) |
-| `/api/trips/:id/expenses` (+`/:expenseId`) | POST · PATCH/DELETE | Group expenses (members only) |
-| `/api/trips/:id/settlements` (+`/:settlementId`) | POST · DELETE | Repayments (members only) |
-| `/api/trips/:id/journal` (+`/:entryId`) | POST · PATCH/DELETE | Journal (edits author-only) |
-| `/api/trips/:id/currency` | PUT | Home currency + conversion rates (version-guarded) |
-| `/api/trips/:id/gateways` | PUT | Arrival and departure airports, IATA or null (members only; never rebuilds the plan) |
-| `/api/trips/:id/briefing` | GET · POST | Read the share-link state · create, toggle or revoke the share link (members only) |
-| `/api/trips/:id/photos` (+`/:photoId`) | POST · GET | Photo upload/serve (writable hosts) |
-| `/api/me/trips` | GET | Signed-in user's trips |
-| `/api/me/prefs` | GET · PUT | The signed-in user's preferences (accent, globe or flat world) |
-| `/api/auth/*` | * | Better Auth (signup, login, sessions, admin) |
 | `/api/destinations` | GET | Search the Wikidata catalog of Chinese cities (`?q=&country=`) |
 | `/api/destinations/resolve` | GET | Full plannable data for catalog and GeoNames ids (`?ids=`) |
-| `/api/destinations/refresh` | POST · GET | **Self-update**: re-run the Wikidata/Wikipedia ingestion (local only) · catalog status (age, counts, refresh running?) |
 | `/api/map/cities` | GET | The Wikidata catalog's cities for one country (`?country=`) |
 | `/api/map/airports` | GET | One country's airports, for the map layer and the route estimator (`?country=`) |
-| `/api/airports/search` | GET | Airport autocomplete for flight tickets and gateways (`?q=`) |
-| `/api/cities/enrich` | GET | Wikipedia enrichment for cities the build did not pre-fetch (signed in) |
-| `/api/rates` | GET | A cached exchange-rate table, for display only (`?base=`, signed in) |
-| `/api/wallet` · `/api/wallet/fetch` · `/api/wallet/put` | POST | This device's trip list, synced by a secret code: create · fetch · version-guarded replace |
-
-All inputs are validated with Zod. Trip state lives in Postgres on Vercel and
-in SQLite locally — see Deploying.
+| `/api/airports/search` | GET | Airport autocomplete for the arrival gateway (`?q=`) |
 
 ## Getting started
 
@@ -106,9 +74,16 @@ pnpm test:e2e                  # Playwright, against a dev server it starts on :
 pnpm build                     # what CI runs after the tests
 ```
 
-`.env.local` is optional locally: with no `BETTER_AUTH_SECRET` the app runs in
-no-accounts mode, with the login wall off and everything open. Fill the secret
-in to exercise accounts and the wall.
+`.env.local` is optional: while the app is rebuilt nothing in it is required,
+and no database or secret is needed. To see what production shows, run the
+production server as Vercel's production environment (PowerShell shown; the
+variable stays set in that window until you clear it):
+
+```powershell
+pnpm build
+$env:VERCEL_ENV = "production"; pnpm --filter @tsa/web start   # http://localhost:3000; Ctrl+C stops it
+Remove-Item Env:VERCEL_ENV                                     # back to development in this window
+```
 
 ### The mobile app
 
@@ -159,18 +134,18 @@ does not.
 package.json            the workspace root: pins pnpm 10, and its scripts delegate to the packages
 pnpm-workspace.yaml     the workspace's packages, the version catalog and every pnpm setting
 apps/web/               the Next.js app, package @tsa/web; everything below is relative to it
-  app/                  /plan wizard, / trips home, /trip/[id], /b/[code] briefing, /login + /signup, /account, /api routes
+  app/                  /plan wizard (the explorer), / home, /rebuilding, the retired paths' "being rebuilt" stubs, /api reference-data routes
   components/
-    auth/  briefing/  home/  plan/  shell/  trip/
+    briefing/  plan/  shell/  trip/   (briefing/ and trip/ are unmounted until the new app needs them)
     map/                the globe, the country map (CountryLevel + UnitsLayer/AirportLayer/MarkerLayer, countryView, markerGeometry, markerLayout, useMarkerSelection), the province level, hooks
   lib/                  pure planning logic, shared types, clients (+ tests beside each module)
     data/               the 16 curated destinations
-    server/             airports, catalog, cityIndex (server-only artifacts); auth, session, stores (sqlite + postgres), schemas
+    server/             airports, catalog, cityIndex (server-only artifacts); cityEnrichment, unwired until enrichment returns
     contracts.test.ts   whole-tree contracts: one nav, one credit per surface, no second fetch of trip data
   scripts/              ingest-*.mjs and enrich-cities.mjs (entries) with their modules under scripts/{climate,cities,enrich,country-facts}/; build-*.mjs (geometry); sample-climate-anchors.mjs
   data/                 committed artifacts and their reports (airports, catalog, cities-index, country-facts, climate anchors)
   public/               cities/<CC>.json, provinces/<CC>.json, climate/<CC>.json (246 each), country-projections.json, world-globe.json
-  e2e/                  Playwright specs and the saved session (auth.setup.ts)
+  e2e/                  Playwright specs, all signed out
   test/                 shared test harnesses that must live outside the contract-scanned roots
 apps/mobile/            the Expo app, package @tsa/mobile: a one-screen skeleton until the shell arrives
 features/               package @tsa/features: one folder per feature; _registry/ is generated on install, never committed
@@ -185,19 +160,6 @@ docs/
 .github/                CI, and the scheduled data-refresh workflows
 ```
 
-## How "many people can join" works
-
-The app is login-first: every member signs in before doing anything, and
-creating an account requires the family invite code. Accounts (email +
-password) own editing: members sign in once and their trips follow them
-to any device. A trip's join code is now a **view key** —
-anyone holding it can see the itinerary and packing lists (read-only,
-nothing personal), while joining as an editing member requires an account
-plus the code. Pre-account members are preserved: sign up and claim your
-old member name to inherit everything you ticked, spent and wrote. The
-bare trip link without the code shows only a private screen. Password
-resets are admin-assisted (`ADMIN_USER_IDS`) — no email service needed.
-
 ## Deploying
 
 Deployed on Vercel at <https://china-itinerary-planner.vercel.app>.
@@ -208,56 +170,19 @@ neither the install command nor the build command: `apps/web/vercel.json`
 holds only the function region. pnpm 10 comes from the `packageManager` field
 of the root `package.json`.
 
-Storage picks its backend from the environment
-(`apps/web/lib/server/store.ts`):
+**Production shows "being rebuilt".** `apps/web/proxy.ts` rewrites every path
+to `/rebuilding`, uncached, whenever `VERCEL_ENV` is `production`, which Vercel
+sets on production deployments and reads at runtime. Preview deployments and
+local development pass through, so the explorer is tested there. No
+environment needs a database or a secret: the database arrives with phase 1's
+slice B and accounts with slice C, each with its own variables.
 
-- `DATABASE_URL` set → **Postgres** (e.g. Supabase — use the *transaction
-  pooler* connection string, port 6543)
-- no `DATABASE_URL`, local machine → SQLite in `apps/web/data/app.db`
-- no `DATABASE_URL` on Vercel → shared-trip endpoints return 503 with
-  instructions (the planner and catalog still work fully)
-
-To enable shared trips in production: Supabase → create a free project →
-copy the pooled connection string → Vercel project → Settings →
-Environment Variables → add `DATABASE_URL` → redeploy. Tables are created
-automatically on first use.
-
-**Keep the functions next to the database.** `apps/web/vercel.json` pins the
-serverless functions to `bom1` (Mumbai), the same AWS region as the Supabase
-project (`ap-south-1`). Left at Vercel's default they ran in `iad1`
-(Washington DC), so every database round trip crossed the planet: a cold
-instance runs 22 schema statements before its first query, and the first
-`/api/auth/get-session` after idle measured 6–7 s against 0.35 s warm. If
-the database ever moves, move the region with it.
+`apps/web/vercel.json` pins the functions to `bom1` (Mumbai), where the
+retired database was; slice B moves them to `sin1` with the new one.
 
 ### Environment variables
 
 | Variable | Effect |
 |---|---|
-| `DATABASE_URL` | Postgres (Supabase) connection string — enables shared trips |
-| `ACCESS_CODE` | Family invite code required to create an account. Unset = open signups. (No longer a site-wide gate — signed-out visitors land on /login instead.) |
 | `CATALOG_URL` | Optional: override the remote catalog fallback URL |
-| `BETTER_AUTH_SECRET` | Enables accounts. 32 random bytes — `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Unset locally = accounts off; unset (or an example value) on a deployment = boot refused |
-| `BETTER_AUTH_URL` | Base URL of this deployment (e.g. `http://192.168.1.20:3000` on a Pi) |
-| `TRUSTED_ORIGINS` | Comma-separated extra origins allowed to call the auth API. On Vercel (with system environment variables exposed, the default) the deployment URL, its git-branch alias and the production domain are trusted without it; the bare `<project>-<team>.vercel.app` alias is not |
-| `ADMIN_USER_IDS` | Comma-separated account ids that may reset other members' passwords |
-
-> Upgrading note: ACCESS_CODE alone no longer locks the site. If you
-> previously relied on it without accounts, set BETTER_AUTH_SECRET before
-> upgrading — otherwise the site is open.
->
-> Old `/unlock` bookmarks now 404 — harmless, that page was retired along
-> with the unlock gate.
-
-**Rotating `BETTER_AUTH_SECRET`.** Safe to do any time. Set a new value and
-redeploy: everyone is signed out (the secret signs session cookies) but
-passwords survive — Better Auth salts each one separately, the secret is not
-part of the hash. Nothing else needs migrating; old rows in `session` become
-dead weight and can be deleted. On Vercel the change needs a redeploy to take
-effect, since the auth instance is cached per process. A blank value makes the
-deployment fail to start (see `apps/web/instrumentation.ts`) rather than
-quietly reopening the site.
-
-The catalog refresh endpoint is local-only (serverless filesystems are
-read-only): rerun `cd apps/web; node scripts/ingest-destinations.mjs`, commit,
-redeploy.
+| `VERCEL_ENV` | Set by Vercel, never by hand. `production` turns every path into the "being rebuilt" page |
```

- [ ] **Step 2: Rewrite `apps/web/.env.example`**

```diff
diff --git a/apps/web/.env.example b/apps/web/.env.example
index a8a7264..466da8d 100644
--- a/apps/web/.env.example
+++ b/apps/web/.env.example
@@ -4,74 +4,25 @@
 #
 #   cp .env.example .env.local
 #
+# Nothing here is required. While the app is rebuilt it needs no database and
+# no secret anywhere: the database arrives in phase 1's slice B and accounts in
+# slice C, each with the variables it reads.
+#
 # Optional settings are left commented out on purpose: uncomment a line only
 # when you are giving it a value. On Vercel these go in Settings ->
 # Environment Variables instead, and a change there needs a redeploy.
 
 
-# ---------------------------------------------------------------------------
-# Accounts
-# ---------------------------------------------------------------------------
-
-# Signs session cookies. Generate 32 random bytes:
-#   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
-#
-# Use a different value in dev and prod, and never commit either. Leaving this
-# blank locally is fine — accounts turn off and the site runs in no-accounts
-# planning mode. On a deployment a blank or example value refuses to start
-# (see instrumentation.ts), because an absent secret also disables the login
-# wall and would serve every page publicly.
-#
-# On Vercel, set this for every environment you deploy — Preview as well as
-# Production. A Preview without it would refuse to start for the same reason
-# described above. Use a DIFFERENT value from production: it signs session
-# cookies, and a preview key should never be able to forge a production session.
-#
-# Safe to rotate: everyone gets signed out, passwords survive.
-BETTER_AUTH_SECRET=
-
-# Base URL of this deployment. Defaults to http://localhost:3000, which breaks
-# cookies anywhere else — set it in production and on a LAN box (e.g. a Pi).
-#BETTER_AUTH_URL=http://192.168.1.20:3000
-
-# Invite code required to create an account. Unset = anyone who reaches the
-# signup page can register. Not a site-wide gate — signed-out visitors are sent
-# to /login regardless.
-#ACCESS_CODE=
-
-# Comma-separated account ids allowed to reset other members' passwords. Fill
-# this in after your first signup — the id is shown on /account. Keep the list
-# short: an admin can reset any password without knowing the current one, so
-# each entry is a full-takeover key.
-#ADMIN_USER_IDS=
-
-# Comma-separated extra origins allowed to call the auth API. On Vercel the
-# deployment's own URL, its git-branch alias and the production domain are
-# trusted automatically (lib/server/trustedOrigins.ts) — as long as the
-# project's "Automatically expose System Environment Variables" setting is on,
-# which is its default — so a preview can sign in without a value here. Not
-# covered: the bare <project>-<team>.vercel.app alias, which no system
-# variable names; list it here if you use it. Otherwise only needed for a
-# host Vercel does not name — a custom domain that is not the production one,
-# or a cross-origin caller. Better Auth's wildcard syntax works:
-# https://*.example.com
-#TRUSTED_ORIGINS=
-
-
-# ---------------------------------------------------------------------------
-# Storage
-# ---------------------------------------------------------------------------
-
-# Postgres (Supabase) connection string — enables shared trips. Unset locally
-# falls back to SQLite at data/app.db; unset on Vercel makes shared-trip
-# endpoints 503, since serverless filesystems are read-only. Use the Supabase
-# transaction pooler URL (port 6543). Tables are created on first use.
-#DATABASE_URL=
-
-
 # ---------------------------------------------------------------------------
 # Optional
 # ---------------------------------------------------------------------------
 
 # Override the remote catalog fallback URL.
 #CATALOG_URL=
+
+# Not a setting: Vercel sets VERCEL_ENV on every deployment, and `production`
+# makes proxy.ts answer every path with the "being rebuilt" page. Leave it out
+# of this file; to see production locally, start the built app with it from
+# PowerShell, then clear it:
+#   $env:VERCEL_ENV = "production"; pnpm --filter @tsa/web start
+#   Remove-Item Env:VERCEL_ENV
```

- [ ] **Step 3: Check that the two new PowerShell commands parse in Windows PowerShell 5.1**

```powershell
foreach ($c in '$env:VERCEL_ENV = "production"; pnpm --filter @tsa/web start', 'Remove-Item Env:VERCEL_ENV') {
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseInput($c, [ref]$null, [ref]$errors)
  "$c -> $($errors.Count) errors"
}
```
Expected: `0 errors` for both.

- [ ] **Step 4: The comment sweep.** Each changed line below is a comment; none of the diff touches code. Apply it:

```diff
diff --git a/apps/web/app/plan/page.tsx b/apps/web/app/plan/page.tsx
index 27b9ec2..b213f56 100644
--- a/apps/web/app/plan/page.tsx
+++ b/apps/web/app/plan/page.tsx
@@ -35,10 +35,11 @@ export default function PlanPage() {
    * Season is kept as its own state rather than derived from this, because a
    * user who never touches the map has a season and no month. When they do
    * touch it, the season is re-derived through `resolveTripSeason` — the same
-   * function the write route calls (app/api/trips/route.ts), so the preview on
-   * step 2 and the trip that gets saved cannot disagree. They did, for every
-   * southern-hemisphere country: this file called the bare northern
-   * `seasonOfMonth`, so a June Peru trip previewed summer and saved winter.
+   * function the write route called (app/api/trips/route.ts, retired in phase
+   * 1's slice A), so the preview on step 2 and the trip that got saved could
+   * not disagree. They did, for every southern-hemisphere country: this file
+   * called the bare northern `seasonOfMonth`, so a June Peru trip previewed
+   * summer and saved winter.
    */
   const [month, setMonth] = useState<number | null>(null);
   /**
@@ -46,7 +47,8 @@ export default function PlanPage() {
    *
    * Lifted out of DestinationStep, where it was local state that never left the
    * component — so the world picker's choice was discarded at the write
-   * boundary and TripInputSchema defaulted every trip to "CN". That silently
+   * boundary and TripInputSchema (in the retired lib/server/schemas.ts)
+   * defaulted every trip to "CN". That silently
    * reverted the season derivation to China's hemisphere and pinned the accent
    * and hero to China. Found by review, not by a test.
    *
@@ -406,7 +408,7 @@ export default function PlanPage() {
               explicit act, and a user who sets it to January means January.
 
               Derived through `resolveTripSeason`, which is the rule the write
-              route (app/api/trips/route.ts) applies to the very same month — not
+              route applied to the very same month until it was retired — not
               `lib/months.ts`'s bare `seasonOfMonth`, whose table is hardcoded
               northern. C8 in lib/contracts.test.ts scans this file for a
               relapse, because no test file may live under app/.
diff --git a/apps/web/components/map/MapExplorer.airports.test.tsx b/apps/web/components/map/MapExplorer.airports.test.tsx
index 0665fd7..d22310c 100644
--- a/apps/web/components/map/MapExplorer.airports.test.tsx
+++ b/apps/web/components/map/MapExplorer.airports.test.tsx
@@ -101,10 +101,11 @@ describe("the open country's airports on its map", () => {
  *
  * The state is ephemeral — a `useState` of this component's own — and NOT a
  * fifth `UserPrefs` field. That is not merely "one less thing to persist":
- * `PrefsSchema` is a `z.object()`, Zod 4 strips unlisted keys, and the PUT to
- * `/api/me/prefs` answers 200 with the stripped object, so an unlisted key is
+ * `PrefsSchema` was a `z.object()`, Zod 4 strips unlisted keys, and the PUT to
+ * `/api/me/prefs` answered 200 with the stripped object, so an unlisted key was
  * actively clobbered rather than merely dropped. `lib/server/schemas.ts:325-328`
- * is the scar that records that happening to `pivot` for real. The globe/flat
+ * was the scar that recorded that happening to `pivot` for real (both retired
+ * in phase 1's slice A). The globe/flat
  * button a few lines above IS a prefs writer, which makes it the closest
  * visual precedent and the wrong one to copy — hence the assertion below that
  * this one writes nothing.
diff --git a/apps/web/components/map/MapExplorer.tsx b/apps/web/components/map/MapExplorer.tsx
index 1bd47d9..e741517 100644
--- a/apps/web/components/map/MapExplorer.tsx
+++ b/apps/web/components/map/MapExplorer.tsx
@@ -94,13 +94,14 @@ export function MapExplorer({
    *
    * A `useState` of this component's own, and deliberately not a fifth
    * `UserPrefs` field (D11). The cost of that fifth field is not the one the
-   * spec argued: `PrefsSchema` is a `z.object()` and Zod strips unlisted keys,
-   * so `PrefsProvider.setPrefs` would write the correct value to the cookie
-   * and then PUT it to `/api/me/prefs`, which answers 200 with the key
+   * spec argued: `PrefsSchema` was a `z.object()` and Zod strips unlisted keys,
+   * so `PrefsProvider.setPrefs` would have written the correct value to the
+   * cookie and then PUT it to `/api/me/prefs`, which answered 200 with the key
    * removed — an active clobber of the value the browser had just written,
-   * not merely a failure to persist it. `lib/server/schemas.ts:325-328` is the
-   * scar where that happened to `pivot` for real, and `:352-355` is the
-   * prophylactic one that kept it from happening to `worldView`.
+   * not merely a failure to persist it. `lib/server/schemas.ts:325-328` was the
+   * scar where that happened to `pivot` for real, and `:352-355` was the
+   * prophylactic one that kept it from happening to `worldView` (the route and
+   * the schemas were retired in phase 1's slice A).
    *
    * Nothing is lost by keeping it here. The layer answers "where are this
    * country's airports", which is a question about the map currently open
diff --git a/apps/web/components/map/SelectedPlaceCard.tsx b/apps/web/components/map/SelectedPlaceCard.tsx
index 1a07058..481e641 100644
--- a/apps/web/components/map/SelectedPlaceCard.tsx
+++ b/apps/web/components/map/SelectedPlaceCard.tsx
@@ -135,7 +135,7 @@ export function SelectedPlaceCard({
     if (takeFocus) ref.current?.focus();
   }, [takeFocus]);
 
-  // Escape and click-outside, the pattern `AccountChip` already establishes.
+  // Escape and click-outside, the pattern the retired `AccountChip` established.
   // Mounted only while the card is open — the caller renders it conditionally —
   // so there is no `open` guard here and no listener on a closed surface.
   useEffect(() => {
diff --git a/apps/web/components/map/useCountryAssets.ts b/apps/web/components/map/useCountryAssets.ts
index 1e7195c..a9afc20 100644
--- a/apps/web/components/map/useCountryAssets.ts
+++ b/apps/web/components/map/useCountryAssets.ts
@@ -214,8 +214,8 @@ export function useCountryAssets(
       // one whose month table is hand-authored: `fitForPlace` never reads a
       // derived row for a Chinese place (§9.5), so CN.json's 412 rows would be
       // 24 KB gzipped (78 KB raw) per open that nothing consults.
-      // `fetchClimateShard` takes a fetch rather than a signal — lib/rates.ts's
-      // pattern — so the abort is
+      // `fetchClimateShard` takes a fetch rather than a signal — the retired
+      // lib/rates.ts's pattern — so the abort is
       // wrapped in. Swallows its own rejection like the shard leg above it: a
       // country with no climate file draws grey pins, which is the absence of
       // a claim and not an outage.
diff --git a/apps/web/components/plan/useDayBuilder.ts b/apps/web/components/plan/useDayBuilder.ts
index ee1b01b..892557a 100644
--- a/apps/web/components/plan/useDayBuilder.ts
+++ b/apps/web/components/plan/useDayBuilder.ts
@@ -97,8 +97,9 @@ export function useDayBuilder({
     dispatch({ type: "serverPayload", payload, force });
   }, [payload, forcedAt]);
 
-  // One op per request: PlanEditSchema takes a single op and the route applies
-  // exactly one under a version guard, so there is nothing to batch into.
+  // One op per request: PlanEditSchema took a single op and the route applied
+  // exactly one under a version guard (both retired in phase 1's slice A), so
+  // there was nothing to batch into.
   //
   // One op *in flight* at a time, too, which is a separate promise and the one
   // this used to break. The old guard skipped ops already sent but never waited
diff --git a/apps/web/components/shell/TripSwitcher.tsx b/apps/web/components/shell/TripSwitcher.tsx
index a736d67..b54e52f 100644
--- a/apps/web/components/shell/TripSwitcher.tsx
+++ b/apps/web/components/shell/TripSwitcher.tsx
@@ -8,7 +8,8 @@ import { useCallback, useState } from "react";
  * Header trip switcher (spec §2.3): the user's trips, current one marked,
  * each a link to `/trip/[id]`.
  *
- * Reads `GET /api/me/trips` — the same endpoint TripsDashboard uses. Not a trip
+ * Reads `GET /api/me/trips` — the same endpoint TripsDashboard used; both were
+ * retired in phase 1's slice A. Not a trip
  * payload, so it is outside C4 and needs no accessor.
  */
 
diff --git a/apps/web/components/trip/AirportInput.tsx b/apps/web/components/trip/AirportInput.tsx
index bac30dc..5c6f9b0 100644
--- a/apps/web/components/trip/AirportInput.tsx
+++ b/apps/web/components/trip/AirportInput.tsx
@@ -46,8 +46,9 @@ interface Props {
  * What a picked suggestion writes: readable, and carrying the code — capped so
  * it never exceeds `cap`.
  *
- * The ticket schema (lib/server/schemas.ts: `z.string().trim().max(60)`) caps
- * `from`/`to` at 60 characters, and the input's `maxLength` prop defaults to
+ * The ticket schema (the retired lib/server/schemas.ts:
+ * `z.string().trim().max(60)`) capped `from`/`to` at 60 characters, and the
+ * input's `maxLength` prop defaults to
  * that same 60 — but `maxLength` only limits typed keystrokes, never a value
  * set programmatically here, so this function has to enforce the cap itself.
  *
@@ -81,8 +82,9 @@ export function AirportInput({
   onPick,
   autoFocus,
   placeholder,
-  // Mirrors the ticket schema's own cap on `from`/`to` (lib/server/schemas.ts:
-  // `z.string().trim().max(60)`). Kept as a prop, read by displayValue below,
+  // Mirrors the cap the ticket schema had on `from`/`to` (the retired
+  // lib/server/schemas.ts: `z.string().trim().max(60)`). Kept as a prop, read
+  // by displayValue below,
   // rather than a second hardcoded 60 — so the two cannot drift apart.
   maxLength = 60,
   className,
diff --git a/apps/web/components/trip/Rates.test.tsx b/apps/web/components/trip/Rates.test.tsx
index e3c3ec4..b08d27d 100644
--- a/apps/web/components/trip/Rates.test.tsx
+++ b/apps/web/components/trip/Rates.test.tsx
@@ -6,7 +6,8 @@ import { Rates } from "./Rates";
  * The disclosure defaults closed (mirrors `CurrencySettingsEditor`'s existing
  * pattern in MoneyTab.tsx), so every test opens it first. This also proves
  * the fetch is deferred until a member actually asks to see it — no reason to
- * hit /api/rates on every Money-tab render.
+ * hit /api/rates (a route retired in phase 1's slice A) on every Money-tab
+ * render.
  */
 function open() {
   fireEvent.click(screen.getByRole("button"));
diff --git a/apps/web/components/trip/RouteMap.test.tsx b/apps/web/components/trip/RouteMap.test.tsx
index 58a4c2a..5880dab 100644
--- a/apps/web/components/trip/RouteMap.test.tsx
+++ b/apps/web/components/trip/RouteMap.test.tsx
@@ -458,14 +458,15 @@ describe("the trip map draws the trip's own country", () => {
 
   test("still renders for a guest, with no session", async () => {
     // The signed-out shape of the wire, whoever is looking at it. A signed-out
-    // request for a static asset is redirected to /login by `lib/wall.ts`,
-    // `fetch` follows the redirect, so `res.ok` is TRUE and `res.json()`
-    // rejects on the login page's `<` — a failure mode no status check catches.
+    // request for a static asset was redirected to /login by `lib/wall.ts`
+    // (retired in phase 1's slice A), `fetch` followed the redirect, so
+    // `res.ok` was TRUE and `res.json()` rejected on the login page's `<` — a
+    // failure mode no status check catches.
     //
-    // §5.1 calls this a guest-reachable surface, and that is true of the page
-    // and not of this component: `resolveTripAccess` answers `guest` without a
-    // session and `TripView` renders `GuestTripView` for anything short of
-    // `member`. The property is pinned anyway because losing it is silent —
+    // §5.1 calls this a guest-reachable surface, and that was true of the page
+    // and not of this component: the retired `resolveTripAccess` answered
+    // `guest` without a session and `TripView` renders `GuestTripView` for
+    // anything short of `member`. The property is pinned anyway because losing it is silent —
     // `/api/destinations/resolve` reads no session and sits behind no wall, so
     // the stops resolve either way, and the geometry degrades to the same
     // list-only fallback a 500 gets.
diff --git a/apps/web/components/trip/RouteMap.tsx b/apps/web/components/trip/RouteMap.tsx
index 68e817f..0a04ed3 100644
--- a/apps/web/components/trip/RouteMap.tsx
+++ b/apps/web/components/trip/RouteMap.tsx
@@ -54,12 +54,12 @@ import type { Destination, Season } from "@/lib/types";
  * geometry that never arrives costs the drawing and never the stops (§5.2).
  *
  * **Everything it fetches answers a signed-out request, and that was checked
- * rather than assumed.** §5.1 calls this "a guest-reachable surface", which is
- * true of the PAGE and not of this component: `lib/wall.ts` passes
- * `/trip/<id>?code=…`, but `resolveTripAccess` answers `guest` for a request
- * with no session, and `TripView` renders `GuestTripView` — not `PlanTab`, and
- * so not this — for anything short of `member`. So a shared trip link does not
- * reach here today.
+ * rather than assumed.** §5.1 calls this "a guest-reachable surface", which was
+ * true of the PAGE and not of this component: `lib/wall.ts` passed
+ * `/trip/<id>?code=…`, but `resolveTripAccess` answered `guest` for a request
+ * with no session (both retired in phase 1's slice A), and `TripView` renders
+ * `GuestTripView` — not `PlanTab`, and so not this — for anything short of
+ * `member`. So a shared trip link did not reach here.
  *
  * The property is still worth holding, because losing it is silent: a fetch
  * that needs a session works for every developer and every member and fails
@@ -369,8 +369,8 @@ export function RouteMap({ plan, country, startDate, season }: Props) {
     setClimate(NO_CLIMATE);
     if (countryCode === CLIMATE_COUNTRY) return;
     const controller = new AbortController();
-    // `fetchClimateShard` takes a fetch rather than a signal — lib/rates.ts's
-    // pattern — so the abort is wrapped in.
+    // `fetchClimateShard` takes a fetch rather than a signal — the retired
+    // lib/rates.ts's pattern — so the abort is wrapped in.
     const scoped: typeof fetch = (input, init) => fetch(input, { ...init, signal: controller.signal });
     Promise.all([
       fetchClimateShard(countryCode, scoped).catch(() => null),
diff --git a/apps/web/lib/catalogExtras.test.ts b/apps/web/lib/catalogExtras.test.ts
index bf4dab4..0bbd57f 100644
--- a/apps/web/lib/catalogExtras.test.ts
+++ b/apps/web/lib/catalogExtras.test.ts
@@ -167,8 +167,9 @@ describe("shouldFetchEnrichment", () => {
     // The refusal the `description !== null` guard alone never made:
     // `DestinationStep.addPlace` hard-codes `description: null` for every
     // search pick, so that guard is false on every first pick — including
-    // `Q…` ids, which /api/cities/enrich queries by wdt:P1566 and can never
-    // match. Every one of those was a round trip that could not answer.
+    // `Q…` ids, which /api/cities/enrich (retired in phase 1's slice A) queried
+    // by wdt:P1566 and could never match. Every one of those was a round trip
+    // that could not answer.
     expect(shouldFetchEnrichment({ ...fromSearch, qid: "Q956" }, NONE)).toBe(false);
     // And a curated id, which reaches `addCatalog` by the same path.
     expect(shouldFetchEnrichment({ ...fromSearch, qid: "hangzhou" }, NONE)).toBe(false);
diff --git a/apps/web/lib/catalogExtras.ts b/apps/web/lib/catalogExtras.ts
index a59faaa..447d2d0 100644
--- a/apps/web/lib/catalogExtras.ts
+++ b/apps/web/lib/catalogExtras.ts
@@ -65,8 +65,9 @@ export function mergeCatalogHit(
  * 2. **It is not a GeoNames id.** `DestinationStep.addPlace` hard-codes
  *    `description: null` for every search pick, because a `RankedPlace` never
  *    held one — so rule 1 is false on *every* first search pick, Wikidata
- *    `Q…` ids included. `/api/cities/enrich` queries by `wdt:P1566`, the
- *    GeoNames id, so a `Q…` is a round trip that cannot answer by
+ *    `Q…` ids included. `/api/cities/enrich` (retired in phase 1's slice A)
+ *    queried by `wdt:P1566`, the GeoNames id, so a `Q…` was a round trip that
+ *    could not answer by
  *    construction. `isGeoNamesId` comes from `lib/geoNamesId.ts`, the leaf —
  *    never from `lib/server/cityIndex.ts`, which re-exports it but
  *    static-imports the 3.65 MB city index along with it.
diff --git a/apps/web/lib/climateShard.ts b/apps/web/lib/climateShard.ts
index 311136b..29ecfa8 100644
--- a/apps/web/lib/climateShard.ts
+++ b/apps/web/lib/climateShard.ts
@@ -307,8 +307,8 @@ export function parseClimateIndex(raw: unknown): ClimateIndex {
  * caller (Plan 6) to decide whether a missing shard is survivable.
  *
  * `fetchImpl` defaults to the global `fetch` and is overridable so a test
- * can inject a fake response with no network call — `lib/rates.ts`'s
- * `fetchJsonWithTimeout` pattern.
+ * can inject a fake response with no network call — the pattern of
+ * `fetchJsonWithTimeout` in the retired `lib/rates.ts`.
  */
 export async function fetchClimateShard(
   country: string,
diff --git a/apps/web/lib/contracts.test.ts b/apps/web/lib/contracts.test.ts
index 67d7d76..0722ef8 100644
--- a/apps/web/lib/contracts.test.ts
+++ b/apps/web/lib/contracts.test.ts
@@ -609,7 +609,8 @@ describe("C7 — every surface that renders GeoNames data credits it", () => {
    * The first version of this contract was a hardcoded four-path list. That
    * list was WRONG on the day it was written — it missed
    * `components/home/TripsDashboard.tsx`, the signed-in home page, which
-   * renders `destinationNames` straight out of `GET /api/me/trips` — and a
+   * rendered `destinationNames` straight out of `GET /api/me/trips` (both
+   * retired in phase 1's slice A) — and a
    * hardcoded list is structurally incapable of catching the seventh surface
    * somebody adds next month. So the set is derived instead: scan the tree for
    * the tokens that carry GeoNames city names into a render path, and require
@@ -628,7 +629,8 @@ describe("C7 — every surface that renders GeoNames data credits it", () => {
    * The tokens that actually carry GeoNames-derived city names.
    *
    * Traced from the write side, not guessed: `lib/server/planService.ts:24`
-   * fills `destinationNames` through `resolveDestinations`, which routes `G…`
+   * (retired in phase 1's slice A) filled `destinationNames` through
+   * `resolveDestinations`, which routes `G…`
    * ids through `cityIndexEntry` → `geoNamesCityToDestination`; `CatalogHit`
    * and `MapCity` are the two shapes `lib/tripShared.ts` declares for a catalog
    * row and a map pin, both of which carry a GeoNames `name`.
@@ -922,7 +924,7 @@ describe("C7 — every surface that renders GeoNames data credits it", () => {
     expect(namesCityData({ path: "app/layout.tsx", text: meta, code: stripComments(meta) })).toBe(
       false
     );
-    // The dotted form still fires, which is what TripsDashboard renders.
+    // The dotted form still fires, which is what the retired TripsDashboard rendered.
     const real = "const line = next.destinations.join(String.fromCharCode(8594));\n";
     expect(
       namesCityData({ path: "components/home/TripsDashboard.tsx", text: real, code: stripComments(real) })
@@ -1254,8 +1256,8 @@ describe("C8 — a season is never derived from the bare northern table", () =>
   /**
    * `lib/months.ts`'s `seasonOfMonth` is hardcoded northern-hemisphere, and it
    * says so. `getCountryProfile(code).seasonOfMonth` is the hemisphere-aware
-   * wrapper, and `resolveTripSeason` is the rule the write route applies to a
-   * saved trip (app/api/trips/route.ts).
+   * wrapper, and `resolveTripSeason` is the rule the write route applied to a
+   * saved trip (app/api/trips/route.ts, until phase 1's slice A retired it).
    *
    * app/plan/page.tsx called the bare one, so the wizard previewed one season
    * and the server saved the opposite for every southern-hemisphere country — a
diff --git a/apps/web/lib/countryGuidance.test.ts b/apps/web/lib/countryGuidance.test.ts
index 2229787..b30ad5d 100644
--- a/apps/web/lib/countryGuidance.test.ts
+++ b/apps/web/lib/countryGuidance.test.ts
@@ -251,7 +251,7 @@ describe("a China trip is unchanged", () => {
 
   test("a trip with no country named is still a China trip", () => {
     // DEFAULT_COUNTRY, not a second "CN" literal — and the reason
-    // `planService.ts` and `PlanStep.tsx` needed no change: TripInput.country
+    // `planService.ts` (since retired) and `PlanStep.tsx` needed no change: TripInput.country
     // is optional, and every trip written before it existed is Chinese.
     const { country: _country, ...noCountry } = chinaInput();
     expect(buildItinerary(noCountry, DESTINATIONS).tips).toEqual(plan.tips);
@@ -469,8 +469,9 @@ describe.skipIf(!existsSync(PE_SHARD))("the Peru fixture is the committed shard'
 // ---------------------------------------------------------------------------
 
 /**
- * The generated plan is frozen into the trip at creation and served back
- * unchanged forever (`lib/server/planService.ts`). That is right for
+ * The generated plan was frozen into the trip at creation and served back
+ * unchanged forever (`lib/server/planService.ts`, retired in phase 1's slice
+ * A). That is right for
  * `plan.tips`: a traveller acted on the advice they were given, so rewriting it
  * under them would be worse than leaving it stale.
  *
diff --git a/apps/web/lib/dayBuilder.test.ts b/apps/web/lib/dayBuilder.test.ts
index 884a721..4fcf738 100644
--- a/apps/web/lib/dayBuilder.test.ts
+++ b/apps/web/lib/dayBuilder.test.ts
@@ -333,7 +333,8 @@ describe("poll gate", () => {
 
 describe("target day and shelf", () => {
   it("clamps the target day when the plan shrinks", () => {
-    // PATCH /api/trips/:id rebuilds the whole plan and can cut 7 days to 3; a
+    // PATCH /api/trips/:id (retired in phase 1's slice A) rebuilt the whole
+    // plan and could cut 7 days to 3; a
     // stale target would make every subsequent add POST a day that is gone.
     const state = run(seeded(), { type: "setTargetDay", day: 2 }, {
       type: "serverPayload",
@@ -482,7 +483,8 @@ describe("target day and shelf", () => {
 
 describe("injected activity map", () => {
   it("adopts a destination that entered the plan after mount", () => {
-    // The map is a snapshot at `useReducer` init. PATCH /api/trips/:id replaces
+    // The map is a snapshot at `useReducer` init. PATCH /api/trips/:id (retired
+    // in phase 1's slice A) replaced
     // the whole plan, so a day can arrive for a destination the map has never
     // seen — and a frozen map leaves that day's shelf empty forever, which the UI
     // reads as "everything for this destination is already on the plan".
diff --git a/apps/web/lib/dayBuilder.ts b/apps/web/lib/dayBuilder.ts
index bd5cc2b..4fefb4f 100644
--- a/apps/web/lib/dayBuilder.ts
+++ b/apps/web/lib/dayBuilder.ts
@@ -28,7 +28,7 @@ import type { Activity, TimeSlot } from "./types";
  * over blocks another member owns.
  */
 
-/** Matches `DayNumberSchema` in lib/server/schemas.ts. */
+/** Matched `DayNumberSchema` in the retired lib/server/schemas.ts. */
 const MAX_DAY = 60;
 /** Matches `ItemTitleSchema`. Titles are trimmed then capped before emitting. */
 const MAX_TITLE = 80;
diff --git a/apps/web/lib/geoNamesId.ts b/apps/web/lib/geoNamesId.ts
index 71858c4..fbef725 100644
--- a/apps/web/lib/geoNamesId.ts
+++ b/apps/web/lib/geoNamesId.ts
@@ -4,8 +4,9 @@
  * Its own leaf module rather than a member of lib/server/cityIndex.ts: that
  * file static-imports the 3.65 MB data/cities-index.json, so importing the
  * predicate from it drags the whole artifact into every bundle that wants
- * nothing but a regex. `app/api/cities/enrich/route.ts` (Task 15) is exactly
- * that case — it validates ids and never resolves a city.
+ * nothing but a regex. `app/api/cities/enrich/route.ts` (Task 15, retired in
+ * phase 1's slice A) was exactly that case — it validated ids and never
+ * resolved a city.
  *
  * `resolveDestinations` branches on this, and spec §3.3 calls merging the two
  * namespaces a real bug, so it is anchored at both ends and rejects a bare
diff --git a/apps/web/lib/money.ts b/apps/web/lib/money.ts
index 6f19db9..f448b3c 100644
--- a/apps/web/lib/money.ts
+++ b/apps/web/lib/money.ts
@@ -260,9 +260,10 @@ export function currencySymbol(
  *
  * Not quite true for a three-decimal currency (BHD, IQD, JOD, KWD, LYD, OMR,
  * TND): this constant lets `majorToMinor` accept up to 1_000_000_000 minor
- * units for those, but `lib/server/schemas.ts`'s `MinorAmountSchema` caps
- * every stored amount at 100_000_000 minor units regardless of currency — so
- * the ceiling a three-decimal-currency entry actually clears end-to-end is
+ * units for those, but `MinorAmountSchema` in the retired
+ * `lib/server/schemas.ts` capped every stored amount at 100_000_000 minor
+ * units regardless of currency — so the ceiling a three-decimal-currency entry
+ * actually cleared end-to-end was
  * 100,000 major units, ten times lower than this constant on its own would
  * suggest. Untouched here (existing disagreement, not this pass's scope).
  */
diff --git a/apps/web/lib/myTrips.ts b/apps/web/lib/myTrips.ts
index 4effc7e..e397f45 100644
--- a/apps/web/lib/myTrips.ts
+++ b/apps/web/lib/myTrips.ts
@@ -175,7 +175,7 @@ export function forgetMyTrip(id: string): void {
   persist(removeMyTrip(loadMyTrips(), id));
 }
 
-/** Overwrite the stored list wholesale — used after a wallet merge. */
+/** Overwrite the stored list wholesale — used after a wallet merge, by the retired lib/walletSync.ts. */
 export function replaceMyTrips(list: MyTrip[]): void {
   persist(list);
 }
diff --git a/apps/web/lib/server/catalog.ts b/apps/web/lib/server/catalog.ts
index be8734b..599adc6 100644
--- a/apps/web/lib/server/catalog.ts
+++ b/apps/web/lib/server/catalog.ts
@@ -65,7 +65,7 @@ export interface Catalog {
   attractions: CatalogAttraction[];
 }
 
-/** Overridable for tests via CIP_CATALOG_PATH, as db.ts does with CIP_DB_PATH. */
+/** Overridable for tests via CIP_CATALOG_PATH. */
 function catalogPath(): string {
   return process.env.CIP_CATALOG_PATH ?? path.join(process.cwd(), "data", "catalog.json");
 }
@@ -73,7 +73,8 @@ function catalogPath(): string {
 /**
  * The catalog is bundled into the build so serverless deployments (read-only
  * filesystem, no data/ directory) still have the full all-China dataset. The
- * on-disk copy takes precedence locally so /api/destinations/refresh works.
+ * on-disk copy takes precedence locally so /api/destinations/refresh worked
+ * (a route retired in phase 1's slice A).
  *
  * Server-only, and enforced by the `server-only` import above; Vitest
  * aliases the package to an empty module (vitest.server-only.ts).
diff --git a/apps/web/lib/server/catalogSearch.test.ts b/apps/web/lib/server/catalogSearch.test.ts
index ef522be..cba5fd3 100644
--- a/apps/web/lib/server/catalogSearch.test.ts
+++ b/apps/web/lib/server/catalogSearch.test.ts
@@ -14,7 +14,7 @@ import type { Catalog, CatalogCity } from "./catalog";
  * A fixture rather than the real catalog: the point is which *spellings* match
  * and which *countries* are in scope, and stating the corpus in the test is
  * what makes an empty result mean something. Pointed at through
- * `CIP_CATALOG_PATH`, the same override `CIP_DB_PATH` gives the store.
+ * `CIP_CATALOG_PATH`.
  *
  * Fixture invariant (spec §6): the corpus contains cities in MORE THAN ONE
  * country. Stating `country` on every row is not enough on its own — the read
diff --git a/apps/web/lib/server/cityEnrichment.test.ts b/apps/web/lib/server/cityEnrichment.test.ts
index 5a7619e..d81e2fb 100644
--- a/apps/web/lib/server/cityEnrichment.test.ts
+++ b/apps/web/lib/server/cityEnrichment.test.ts
@@ -60,8 +60,9 @@ describe("enrichmentQuery", () => {
   });
 
   test("refuses an id that is not a GeoNames id rather than interpolating it", () => {
-    // These arrive from `/api/cities/enrich?ids=`, which is a query string a
-    // caller controls, and the value is interpolated into a query body.
+    // These arrived from `/api/cities/enrich?ids=` (retired in phase 1's slice
+    // A), which is a query string a caller controls, and the value is
+    // interpolated into a query body.
     expect(() => enrichmentQuery(['G1" } UNION { ?a ?b ?c'])).toThrow(/not a GeoNames id/);
     expect(() => enrichmentQuery(["Q170247"])).toThrow(/not a GeoNames id/);
   });
@@ -244,10 +245,11 @@ describe("enrichCities", () => {
   });
 
   test("bounds the cache, because a miss is cached and the ids are caller-chosen", async () => {
-    // `wallDecision` passes everything under /api/ (lib/wall.ts:38, "routes
-    // self-enforce"), so the route's own session check is the only thing
-    // limiting who may walk G1…G99999999 twelve at a time — and a signed-in
-    // caller may still do it. Ids are validated, so there is no injection —
+    // `wallDecision` passed everything under /api/ (lib/wall.ts:38, "routes
+    // self-enforce"; both retired in phase 1's slice A), so the route's own
+    // session check was the only thing limiting who could walk G1…G99999999
+    // twelve at a time — and a signed-in caller could still do it. Ids are
+    // validated, so there is no injection —
     // but an unbounded map would grow one entry per distinct id, forever, in a
     // lambda's memory.
     const mock = stubSparql([]);
diff --git a/apps/web/lib/server/cityEnrichment.ts b/apps/web/lib/server/cityEnrichment.ts
index b264512..2ffed06 100644
--- a/apps/web/lib/server/cityEnrichment.ts
+++ b/apps/web/lib/server/cityEnrichment.ts
@@ -63,15 +63,16 @@ const TIMEOUT_MS = 15_000;
  * Exported for the test that pins it: the route hands over whatever `?ids=`
  * carried, so without the cap one request is one unbounded SPARQL body.
  *
- * It bounds ONE request and nothing more. Aggregate outbound volume is bounded
- * by who may reach the route at all, which is the session check in
- * `app/api/cities/enrich/route.ts`.
+ * It bounds ONE request and nothing more. Aggregate outbound volume was bounded
+ * by who could reach the route at all, which was the session check in
+ * `app/api/cities/enrich/route.ts` (retired in phase 1's slice A).
  */
 export const MAX_IDS_PER_REQUEST = 12;
 
 /**
- * Ids are validated, not escaped: they arrive from `/api/cities/enrich?ids=`,
- * a caller-controlled query string, and are interpolated into a query body.
+ * Ids are validated, not escaped: they arrived from `/api/cities/enrich?ids=`
+ * (retired in phase 1's slice A), a caller-controlled query string, and are
+ * interpolated into a query body.
  * Validation also catches the subtler mistake — sending the app's `G`-prefixed
  * id matches nothing, and an empty result is indistinguishable from a
  * genuinely unknown city.
@@ -130,11 +131,12 @@ export function readEnrichmentRows(bindings: readonly unknown[]): Map<string, Ci
  * A miss is cached too. Without that, a city Wikidata has never heard of is
  * re-queried on every selection for as long as the instance lives.
  *
- * Bounded, because these keys are caller-chosen. `wallDecision` passes
+ * Bounded, because these keys are caller-chosen. `wallDecision` passed
  * everything under `/api/` unconditionally (`lib/wall.ts:38`, "routes
- * self-enforce"), so the only thing standing between this map and an arbitrary
- * walk of `G1…G99999999` is the session gate the route itself applies — this
- * cap does not substitute for it, and neither does `MAX_IDS_PER_REQUEST`:
+ * self-enforce"; both retired in phase 1's slice A), so the only thing
+ * standing between this map and an arbitrary walk of `G1…G99999999` was the
+ * session gate the route itself applied — this cap does not substitute for
+ * it, and neither does `MAX_IDS_PER_REQUEST`:
  * both bound a single request, not how many requests one caller may make.
  * Ids are validated, so there is no injection — but caching a miss by design
  * means an unbounded map would grow one entry per distinct id, forever, in a
diff --git a/apps/web/lib/server/cityIndex.test.ts b/apps/web/lib/server/cityIndex.test.ts
index bdfe833..66f4f33 100644
--- a/apps/web/lib/server/cityIndex.test.ts
+++ b/apps/web/lib/server/cityIndex.test.ts
@@ -55,7 +55,7 @@ describe("readCityIndex", () => {
     // Degrades rather than throws. The index is built lazily, on the first
     // resolve, so a throw here would surface inside a request that is already
     // resolving a GeoNames city — it cannot fire at module load, and routes
-    // like `/api/trips` never enter this path at all. On that narrower path,
+    // like the retired `/api/trips` never entered this path at all. On that narrower path,
     // one malformed row should still cost that one city rather than the whole
     // resolve.
     const index = readCityIndex({
diff --git a/apps/web/lib/server/cityIndex.ts b/apps/web/lib/server/cityIndex.ts
index e917cec..fb75fc4 100644
--- a/apps/web/lib/server/cityIndex.ts
+++ b/apps/web/lib/server/cityIndex.ts
@@ -80,7 +80,7 @@ interface CityIndexArtifact {
  * The index is built lazily, on the first resolve (`loadIndex` below), so a
  * throw here would surface inside a request that is already resolving a
  * GeoNames city. It would not fire at module load, and it could not reach
- * `/api/trips` or `/api/trips/[id]`, which never enter this path.
+ * the retired `/api/trips` or `/api/trips/[id]`, which never entered this path.
  *
  * Dropping the bad tuple still beats throwing on that narrower path: the input
  * is a build-time static import of a generated artifact, a wholesale reshape
diff --git a/apps/web/lib/timeline.test.ts b/apps/web/lib/timeline.test.ts
index 97b9a4a..fee271d 100644
--- a/apps/web/lib/timeline.test.ts
+++ b/apps/web/lib/timeline.test.ts
@@ -164,8 +164,8 @@ describe("reflow", () => {
   });
 
   it("clamps a push at the last minute of the day rather than overflowing", () => {
-    // startMinutes is bounded 0–1439 by the write schema
-    // (lib/server/schemas.ts), so a push past midnight cannot be stored. It is
+    // startMinutes was bounded 0–1439 by the write schema (the retired
+    // lib/server/schemas.ts), so a push past midnight could not be stored. It is
     // clamped and flagged instead, which is what lets the UI say the day is
     // overfull rather than silently rejecting the write.
     const items = [timed("a", 1380, 120), timed("b", 1400, 60)];
diff --git a/apps/web/lib/timeline.ts b/apps/web/lib/timeline.ts
index 9fb126a..9785b4a 100644
--- a/apps/web/lib/timeline.ts
+++ b/apps/web/lib/timeline.ts
@@ -21,7 +21,7 @@ import type { ScheduledItem } from "./itinerary";
 export const DURATION_STEP = 15;
 /** Floor for a block. Below this it is not a plan, it is a rounding error. */
 export const MIN_DURATION = 15;
-/** Matches DurationMinutesSchema's ceiling in lib/server/schemas.ts. */
+/** Matched DurationMinutesSchema's ceiling in the retired lib/server/schemas.ts. */
 const MAX_DURATION = 1440;
 /** Matches StartMinutesSchema's ceiling — 23:59, the last minute a block starts. */
 const LAST_START = 1439;
diff --git a/apps/web/lib/tripFixtures.ts b/apps/web/lib/tripFixtures.ts
index 010381e..dc2be25 100644
--- a/apps/web/lib/tripFixtures.ts
+++ b/apps/web/lib/tripFixtures.ts
@@ -4,11 +4,11 @@ import type { TripPayload } from "./tripShared";
  * A fully-populated `TripPayload`, shared by every test that needs one real
  * fixture rather than a hand-rolled partial.
  *
- * Deliberately not colocated in a `.test.ts` file: `redactTrip.test.ts` and
- * `contracts.test.ts` both need it, and importing a fixture out of another
- * suite's `.test.ts` file re-runs that file's top-level `describe` blocks
- * wherever it is imported — every consumer would silently inherit
- * `guestTripView`'s test suite a second time. A plain module has no such
+ * Deliberately not colocated in a `.test.ts` file: `redactTrip.test.ts` (since
+ * retired) and `contracts.test.ts` both needed it, and importing a fixture out
+ * of another suite's `.test.ts` file re-runs that file's top-level `describe`
+ * blocks wherever it is imported — every consumer would silently have
+ * inherited `guestTripView`'s test suite a second time. A plain module has no such
  * side effect, so this is the one place both suites can import from without
  * two payload fixtures drifting apart.
  */
diff --git a/apps/web/lib/tripGateways.test.ts b/apps/web/lib/tripGateways.test.ts
index 5b57232..965eedc 100644
--- a/apps/web/lib/tripGateways.test.ts
+++ b/apps/web/lib/tripGateways.test.ts
@@ -36,7 +36,8 @@ describe("IATA_CODE", () => {
 describe("tripGateways", () => {
   test("reads a trip saved before the fields existed as having no gateways", () => {
     // Absent and null mean the same thing to a reader. They differ only at
-    // the write end, where applyDefaultGateways fills absent and leaves null.
+    // the write end, where applyDefaultGateways (in the retired
+    // lib/gatewayDefaults.ts) filled absent and left null.
     expect(tripGateways(tripData({}))).toEqual({ arrival: null, departure: null });
   });
 
diff --git a/apps/web/lib/tripGateways.ts b/apps/web/lib/tripGateways.ts
index e10470b..5b7e12b 100644
--- a/apps/web/lib/tripGateways.ts
+++ b/apps/web/lib/tripGateways.ts
@@ -20,8 +20,9 @@ export interface TripGateways {
  *
  * Absent and null both read as null. A trip saved before the field existed has
  * no gateway, and "none" is exactly what that means to a reader; the two
- * states differ only at the WRITE end, where `applyDefaultGateways` fills an
- * absent field and leaves a null one alone (the `755c8dd` rule: absent must
+ * states differed only at the WRITE end, where `applyDefaultGateways` (in the
+ * retired lib/gatewayDefaults.ts) filled an absent field and left a null one
+ * alone (the `755c8dd` rule: absent must
  * mean one thing). No caller should ever see `undefined` here.
  */
 export function tripGateways(data: TripData): TripGateways {
@@ -50,8 +51,9 @@ export function withGateways(data: TripData, gateways: TripGateways): TripData {
 /**
  * An input that omits its gateways inherits the stored trip's.
  *
- * PATCH /api/trips/[id] rebuilds from a whole `TripInput`, and a client written
- * before these fields existed sends one without them. Absent there means
+ * PATCH /api/trips/[id] (retired in phase 1's slice A) rebuilt from a whole
+ * `TripInput`, and a client written before these fields existed sent one
+ * without them. Absent there means
  * "unchanged", never "cleared" — `null` is how a client clears — so a rebuild
  * cannot silently drop the airports a member set. Absent on both sides stays
  * absent: a legacy row is not reclassified by being rebuilt.
diff --git a/apps/web/lib/tripPayloadCore.ts b/apps/web/lib/tripPayloadCore.ts
index 6481b93..cfb9a9b 100644
--- a/apps/web/lib/tripPayloadCore.ts
+++ b/apps/web/lib/tripPayloadCore.ts
@@ -42,7 +42,7 @@ export function applyOptimisticCheck(
   return { ...payload, checks: checked ? [...without, { key, by: myName }] : without };
 }
 
-/** What a GET /api/trips/:id response means, once. */
+/** What a GET /api/trips/:id response (a route retired in phase 1's slice A) means, once. */
 export type TripResponse =
   | { kind: "not-found" }
   | { kind: "private" }
diff --git a/apps/web/lib/tripSeason.test.ts b/apps/web/lib/tripSeason.test.ts
index 5c2580e..ff9c493 100644
--- a/apps/web/lib/tripSeason.test.ts
+++ b/apps/web/lib/tripSeason.test.ts
@@ -55,9 +55,10 @@ describe("resolveTripSeason", () => {
   it("gives the wizard preview and the saved trip the same answer for a southern June", () => {
     // The bug this closes, stated as the two calls that used to disagree.
     // app/plan/page.tsx now calls exactly this for the month the user scrubs
-    // to, and app/api/trips/route.ts calls it for the month the client then
-    // sends — one function, so the preview and the saved trip cannot part
-    // company. The wizard used to call the bare `seasonOfMonth` below.
+    // to, and app/api/trips/route.ts called it for the month the client then
+    // sent, until phase 1's slice A retired that route — one function, so the
+    // preview and the saved trip could not part company. The wizard used to
+    // call the bare `seasonOfMonth` below.
     expect(seasonOfMonth(6)).toBe("summer");
     expect(resolveTripSeason(seasonOfMonth(6), 6, "PE")).toBe("winter");
     // And the arming: the same two calls agree for a northern country, so
diff --git a/apps/web/lib/tripShared.ts b/apps/web/lib/tripShared.ts
index be05f37..033eec6 100644
--- a/apps/web/lib/tripShared.ts
+++ b/apps/web/lib/tripShared.ts
@@ -24,8 +24,8 @@ export interface TripData {
  * still pins the behaviour through this name.
  *
  * The re-export is deliberate rather than a migration left half-done: callers
- * that already read a fact (lib/briefing.ts, lib/redactTrip.ts,
- * components/TripView.tsx) keep getting both from one import, and the callers
+ * that already read a fact (lib/briefing.ts, components/TripView.tsx, and the
+ * retired lib/redactTrip.ts) keep getting both from one import, and the callers
  * that must stay cheap import the leaf directly.
  */
 export { tripCountry };
@@ -196,8 +196,8 @@ export function currencyPivot(settings: CurrencySettings): string | null {
  * would otherwise poison every other trip that reads the same reference.
  * (There used to be a shared `DEFAULT_CURRENCY_SETTINGS` constant exported
  * for exactly that fallback; it was removed once nothing constructed a
- * trip's settings from it any more — see the store fallbacks in
- * `lib/server/tripStore.ts` / `pgStore.ts`, which build their own fresh
+ * trip's settings from it any more — see the store fallbacks in the retired
+ * `lib/server/tripStore.ts` / `pgStore.ts`, which built their own fresh
  * literal instead.)
  *
  * The pivot's VALUE is still stamped only when `isCurrencyResearched` says the
@@ -237,9 +237,9 @@ export function initialCurrencySettings(countryCode: CountryCode): CurrencySetti
  * `home`/`rates` always come from the request — that's the whole point of
  * the save. `pivot` is different: it is never client-editable (no UI sends
  * one — see `CurrencySettingsEditor`), so the request omits it on every
- * real save. Because the store replaces the whole settings blob on write
- * (see `setCurrencySettings` in `lib/server/tripStore.ts` / `pgStore.ts`),
- * naively writing back only what the client sent would silently erase a
+ * real save. Because the store replaced the whole settings blob on write
+ * (see `setCurrencySettings` in the retired `lib/server/tripStore.ts` /
+ * `pgStore.ts`), naively writing back only what the client sent would silently erase a
  * trip's stamped pivot the first time anyone touched their home currency or
  * a single rate — the pivot key would simply be missing from the new blob.
  * Falling back to `existing.pivot` when the request has none is what keeps
@@ -274,7 +274,7 @@ export function applyCurrencySettingsUpdate(
   };
 }
 
-/** GET /api/trips/:id response. */
+/** GET /api/trips/:id response (a route retired in phase 1's slice A). */
 export interface TripPayload {
   id: string;
   version: number;
diff --git a/apps/web/lib/worldwidePlan.test.ts b/apps/web/lib/worldwidePlan.test.ts
index c35cd18..6430e50 100644
--- a/apps/web/lib/worldwidePlan.test.ts
+++ b/apps/web/lib/worldwidePlan.test.ts
@@ -31,8 +31,8 @@ import type { TripData, TripPayload } from "./tripShared";
  * the globe, sees Peruvian cities, taps one, and it appears in their plan with
  * day counts and a route leg."* Every layer under that sentence has its own
  * suite. What has never been tested is the whole flow in one go, which is what
- * this file does: one Peru trip assembled through the same functions
- * `/api/trips` runs, serialised, and scanned in both directions.
+ * this file does: one Peru trip assembled through the same functions the
+ * retired `/api/trips` ran, serialised, and scanned in both directions.
  *
  * **Three assertions, and each closes a hole the other two leave open.**
  *
diff --git a/apps/web/scripts/user-agent.test.ts b/apps/web/scripts/user-agent.test.ts
index 1b1b1dd..af92b70 100644
--- a/apps/web/scripts/user-agent.test.ts
+++ b/apps/web/scripts/user-agent.test.ts
@@ -29,10 +29,10 @@ import { describe, expect, it } from "vitest";
  * address — the repo is public, and so is every header sent from it. The
  * User-Agents sent to hosts that are not Wikimedia's (GeoNames, OurAirports,
  * jsDelivr, CHELSA, GitHub) take the same form, so there is one shape to copy
- * and no file left to copy the old one from. Two server-side fetches send none
- * at all — lib/server/catalog.ts's to GitHub, and lib/rates.ts's
- * `fetchJsonWithTimeout` — and nothing here requires one of them, since
- * neither is a Wikimedia caller.
+ * and no file left to copy the old one from. Two server-side fetches sent none
+ * at all — lib/server/catalog.ts's to GitHub, which still does, and the
+ * retired lib/rates.ts's `fetchJsonWithTimeout` — and nothing here requires
+ * one of them, since neither is a Wikimedia caller.
  *
  * Blunt in lib/contracts.test.ts's sense: it reads source as text. That file's
  * harness is not reused because it does not scan `.mjs`, which is every script
@@ -106,9 +106,10 @@ const WIKIMEDIA_HOST =
 
 /**
  * A request is `fetch(` or any `fetch…(` helper, because a caller that goes
- * through one is still a caller: `fetchJsonWithTimeout` in lib/rates.ts sends
- * no headers at all, so a Wikimedia caller built on it would go out under
- * Node's generic default unless it hands in a `fetchImpl` that adds one. That
+ * through one is still a caller: `fetchJsonWithTimeout` in the retired
+ * lib/rates.ts sent no headers at all, so a Wikimedia caller built on it would
+ * have gone out under Node's generic default unless it handed in a `fetchImpl`
+ * that added one. That
  * breadth can also catch a file whose only Wikimedia URL is in prose; the fix
  * there is to reword the prose, never to give a file that sends nothing a
  * User-Agent to satisfy this.
```

- [ ] **Step 5: Check what still names a deleted file**

```powershell
git grep -n -E 'lib/server/(store|tripStore|pgStore|db|migrate|auth|session|authz|schemas|photoStore|trustedOrigins|gatewayGuard|ids|planService)\.ts|lib/(wall|authSecret|authClient|walletSync|gatewayDefaults|redactTrip|rates)\.ts|instrumentation\.ts|TripsDashboard|AccountChip|AuthForm' -- apps/web tools README.md ':!*.json' | Measure-Object | Select-Object -ExpandProperty Count
```
Expected: `34`. On `main` the same command counts 77. Read the 34. Each one names the file as retired or speaks of it in the past tense, except `apps/web/lib/contracts.test.ts:930`, a path used as test data.

- [ ] **Step 6: Run every check for PR A3's final state**

```powershell
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue apps/web/.next
pnpm --filter @tsa/web --fail-if-no-match typecheck
pnpm --filter @tsa/web --fail-if-no-match test
pnpm --filter @tsa/web --fail-if-no-match build
pnpm --filter @tsa/web --fail-if-no-match exec playwright test
pnpm --filter @tsa/mobile --fail-if-no-match typecheck
pnpm --filter @tsa/mobile --fail-if-no-match test
git checkout -- apps/web/next-env.d.ts
```
Expected:
- typecheck clean;
- unit tests: 146 files, 2,528 passed and 1 expected fail;
- build green, with 2 warnings;
- Playwright: 25 passed, chromium 21 and mobile 4;
- mobile typecheck clean, and 1 test passed.

Then run Task 6, Step 10's production check again. Expected: the same five lines, and nothing left listening.

- [ ] **Step 7: Commit**

```powershell
git add README.md apps/web
git status --short
```
Expected: the 39 files of this task, each `M`, and nothing else:
- `README.md`
- `apps/web/.env.example`
- the 37 comment-swept files, which are the files in Step 4's diff.

```powershell
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding $false
@'
docs: say what the app is while it is rebuilt

The README and .env.example describe an app that needs no database or
secret, shows "being rebuilt" in production and keeps the explorer on
previews and locally, with the production check written for PowerShell.
Comments that cited deleted files, routes or functions now say they are
retired. No code changes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@ | git commit -F -
```


---

### Task 12: Open PR A3, look at it, merge it, clean up (controlling session and owner)

**Who:** the controlling session and the owner. Not a subagent.

**Files:** none in the repo. In the owner's main checkout, the stale files of the old store are deleted (Step 6).

- [ ] **Step 1: Rebase and push**

```powershell
git fetch origin
git rebase origin/main
git push -u origin refactor/retire-old-store
```
If the rebase stops on `apps/web/data/cities-report.md`: regenerate the file rather than merging it by hand. The shards on disk are `main`'s, the generator is this branch's, and the result is what the nightly would have written with this branch merged. Run from the root of the checkout:

```powershell
Push-Location apps\web
@'
import { readFileSync, writeFileSync } from "node:fs";
import { buildReport } from "./scripts/cities/report.mjs";
const index = JSON.parse(readFileSync("public/cities/index.json", "utf8"));
const shards = new Map();
let total = 0;
let largest = { code: "", bytes: 0 };
for (const { code } of index.countries) {
  const json = readFileSync(`public/cities/${code}.json`, "utf8");
  const cities = JSON.parse(json).cities;
  shards.set(code, cities);
  total += cities.length;
  if (json.length > largest.bytes) largest = { code, bytes: json.length };
}
writeFileSync("data/cities-report.md", buildReport({ shards, total, generatedAt: index.generatedAt, largest }));
'@ | node --input-type=module -
Pop-Location
git add apps/web/data/cities-report.md
git -c core.editor=true rebase --continue
```
On an unchanged tree the script reproduces the committed report byte for byte (checked on 2026-10-03), and it needs no network. Keep the script ASCII: PowerShell 5.1 pipes text to a native program as ASCII unless `$OutputEncoding` says otherwise. Node's warning about the module type is harmless. `core.editor=true` stops the rebase from opening an editor.

- [ ] **Step 2: Open the pull request**

```powershell
gh pr create --base main --title "refactor: retire the old store, accounts and their routes" --body-file <file>
```
The body lists:
- the deletions by group: the store, the accounts, the 27 routes, the orphans, the tests and the packages;
- the dormant files kept, and why (decisions A-D5 and A-D7, and A-D10 for TripView);
- what the docs now say;
- the numbers before and after;
- each task's evidence.

It ends with the attribution line.

- [ ] **Step 3: CI, the preview, and the owner's look**
  - CI: `changes`, `tools`, `web`, `e2e` and `ci-ok` green. `mobile` runs too, because the lockfile and `pnpm-workspace.yaml` changed, and must be green.
  - The Vercel preview of the head commit is Ready. Its build log shows no `better-sqlite3`, `pg` or `better-auth`, and no database variable is read.
  - The owner opens the preview. Everything from Task 7 Step 3 must still hold, and `/api/trips` must now answer 404.

- [ ] **Step 4: Merge.** The owner merges, or the controlling session does if the owner allowed it for this slice:

```powershell
gh pr merge <n> --rebase --match-head-commit <full sha of the tested head>
gh pr view <n> --json state
```
Delete the branch only after `state` says `MERGED`.

- [ ] **Step 5: Check production** with Task 7 Step 6's commands, once the merge commit's production deployment is Ready. The answers must be the same as after PR A2. Slice A's gate is now met:
  - CI's `web` job builds the app with no database;
  - the explorer and its browser tests pass on this pull request and its preview;
  - production shows "being rebuilt".

- [ ] **Step 6: Delete the old store's stale files from the owner's checkout.** PR A3 stopped ignoring them, and the repository is public, so a careless `git add -A` would publish a SQLite file holding local accounts.
  - Ask the owner first. Name each path:
    - `C:\dev\travel-super-app\apps\web\data\app.db`, `app.db-shm` and `app.db-wal`
    - `C:\dev\travel-super-app\apps\web\data\uploads\`
    - `C:\dev\travel-super-app\apps\web\e2e\.auth\`
  - Mention that the old OneDrive checkout holds the same files, if the owner still keeps it.
  - With the owner's yes:

```powershell
$stale = "C:\dev\travel-super-app\apps\web\data\app.db", "C:\dev\travel-super-app\apps\web\data\app.db-shm", "C:\dev\travel-super-app\apps\web\data\app.db-wal", "C:\dev\travel-super-app\apps\web\data\uploads", "C:\dev\travel-super-app\apps\web\e2e\.auth"
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $stale
$stale | ForEach-Object { "$_ -> " + (Test-Path $_) }
```
Expected: every line ends `-> False`. The main checkout's branch does not matter: these files are untracked on every branch. They were ignored before PR A3 and are simply gone after it.

- [ ] **Step 7: Vercel's old variables.** Nothing reads `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ACCESS_CODE`, `ADMIN_USER_IDS`, `TRUSTED_ORIGINS` or `DATABASE_URL` any more. They stay where they are: slice B removes the dead database URL, and slice C sets the auth variables afresh (spec §10). Tell the owner so, and do not touch them.


---

### Task 13: Close slice A (controlling session)

**Who:** the controlling session, with reviewer subagents. Not an implementer.

**Files:**
- Modify: `docs/superpowers/plans/2026-10-03-phase1-slice-a-clear-the-ground.md` (this file). An "Execution record" is appended.
- Local only: the memory notes and the gitignored ledger.

- [ ] **Step 1: Whole-branch review against the spec.** Give a reviewer subagent (Opus) these inputs:
  - the diff `git diff 477569e <main after PR A3>`;
  - the phase 1 spec's §1–§4 and §13, not this plan (a review against the plan cannot see a spec clause the plan lost);
  - the decisions A-D1 to A-D12 above.

  Ask it four questions:
  - Is every deletion in §4 done?
  - Does anything kept still reach the deleted code?
  - Is any dormant file left that no longer type-checks or is dead?
  - Does any comment, test name or document still describe something that no longer exists?

  Bound the review: it verifies, and anything new beyond those four questions is filed as Minor. Fix Critical and Important findings in a follow-up pull request before going on.

- [ ] **Step 2: Fable's final pass** (the standing rule). Give Fable:
  - the same diff and spec sections;
  - the review's findings;
  - the draft execution record (Step 3).

  Tell it where the earlier reviews looked hard, so it spends its effort elsewhere. Ask it to check every sentence of the record against `git` and GitHub, and say plainly that a clean report is an acceptable answer. Verify its claims before acting on them.

- [ ] **Step 3: Write the execution record** at the end of this file, under `## Execution record`. Write it from `git log`, `gh pr view` and the task reports, never from memory. It covers:
  - the three pull requests, with numbers, merge commits and dates;
  - the counts before and after for every check;
  - every step that went differently from this plan, and why;
  - every count that differs from the spec's: the spec expected "about twelve Vitest files" to go, and the slice deletes 22 (1 in Task 3, 15 in Task 8, 6 in Task 9);
  - the dormant files kept, and any deleted for failing to type-check;
  - the TripView edit;
  - what production's headers looked like on Vercel;
  - what is left for later: the arrival-airport pick that reaches nothing, enrichment unwired until phase 4, `lib/myTrips.ts`'s unused exports, and the `@noble/hashes` lockfile entry that slice C's better-auth brings back.

  Commit it on a docs branch, open a pull request, and merge it as the owner allows.

- [ ] **Step 4: Update the memory and the ledger**
  - In both memory directories (`C--dev-travel-super-app` and the old OneDrive key), the `super-app-architecture` note gets a dated block. It covers: slice A done, the PR numbers, main's SHA, what is dormant, and "next: the plan for slice B". The `MEMORY.md` index lines are updated to match.
  - `.superpowers/sdd/progress.md` records the same.
  - Remove the spike's worktree, `.claude/worktrees/spike-slice-a`, with `git worktree remove`, then delete its local branches with `git branch -D spike/slice-a spike/slice-a-r2 spike/slice-a-r3`. Those branches were never pushed.

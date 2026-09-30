# Phase 0: monorepo conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn today's single npm Next.js app into a pnpm monorepo outside OneDrive: the web app under `apps/web`, an Expo skeleton under `apps/mobile`, `features/` and `platform/` packages, a registry generator, a boundary scan, and path-filtered CI. A development build must run on the Android emulator, and the web app must not change what it does.

**Architecture:** The work lands as five small PRs plus one local step, in an order where each one can be verified before the next:

1. The checkout moves to `C:\dev\travel-super-app`.
2. PR 1: pnpm replaces npm in place.
3. PR 2: `git mv` puts the app under `apps/web`, and the Vercel Root Directory is switched over.
4. PR 3: the workspace packages, the registry generator and the boundary scan arrive, and the scan decides the zone rules of spec §0.
5. PR 4: the Expo app and one always-running CI workflow arrive.

An Expo SDK 58 upgrade follows as PR 5 when that SDK is stable. The better-auth upgrade moved to phase 1 (owner, 2026-09-30). Spec: `docs/superpowers/specs/2026-09-24-travel-super-app-design.md`, §0 and §12 item 0.

**Tech Stack:**
- pnpm 10.34.6 workspaces (`catalog:`, `allowBuilds`)
- Next 16.3.x, TypeScript 7.0.2, Vitest 4.1.11, Playwright 1.62.1
- oxc-parser 0.152.0 and oxc-resolver 11.24.2
- Expo SDK 57 (React Native 0.86.3, React 19.2.3), with expo-router, expo-dev-client and jest-expo
- GitHub Actions: `pnpm/action-setup@v6`, `dorny/paths-filter@v4`
- Node 24

## Global Constraints

Copied from the spec, and from facts checked on 2026-09-30. Every task's requirements include this section.

- **Scope is spec §12 item 0:** "Move the repo to a short path outside OneDrive, copying the Claude memory directory to the new path's key. Switch to pnpm and `git mv` today's app into `apps/web`. Add the registry generator, the boundary scan, CI jobs and an Expo skeleton in `apps/mobile`." **Gate:** "all checks green, a Vercel preview builds, and a development build runs on the Android emulator. iPhone builds wait for phase 6."
- **better-auth is NOT upgraded in phase 0.** The owner moved it to phase 1 on 2026-09-30. Better Auth 1.7.3 reverted the `account.issuer` column that the old store's hand-written DDL makes `NOT NULL`, and it added a live schema check. Phase 1 rebuilds identity on a fresh database with 1.7.6 instead of rewriting code it is about to delete. `better-auth` stays exactly `1.7.1` here.
- **The web app's behavior does not change.** Every Vitest test and every Playwright spec that passes on the baseline (Task 1) still passes after every PR, with the same counts, except tests a task adds on purpose. A count that moves for any other reason is a finding to explain, never a number to update.
- **pnpm 10 only.** `"packageManager": "pnpm@10.34.6"`. Vercel builds only pnpm 6 to 10 (vercel/vercel#17434 is still open), so never pnpm 11 or 12. Every setting lives in `pnpm-workspace.yaml`. Build scripts run only for packages listed `true` under `allowBuilds` (pnpm ≥ 10.26).
- **better-sqlite3 never builds from source here.** There is no C++ toolchain on this machine, and it ships prebuilt binaries. It is listed `false` under `allowBuilds`.
- **The zones of spec §0 are law**, as encoded in `tools/boundaries/src/rules.ts` (Task 8). The scan is the deciding check. Features never import each other, the platform never imports a feature, and only the apps import the generated registry. Nothing uses `react-native-web`.
- **The generated registry is gitignored** and rebuilt by the root `postinstall` (spec §0 "Registry").
- **Expo:** SDK 58 once it's stable, otherwise SDK 57 with React 19.2.3, upgraded within phase 0 (Task 14). The config file is `app.config.js`, never `.ts` (spec §0). Development builds come through `expo-dev-client`, and `android.cmakeVersion` is ≥ 3.31.6.
- **One React for the whole workspace.** `react` and `react-dom` come from the pnpm catalog, pinned to the Expo SDK's exact version. The web App Router runs Next's vendored React whatever is installed, so only web tests see the pin.
- **CI** is "one always-running workflow, gated with `dorny/paths-filter` and `if:`. EAS never runs on pull requests." (spec §0)
- **$0 a month.** No paid service, no EAS build, no domain, Vercel Hobby. The Vercel region stays `bom1`, because the move to `sin1` happens in phase 1.
- **Owner-only actions:** Vercel project settings, enabling or disabling GitHub workflows, Windows features, installing JDK, Android SDK and emulator pieces, and merging. The executing agent asks and waits; it never does these on its own.
- **The owner's shell is PowerShell 5.1.** Every command a step tells the operator to run is written for it: no `VAR=x cmd`, no `&&` (use `;` and check `$?`). Bash appears only inside GitHub workflow files, which run on ubuntu.
- **Windows App Control** blocks native `.node` binaries loaded from `%TEMP%`. Next, Playwright, Vitest with oxc, Gradle and Metro run only from the checkout (`C:\dev\travel-super-app` or a `.claude/worktrees/<name>` under it), never from a scratchpad.
- **Line endings.** Working copies are CRLF (`core.autocrlf=true` is set system-wide). The committed artifacts under `data/` and `public/` are pinned LF by `.gitattributes`, and their byte-exact tests depend on that. Edit files with the Edit and Write tools, not with heredoc-fed scripts.
- **Merges are rebase-merges.** After every merge, rebase the next PR on main and re-run CI. Before deleting a branch, check that `gh pr view <n> --json state` says `MERGED`.
- **Commits:** conventional (`feat:`, `fix:`, `chore:`, `ci:`, `test:`, `docs:`), each ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Files stay under 800 lines**, except the five test files the owner already exempted.
- **The repo name is not replaced in phase 0.** The 30 files that still say `china-itinerary-planner`, including the User-Agent strings `scripts/user-agent.test.ts` pins, change in phase 1's first PR (spec §12 item 1).

## Decisions this plan takes

The spec leaves these open. Each one takes the default below; the owner can override any of them before the task that uses it.

| # | Decision | Why |
|---|---|---|
| D1 | Package scope `@tsa`: `@tsa/web`, `@tsa/mobile`, `@tsa/features`, `@tsa/platform`, `@tsa/registry-gen`, `@tsa/boundaries`. The root package is `travel-super-app`. | The research's proposal. It is a scope, not the product name, which phase 3 picks. |
| D2 | The checkout lives at `C:\dev\travel-super-app`. | The memory's choice. It is short and outside OneDrive and `%TEMP%`. |
| D3 | pnpm **10.34.6**, not the spec's 10.34.5. | One patch newer on the same line (2026-09-28); it changes no build setting. |
| D4 | `apps/web` is a pure move. `app/`, `components/` and `lib/` keep their places, and there is no `src/` yet. | `src/app`, the route groups and the landing page arrive with the shell in phase 3. Moving now would churn 167 `@/` imports for nothing. |
| D5 | `reference/` and `db/migrations/` are created when their first files land (phase 4 and phase 1). | An empty package proves nothing and invites a stray file. |
| D6 | Biome `noRestrictedImports` and the per-zone tsconfigs arrive with `features/_template` in phase 1. The scan (Task 8) lands now. | The spec lists them under phase 1 ("every guardrail that doesn't depend on sync"). A zone tsconfig with no files fails `tsc` with TS18003. |
| D7 | The web app's `react` and `react-dom` move to the catalog's 19.2.3 in PR 4, down from 19.2.8. | One React in the workspace, as Expo requires. The web runtime uses Next's vendored React, so only Vitest and jsdom see the change. The research found only RSC-package fixes between 19.2.4 and 19.2.8. |
| D8 | The mobile app uses TypeScript 7.0.2 plus `"expo": {"install": {"exclude": ["typescript"]}}` (the spec's route) **if** `tsc` passes on the skeleton. Otherwise it falls back to `typescript ~6.0.3` in `apps/mobile` only (Task 10, Step 9). | TS 7 against the real React Native and Expo types is unverified. The rule decides it with one command. |
| D9 | Placeholder identities: Android package and iOS bundle `com.darrencwj.travelsuperapp`, scheme `travelsuperapp`, display name "Travel super app". | The name is chosen in phase 3, and all of these can change until the first store upload (phase 6). |
| D10 | Vercel gets no `installCommand` override. The default `pnpm install` runs, and pnpm 10 switches itself to the pinned version. `ENABLE_EXPERIMENTAL_COREPACK=1` is added only if the build log shows another pnpm. | Vercel's docs say an overridden install command can run the image's oldest pnpm. |
| D11 | The nightly refresh workflows are disabled only for the Root Directory cutover window (Task 6). | A data commit on the old paths while Root Directory is `apps/web` would fail its deploy and complicate the rebase. |
| D12 | The Expo skeleton starts from `blank-typescript` and adds expo-router, not from the `default` template. | The default template brings reanimated, `react-native-web` and demo screens. A smaller native surface means fewer pnpm-isolation surprises. |
| D13 | Three pieces of §0's end-state tree wait for their phases: `apps/mobile/eas.json` (phase 6), the Claude file layout (a tracked root `CLAUDE.md` repo map, `apps/mobile/CLAUDE.md`, `.claude` in `.vercelignore`; phase 1), and `src/` in `apps/web` (D4). Phase 0 tracks only the `apps/web/AGENTS.md` and `CLAUDE.md` that `next dev` writes. | EAS is unused until phase 6. §12 item 1 owns "the Claude file layout". |
| D14 | The generated files are exported as `@tsa/features/_registry/*` and `@tsa/platform/_registry/server`, the same name as their folder. | A key such as `./registry/server` would shadow the `./*/server` pattern for the spec's own `platform/registry` module. |

## PR map

| Order | Branch | Tasks | Merge gate |
|---|---|---|---|
| — | (local) | 1 | The fresh clone at `C:\dev\travel-super-app` reproduces the baseline counts, and `next build` succeeds there |
| PR 1 | `chore/pnpm` | 2, 3 | CI green; the Vercel preview is Ready and its log shows pnpm 10.34.6 |
| PR 2 | `chore/apps-web` | 4, 5, 6 | CI green; with Root Directory `apps/web` the preview is Ready; browser glance done; after merge a dispatched nightly writes to the new paths |
| PR 3 | `feat/workspace-tools` | 7, 8 | CI green; the tool suites pass; the whole-repo scan is clean |
| PR 4 | `feat/mobile-skeleton` | 9 (owner), 10, 11, 12 | CI green on the new workflow; the mobile job is green; the development build runs on the emulator |
| PR 5 | `chore/expo-sdk-58` | 13 | Only when SDK 58 is stable: the mobile checks and the emulator build pass on 58 |
| — | (close-out) | 14 | The phase 0 gate is recorded; Fable's final pass is clean; memory is updated |

Tasks 1, 6, 9, 12 and 14 need the owner or the controlling session. Do not hand them to a subagent.

## File structure at the end of phase 0

```
C:\dev\travel-super-app\
├─ package.json              root workspace: packageManager, engines, postinstall, delegating scripts   (PR 2, PR 3)
├─ pnpm-workspace.yaml       packages, catalog, allowBuilds                                          (PR 1 → PR 4)
├─ pnpm-lock.yaml                                                                                      (PR 1)
├─ .gitignore                re-anchored for apps/web; generated registries; Claude runtime state       (PR 2, PR 3)
├─ README.md                 pnpm and monorepo commands                                                 (PR 1, PR 2)
├─ .claude/launch.json       pnpm --filter @tsa/web dev                                                 (PR 1, PR 2)
├─ .github/workflows/        ci.yml (one workflow, path-filtered) + the three refresh workflows          (PR 1, PR 2, PR 4)
├─ apps/
│  ├─ web/                   today's whole app, moved with git mv (+ .gitattributes, vercel.json, AGENTS.md, CLAUDE.md)
│  └─ mobile/                Expo SDK 57: app.config.js, src/app/{_layout,index}.tsx, tests/home.test.tsx   (PR 4)
├─ features/                 package.json (@tsa/features, exports map); _registry/ generated, gitignored  (PR 3)
├─ platform/                 package.json (@tsa/platform, exports map); _registry/ generated, gitignored  (PR 3)
└─ tools/
   ├─ registry-gen/          generate.mjs, cli.mjs, generate.test.ts                                     (PR 3)
   └─ boundaries/            src/{imports,zones,rules,scan}.ts + tests, repo.test.ts                     (PR 3)
```

**Where the code in this plan comes from.** The whole of `tools/boundaries/src/*` and `tools/registry-gen/*` was written and run before this plan was written. It lived in a spike at `.claude/worktrees/spike-phase0` of the old checkout. It ran 140 tests green under Vitest 4.1.11 and passed `tsc` 7.0.2 with `checkJs`, and every rule in `rules.ts` was mutation-checked: deleting or inverting any one of them turns a test red. The plan adds a 2-test scan of the repo itself, so the tool suites total 142: 132 in boundaries and 10 in registry-gen. Fable's review of this plan found two latent defects in that code, and both are fixed here:
- the generated feature registry would have been flagged "features never import each other" as soon as a feature existed;
- the reserved name `registry` would have collided with the spec's `platform/registry` module. The files below are those exact files. The spike also scanned today's app as a stand-in for `apps/web` and found one real violation, a computed `import()` in `lib/tokens.test.ts:194`. That result is why test files may use computed specifiers. The spike also showed that oxc's module record misses TypeScript's `import x = require("y")`, which the AST walk now catches.

---

### Task 1: Move the checkout out of OneDrive (local, no PR)

**Who:** the owner (Steps 1 and 7) and the controlling session. Not a subagent.

**Files:** none in the repo. Creates `C:\dev\travel-super-app` and the memory directory `C:\Users\msn-f\.claude\projects\C--dev-travel-super-app\memory`.

**Produces:** a clean clone at `C:\dev\travel-super-app` and the **baseline numbers** every later task compares against: the Vitest file and test counts and the Playwright pass count.

- [ ] **Step 1 (owner): close everything that uses the old folder.** Close every other Claude Code session, editor and terminal opened on `C:\Users\msn-f\OneDrive\Desktop\China Itenary Planner`.

- [ ] **Step 2: prove nothing local would be lost**

```powershell
cd "C:\Users\msn-f\OneDrive\Desktop\China Itenary Planner"
git fetch --prune
git status --short
git stash list
git branch -vv
git worktree list
foreach ($sha in "7f0d05d","c7ca63c","f1d78ba") { git cherry origin/main $sha }
```
Expected:
- `git status` and `git stash list` print nothing.
- No branch says `ahead`.
- `git worktree list` shows the three leftover worktrees: `busy-mclaren-8a5671` at 7f0d05d, `hopeful-ramanujan-8e8af0` at c7ca63c and `nervous-moser-e26c6b` at f1d78ba.
- Their heads print only lines starting with `-` (14, 4 and 2 of them), meaning every commit is already on main under a rebased SHA (checked on 2026-09-30).

If anything else shows up, stop and ask the owner.

- [ ] **Step 3: clone to the new path**

```powershell
New-Item -ItemType Directory -Force C:\dev | Out-Null
git clone https://github.com/darrenCWJ/travel-super-app.git C:\dev\travel-super-app
cd C:\dev\travel-super-app
git config core.longpaths true
```
Expected: the clone finishes. `git log -1 --format=%h` matches `origin/main` in the old checkout.

- [ ] **Step 4: carry the local-only files a clone lacks.** Names only; never print their contents.

```powershell
$old = "C:\Users\msn-f\OneDrive\Desktop\China Itenary Planner"
Copy-Item "$old\.env.local" .\.env.local
Copy-Item -Recurse "$old\.vercel" .\.vercel
Copy-Item "$old\.git\info\exclude" .\.git\info\exclude -Force
Copy-Item "$old\CLAUDE.md", "$old\AGENTS.md" .
if (Test-Path "$old\data\app.db") { Copy-Item "$old\data\app.db*" .\data\ }
git status --short
```
Expected: `git status` prints nothing, because every copied file is ignored.

`.vercel\reset-password.mjs` stops working after Task 4, since it loads `node_modules` and `data\app.db` relative to itself. It only serves the dead production database, and phase 1 replaces it.

- [ ] **Step 5: copy the Claude memory to the new path's key**

```powershell
$src = "$env:USERPROFILE\.claude\projects\C--Users-msn-f-OneDrive-Desktop-China-Itenary-Planner\memory"
$dst = "$env:USERPROFILE\.claude\projects\C--dev-travel-super-app\memory"
New-Item -ItemType Directory -Force $dst | Out-Null
Copy-Item -Recurse -Force "$src\*" $dst
(Get-ChildItem $src).Count; (Get-ChildItem $dst).Count
```
Expected: both counts are equal.

- [ ] **Step 6: record the baseline in the new place.** This is still npm and the lockfile's exact tree.

```powershell
npm ci --ignore-scripts
npx tsc --noEmit
npx vitest run
npx next build
npx playwright test
git checkout -- next-env.d.ts
```
Expected:
- `tsc` is clean.
- Vitest prints `Test Files <F> passed` and `Tests <T> passed`. Record F and T; they were 167 and 2,767 on 2026-09-24, but use today's numbers.
- `next build` succeeds. This is the proof that Windows App Control lets Next's native SWC load from `C:\dev`. If it prints `Turbopack is not supported on this platform` or `Only WebAssembly (WASM) bindings were loaded`, stop and report to the owner: App Control blocks this path too.
- Playwright prints `<P> passed`. Record P.
- If a few heavy tests time out, check CPU load before blaming the new path. A game on this desktop times out four heavy tests in every full run; close it and re-run.

- [ ] **Step 7 (owner): start working from the new checkout.** Open a new Claude Code session with `C:\dev\travel-super-app` as its folder. Confirm the session shows the memory index; the header line mentions the super app architecture. If the session reports a memory path other than `...\C--dev-travel-super-app\memory`, copy the memory there too.

The OneDrive checkout stays untouched as a fallback until Task 14. Every later task runs in `C:\dev\travel-super-app`.

---

### Task 2: Switch to pnpm in place (PR 1)

**Files:**
- Create: `pnpm-workspace.yaml`, `pnpm-lock.yaml` (generated)
- Delete: `package-lock.json`, `.npmrc`
- Modify: `package.json` (add `packageManager` and `engines`, plus two `@types` dev dependencies)
- Modify: `playwright.config.ts:141` (`webServer.command`)
- Modify: `.claude/launch.json`
- Modify: `README.md` (the "Getting started" block, L98-107)

**Interfaces:**
- Consumes: Task 1's baseline counts F, T and P.
- Produces: `pnpm-workspace.yaml` holding `allowBuilds`. Later tasks add `packages` and `catalog` to it.

- [ ] **Step 1: branch**

```powershell
git switch -c chore/pnpm
```

- [ ] **Step 2: create `pnpm-workspace.yaml`**

```yaml
# pnpm 10 reads every setting from this file; .npmrc is only for registry auth.
# `packages:` arrives when the app moves to apps/web (phase 0, PR 2).

# Dependency install scripts stay OFF unless a package is listed `true` here.
# better-sqlite3 ships prebuilt binaries (prebuilds/win32-x64.node, linux-x64)
# and this machine has no C++ toolchain, so the `node-gyp rebuild` npm used to
# infer for it must never run. `false` records that decision and silences the
# "ignored build scripts" warning.
allowBuilds:
  better-sqlite3: false
```

- [ ] **Step 3: turn the npm lockfile into a pnpm one, keeping every version**

```powershell
pnpm import
```
Expected: it writes `pnpm-lock.yaml` with `lockfileVersion: '9.0'`, and prints one peer warning: `better-auth 1.7.1 ... unmet peer better-sqlite3@^12.0.0: found 13.0.3`. That warning is an optional peer and the same mismatch `.npmrc`'s `legacy-peer-deps` used to hide; it is harmless. A dry run of this exact command on 2026-09-30 kept next 16.3.6, react 19.2.8, better-auth 1.7.1, vitest 4.1.11 and typescript 7.0.2.

- [ ] **Step 4: pin pnpm and Node in `package.json`.** After `"private": true,` add:

```json
  "packageManager": "pnpm@10.34.6",
  "engines": {
    "node": "24.x"
  },
```

- [ ] **Step 5: drop npm's files and install with pnpm**

```powershell
Remove-Item package-lock.json, .npmrc
Remove-Item -Recurse -Force node_modules
pnpm install
```
Expected: pnpm switches itself to 10.34.6 because of `packageManager` (`managePackageManagerVersions` defaults to on), then installs. If it prints `Ignored build scripts:` naming anything except better-sqlite3, read that package's install script. List it `false` in `allowBuilds` if the package ships prebuilt binaries or is optional; list it `true` only if the app fails without the script. Either way, write a comment saying why.

- [ ] **Step 6: run the type-check and watch the phantom dependencies fail**

```powershell
pnpm exec tsc --noEmit
```
Expected: FAIL, with `TS2307: Cannot find module 'topojson-specification'` in about 10 files. npm hoisted that type package from `@types/topojson-client`; pnpm's strict layout does not. The global `GeoJSON` namespace may still resolve, because `@types/d3-geo` pulls `@types/geojson` into the program itself. Declaring it anyway, in Step 7, stops the app depending on another package's internals. If tsc passes outright, report it: the inventory predicted the `topojson-specification` errors.

- [ ] **Step 7: declare them**

```powershell
pnpm add -D @types/geojson@^7946.0.16 @types/topojson-specification@^1.0.5
pnpm exec tsc --noEmit
```
Expected: tsc is clean. These are the versions npm hoisted on 2026-09-30.

- [ ] **Step 8: point Playwright and the preview launcher at pnpm.** In `playwright.config.ts` change the `webServer` command:

```ts
    command: "pnpm exec next dev -p 3100",
```
and replace `.claude/launch.json` with:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "dev",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["dev"],
      "port": 3000,
      "autoPort": true
    }
  ]
}
```

- [ ] **Step 9: update the README's "Getting started" block** (`README.md` L98-107) to:

````markdown
```bash
pnpm install                   # pnpm 10 is pinned in package.json; `corepack enable` or `npm i -g pnpm@10` gets it
cp .env.example .env.local     # optional; see Environment variables
pnpm dev                       # every data artifact is committed — this is a working app
pnpm test                      # unit tests (Vitest: a node project and a jsdom project)
pnpm test:e2e                  # Playwright, against a dev server it starts on :3100
pnpm build                     # what CI runs after the tests
```
````

- [ ] **Step 10: the whole suite against the baseline**

```powershell
pnpm test
pnpm build
pnpm test:e2e
git checkout -- next-env.d.ts
```
Expected: `Test Files F passed` and `Tests T passed`, exactly Task 1's numbers. The build succeeds. Playwright shows `P passed`. Any other count is a finding to root-cause before committing.

- [ ] **Step 11: commit**

```powershell
git add -A -- pnpm-workspace.yaml pnpm-lock.yaml package.json package-lock.json .npmrc playwright.config.ts .claude/launch.json README.md
git commit -m "chore: switch from npm to pnpm 10.34.6" -m "pnpm import kept every locked version. Two type packages npm hoisted (topojson-specification, geojson) are now declared, since pnpm's strict layout no longer lends them. better-sqlite3 stays unbuilt: it ships prebuilds and this machine has no C++ toolchain." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: CI, the refresh jobs and Vercel on pnpm (PR 1)

**Files:**
- Modify: `.github/workflows/ci.yml` (both jobs)
- Modify: `.github/workflows/refresh-cities.yml` (the `commit` job, and the comment at L130-135)
- Modify: `.github/workflows/refresh-climate.yml` (setup, install and test steps, and the comment at L140)
- Modify: `vercel.json` (drop `installCommand`)

`refresh-airports.yml` installs nothing, so it has nothing to change in PR 1.

**Interfaces:**
- Consumes: Task 2's `packageManager`, which `pnpm/action-setup@v6` reads. Never also pass it a `version`, or it throws on the mismatch.

- [ ] **Step 1: `ci.yml`.** In both jobs, replace the `setup-node` step and the install with the steps below, and delete the three `legacy-peer-deps` comment lines above `npm ci`:

```yaml
      - uses: actions/checkout@v5
      # Takes the pnpm version from package.json's packageManager.
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
```
Then change the remaining commands:
- in `test`: `npx tsc --noEmit` → `pnpm exec tsc --noEmit`; `npm test` → `pnpm test`; `npx next build` → `pnpm build`. Keep the long `server-only` comment above it unchanged.
- in `e2e`: `npx playwright install --with-deps chromium` → `pnpm exec playwright install --with-deps chromium`; `npx playwright test` → `pnpm exec playwright test`.

Leave the "Resolve Playwright version" step as it is. `@playwright/test` is a direct dependency, so `require` still resolves it at the root.

- [ ] **Step 2: `refresh-cities.yml`, `commit` job.** Replace its first steps, from `- uses: actions/checkout@v5` through `- run: npm ci --legacy-peer-deps`, with:

```yaml
      - uses: actions/checkout@v5

      - uses: pnpm/action-setup@v6

      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm

      # This install is for vitest, so "Verify the artifacts" below can run.
      - run: pnpm install --frozen-lockfile
```
Then:
- In "Verify the artifacts against the repo's own tests", change `run: npm test` to `run: pnpm test`.
- In the same step's comment, change "`npm test` is also literally ci.yml's gate" to "`pnpm test` is also literally ci.yml's gate".
- In the `cities` job's comment (L130-135), change "No `npm ci` here any more, and no `cache: npm`" to "No install here any more, and no package cache", and "ci.yml runs `npm ci` on every push" to "ci.yml runs `pnpm install --frozen-lockfile` on every push".

- [ ] **Step 3: `refresh-climate.yml`.** Replace the `setup-node` step with the same three steps as Step 2 (checkout is already there, so add only `pnpm/action-setup@v6` and `setup-node` with `cache: pnpm`). Then:
- change `- run: npm ci` to `- run: pnpm install --frozen-lockfile`;
- change `run: npm test` to `run: pnpm test`;
- in the timeout comment (L140), change "~3 min more for `npm ci` and `npm test`" to "~3 min more for `pnpm install` and `pnpm test`".

- [ ] **Step 4: `vercel.json`.** Drop the npm install override. With no override, Vercel's default `pnpm install` runs, and pnpm switches itself to the pinned 10.34.6.

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["bom1"]
}
```

- [ ] **Step 5: check no npm call is left in a workflow**

```powershell
Select-String -Path .github\workflows\*.yml -Pattern "npm ci|npm test|npx |cache: npm" | Select-Object -ExpandProperty Line
```
Expected: only comment lines match, and no step does. On 2026-09-30 those were:
- `ci.yml:5`, which is history ("nothing anywhere ran `npm test`"): leave it;
- about six header comments in `refresh-cities.yml` and `refresh-climate.yml` that name `npm test` or `npm ci`: reword each for pnpm, because stale comments are this project's known failure mode.

- [ ] **Step 6: commit, push, open PR 1**

```powershell
git add .github/workflows/ci.yml .github/workflows/refresh-cities.yml .github/workflows/refresh-climate.yml vercel.json
git commit -m "ci: install and test with pnpm" -m "pnpm/action-setup reads packageManager; setup-node caches the pnpm store. vercel.json no longer overrides the install, so Vercel's default pnpm install runs and pnpm switches itself to the pinned version." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin chore/pnpm
gh pr create --base main --title "chore: switch from npm to pnpm 10.34.6" --body "<summary; the baseline F/T/P from Task 1 and the same numbers on this branch; test plan>"
```
End the PR body with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 7: verify CI and the Vercel preview**

CI: the `test` and `e2e` jobs are green.

Vercel: find this branch's preview and read its build log. Paste the URL that `vercel ls` prints into `$preview`:
```powershell
vercel ls china-itinerary-planner -m githubCommitRef=chore/pnpm
$preview = "https://paste-the-preview-url-here.vercel.app"
vercel inspect $preview --logs
```
Expected in the log:
- pnpm at 10.34.6, either shown directly or after it switches from the image's pnpm 10;
- no `Ignored build scripts` line except one naming better-sqlite3;
- `Compiled successfully`;
- the deployment is Ready.

If the log shows pnpm 9, or a pnpm 10 older than 10.26 that never switches: ask the owner to add the environment variable `ENABLE_EXPERIMENTAL_COREPACK` = `1` for Preview and Production in the Vercel project, then run `vercel redeploy $preview` and read the new deployment's log.

- [ ] **Step 8 (owner): merge PR 1**, rebase-merge. Then watch the next scheduled `Refresh cities` run, because its `commit` job now installs with pnpm:

```powershell
gh run list --workflow "Refresh cities" --limit 1
```
Expected: green, and its `commit` job log shows `pnpm install --frozen-lockfile`. If the owner would rather not wait, they can dispatch it with `gh workflow run "Refresh cities" --ref main`.

---

### Task 4: Move the web app into `apps/web` (PR 2)

**Files:**
- Move (`git mv`) into `apps/web/`: `app/ components/ lib/ scripts/ data/ public/ e2e/ test/` and `.env.example .gitattributes .vercelignore instrumentation.ts next-env.d.ts next.config.ts package.json playwright.config.ts postcss.config.mjs proxy.ts tsconfig.json vercel.json vitest.config.mts vitest.server-only.ts vitest.setup.ts`
- Stay at the root: `.github/ docs/ .claude/ README.md .gitignore pnpm-workspace.yaml pnpm-lock.yaml`
- Create: `package.json` (the new workspace root)
- Create (tracked for the first time): `apps/web/AGENTS.md` and `apps/web/CLAUDE.md`, which `next dev` writes
- Modify: `apps/web/package.json`, `pnpm-workspace.yaml`, `.gitignore`, `.claude/launch.json`, `README.md`, `apps/web/lib/server/catalog.ts:145`

**Interfaces:**
- Produces: the workspace package `@tsa/web` at `apps/web`. The root scripts `dev`, `build`, `test` and `test:e2e` delegate to it, so `pnpm test` at the root runs the web suite with its working directory set to `apps/web`, which 23 test files depend on. `.gitattributes` moves with the files it governs, so its `data/*.json`-style patterns, which are relative to the file's own folder, keep matching.

- [ ] **Step 1: branch from the merged PR 1**

```powershell
git switch main; git pull --ff-only
git switch -c chore/apps-web
```

- [ ] **Step 2: move the tracked app files.** `git mv` takes the literal paths, so the bracketed folders (`app/trip/[id]` and others) are safe inside a moved parent.

```powershell
New-Item -ItemType Directory -Force apps\web | Out-Null
$paths = "app","components","lib","scripts","data","public","e2e","test",".env.example",".gitattributes",".vercelignore","instrumentation.ts","next-env.d.ts","next.config.ts","package.json","playwright.config.ts","postcss.config.mjs","proxy.ts","tsconfig.json","vercel.json","vitest.config.mts","vitest.server-only.ts","vitest.setup.ts"
foreach ($p in $paths) { git mv $p "apps/web/$p"; if (-not $?) { throw "git mv failed on $p" } }
git ls-files | Where-Object { $_ -notmatch "^(apps/|docs/|\.github/|\.claude/|README\.md$|\.gitignore$|pnpm-)" }
```
Expected: the last command prints nothing, so every tracked file is either moved or deliberately at the root.

- [ ] **Step 3: make `apps/web/package.json` the web package.** Set `"name": "@tsa/web"`, and delete its `packageManager` and `engines` entries, which move to the root in Step 4. Scripts and dependencies stay as they are.

- [ ] **Step 4: create the workspace root `package.json`**

```json
{
  "name": "travel-super-app",
  "private": true,
  "packageManager": "pnpm@10.34.6",
  "engines": {
    "node": "24.x"
  },
  "scripts": {
    "dev": "pnpm --filter @tsa/web dev",
    "build": "pnpm --filter @tsa/web build",
    "test": "pnpm -r --stream test",
    "test:e2e": "pnpm --filter @tsa/web test:e2e"
  }
}
```
`pnpm -r` leaves out the root package, so `test` cannot recurse into itself.

- [ ] **Step 5: declare the workspace.** Add this at the top of `pnpm-workspace.yaml`, above `allowBuilds`:

```yaml
packages:
  - apps/*
```

- [ ] **Step 6: replace `.gitignore`.** Its anchored entries (`/node_modules`, `/.next/`, `/data/app.db*`, `/e2e/.auth/` and the rest) would stop matching under `apps/web/`. Replace the whole file with:

```gitignore
# dependencies: every workspace package has its own node_modules
node_modules/

# next.js
/apps/web/.next/
/apps/web/out/
# `next dev` writes these into the Next project folder. apps/web's copies are
# tracked; stray copies at the root are not.
/AGENTS.md
/CLAUDE.md

# production
/apps/web/build

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# env files
.env*
# ...except the committed template, which holds no real values
!.env.example

# typescript
*.tsbuildinfo

# vercel
.vercel

# local data (SQLite db, ingest artifacts)
/apps/web/data/app.db*
/apps/web/data/ingest.log
/apps/web/data/.ingest.lock

# agent scratch: SDD ledgers, task briefs, review packages, generated schema dumps
/.superpowers/

# Playwright
/apps/web/test-results/
/apps/web/playwright-report/
/apps/web/blob-report/
/apps/web/playwright/.cache/
/apps/web/e2e/.auth/

# Claude Code runtime state. On the old checkout this lived only in
# .git/info/exclude, which a clone never gets.
.claude/worktrees/
**/.claude/scheduled_tasks.lock
**/.claude/scheduled_tasks.json
**/.claude/routines/.state/
**/.claude/checkpoints/
**/.claude/mailbox/
**/.claude/agent-registry.json
**/.claude/agent-memory-local
**/.claude/first-run
**/.claude/assistant-daemon-state.json
```

- [ ] **Step 7: small path fixes**
- `.claude/launch.json`: set `"runtimeArgs": ["--filter", "@tsa/web", "dev"]`.
- `apps/web/lib/server/catalog.ts:145`: the fallback URL's path gains the new folder. The repo name stays until phase 1, and the old name still redirects.

```ts
  "https://raw.githubusercontent.com/darrenCWJ/china-itinerary-planner/main/apps/web/data/catalog.json";
```
- `README.md`:
  - "Project layout" (L134-154): put the existing tree under a new `apps/web/` heading, and add the root lines `package.json`, `pnpm-workspace.yaml`, `docs/` and `.github/`.
  - "Data, and how it refreshes" (L113-132): every `node scripts/...` example gains "from `apps/web`", for example ``cd apps/web; node scripts/ingest-destinations.mjs``.
  - L171-173: delete the stale sentence about an install command that pulls the `main` tarball. The dashboard override is long gone.

- [ ] **Step 8: move the untracked local files that `git mv` left behind.** `git mv` renames whole folders on disk, so the untracked files inside moved folders have already gone with them: `data/app.db*` is now in `apps/web/data/` and `e2e/.auth/` in `apps/web/e2e/`. What remains at the root is `.env.local` plus build output.

```powershell
if (Test-Path .env.local) { Move-Item .env.local apps\web\.env.local }
Remove-Item -Recurse -Force node_modules, .next, test-results, playwright-report, tsconfig.tsbuildinfo, AGENTS.md, CLAUDE.md -ErrorAction SilentlyContinue
Get-ChildItem -Force -Name
```
Expected: the listing shows only `.claude`, `.git`, `.github`, `.gitignore`, `.vercel`, `apps`, `docs`, `package.json` (Step 4), `pnpm-lock.yaml`, `pnpm-workspace.yaml` and `README.md`. `.superpowers` may also appear if it was carried over.
The root `AGENTS.md` and `CLAUDE.md` were local copies pointing at a root `node_modules/next` that no longer exists. `next dev` writes fresh ones into `apps/web` in Step 10.

- [ ] **Step 9: reinstall and check nothing resolved differently**

```powershell
pnpm install
pnpm --filter @tsa/web why next
pnpm --filter @tsa/web why react
git diff --stat -- pnpm-lock.yaml
```
Expected: next 16.3.6 and react 19.2.8, as before. The lockfile diff only renames the importer `.` to `apps/web`, with no version lines changing. If a version changed, find out why before going on.

- [ ] **Step 10: the whole suite against the baseline, from the root**

```powershell
pnpm --filter @tsa/web exec tsc --noEmit
pnpm test
pnpm build
pnpm test:e2e
git checkout -- apps/web/next-env.d.ts
git check-attr eol -- apps/web/data/cities-report.md apps/web/public/climate/PE.json apps/web/public/country-projections.json
```
Expected:
- tsc is clean.
- `Test Files F passed` and `Tests T passed`, exactly as in Task 1.
- The build succeeds, and Playwright shows `P passed`.
- All three `check-attr` lines end in `eol: lf`. That proves `.gitattributes` still governs the byte-exact artifacts after the move, which the committed-report contracts in `lib/contracts.test.ts` depend on.

- [ ] **Step 11: track Next's agent files.** The e2e run started `next dev`, which wrote `apps/web/AGENTS.md` (Next's "This is NOT the Next.js you know" block) and `apps/web/CLAUDE.md` (`@AGENTS.md`). Track both, as spec §10 asks:

```powershell
Get-Content apps\web\CLAUDE.md
git add apps/web/AGENTS.md apps/web/CLAUDE.md
```
Expected: `CLAUDE.md` holds the single line `@AGENTS.md`.

- [ ] **Step 12 (controlling session): browser glance.** This is a standing rule before any UI merge. Start the dev server with the preview launcher and sign in through the e2e harness's saved session, following the recipe in memory `browser-glance-before-merge.md`. Screenshot the globe, a country map and a trip page. The vendored fonts, the globe and the map legend must render as they do on main.

- [ ] **Step 13: commit.** One commit, so git records renames rather than delete-and-add pairs.

```powershell
git add -A
git status --short | Where-Object { $_ -notmatch "^R " }
git commit -m "chore: move the web app into apps/web" -m "A pure move with git mv; the app's own layout is unchanged. The root becomes a pnpm workspace whose scripts delegate to @tsa/web, so tests still run with apps/web as their working directory. .gitattributes moves with the artifacts it pins to LF; .gitignore is re-anchored; Next's AGENTS.md and CLAUDE.md are now tracked in apps/web." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: the `Where-Object` line lists only these:
- `M  package.json`: the root path still exists, with new content;
- `A  apps/web/package.json`: git cannot pair it as a rename while `package.json` still exists;
- `M` lines for `.gitignore`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.claude/launch.json` and `README.md`;
- `A` lines for `apps/web/AGENTS.md` and `apps/web/CLAUDE.md`.

Nothing else, and no `.env.local` and no `app.db`. The renamed-and-edited `apps/web/lib/server/catalog.ts` shows as `R`, which the filter hides.

---

### Task 5: The workflows for the new layout (PR 2)

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/refresh-airports.yml`
- Modify: `.github/workflows/refresh-cities.yml`
- Modify: `.github/workflows/refresh-climate.yml`

**Interfaces:**
- Consumes: Task 4's layout. The ingest scripts find `data/` and `public/` through `import.meta.url`, so they write into `apps/web/` once their working directory is `apps/web`.

The trap this task exists for: `upload-artifact` roots an artifact at the least common ancestor of its paths. After the move, the city artifact's root becomes `apps/web/` and the facts artifact's root becomes `apps/web/data/`. If the unchanged downloads (`path: .` and `path: data`) restored them to the repo root, every later step would run perfectly on the stale checked-out copies, and the job would go green having committed nothing.

- [ ] **Step 1: `ci.yml`.** In the `test` job:
  - `pnpm exec tsc --noEmit` → `pnpm --filter @tsa/web exec tsc --noEmit`;
  - `pnpm test` and `pnpm build` stay, since the root scripts delegate.

  In the `e2e` job:
  - give "Resolve Playwright version" the line `working-directory: apps/web`;
  - `pnpm exec playwright install --with-deps chromium` → `pnpm --filter @tsa/web exec playwright install --with-deps chromium`;
  - `pnpm exec playwright test` → `pnpm --filter @tsa/web exec playwright test`;
  - the artifact upload's paths become:

```yaml
          path: |
            apps/web/playwright-report/
            apps/web/test-results/
```

- [ ] **Step 2: `refresh-airports.yml`**

```yaml
      - name: Ingest airports
        working-directory: apps/web
        run: node scripts/ingest-airports.mjs

      - name: Commit if the data changed
        run: |
          if git diff --quiet -- apps/web/data/airports.json; then
            echo "No change in the airport set — nothing to commit."
            exit 0
          fi
          git config user.name  "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add apps/web/data/airports.json apps/web/data/airports-report.md
          git commit -m "chore: refresh airports from OurAirports"
          git push
```

- [ ] **Step 3: `refresh-cities.yml`, the `cities` and `facts` jobs.**
  - Give each `node scripts/...` step (`Ingest cities`, `Enrich the top cities per country`, `Ingest country facts`) the line `working-directory: apps/web`, directly above its `run:` line. Step 6 checks for exactly that placement.
  - Prefix both uploads' paths, and rewrite the two notes about artifact roots:

```yaml
        # These paths span public/ and data/ under apps/web/, so the artifact's
        # root is apps/web/ and `commit` restores it with `path: apps/web`.
        # The `facts` artifact below has a different root; see the note there.
        - uses: actions/upload-artifact@v7
          with:
            name: city-artifacts
            path: |
              apps/web/public/cities
              apps/web/data/cities-index.json
              apps/web/data/cities-enrich-targets.json
              apps/web/data/cities-report.md
            if-no-files-found: error
            retention-days: 1
```
```yaml
        # BOTH paths are under apps/web/data/, so that is this artifact's root,
        # not apps/web/ as for city-artifacts. That is why `commit` downloads it
        # with `path: apps/web/data`. Get it wrong and the files land beside the
        # tree, the change test sees the untouched checkout, and the run goes
        # GREEN having committed nothing, so `commit` asserts the placement.
        - uses: actions/upload-artifact@v7
          with:
            name: facts-artifacts
            path: |
              apps/web/data/country-facts.json
              apps/web/data/country-facts-report.md
            if-no-files-found: error
            retention-days: 1
```

- [ ] **Step 4: `refresh-cities.yml`, the `commit` job.** Replace the two downloads and the placement check with:

```yaml
      - uses: actions/download-artifact@v8
        with:
          name: city-artifacts
          # The artifact's root is apps/web/; see the upload note in `cities`.
          path: apps/web

      - uses: actions/download-artifact@v8
        with:
          name: facts-artifacts
          # apps/web/data/, not apps/web/; see the upload note in `facts`.
          path: apps/web/data

      - name: Check the ingest artifacts landed where the commit step looks
        run: |
          # Guards the one mistake that would be SILENT: an artifact whose root
          # was computed differently than assumed lands beside the tree instead
          # of on it, leaving the checked-out files in place, and every later
          # step then behaves perfectly on stale data. Since the move nothing
          # tracked lives in data/ or public/ at the repo root, so either one
          # existing is that fingerprint; so is a data file sitting loose in the
          # repo root or in apps/web/.
          for stray in data public \
                       country-facts.json country-facts-report.md cities-index.json cities-enrich-targets.json cities-report.md \
                       apps/web/country-facts.json apps/web/country-facts-report.md apps/web/cities-index.json \
                       apps/web/cities-enrich-targets.json apps/web/cities-report.md; do
            if [ -e "$stray" ]; then
              echo "::error::$stray exists after download — an artifact root moved; fix the download path"
              exit 1
            fi
          done
          for f in apps/web/public/cities/index.json apps/web/data/cities-index.json apps/web/data/cities-enrich-targets.json \
                   apps/web/data/cities-report.md apps/web/data/country-facts.json apps/web/data/country-facts-report.md; do
            [ -s "$f" ] || { echo "::error::missing or empty after download: $f"; exit 1; }
          done
          echo "Artifacts in place:"
          git status --porcelain -- apps/web/public/cities apps/web/data/ | head -20
```
Then, in the same job:
- `run: pnpm test` → `run: pnpm --filter @tsa/web test`;
- in the commit step, prefix the `CHANGED=` line's paths and the `git add` line with `apps/web/`:

```bash
          CHANGED="$(git status --porcelain -- apps/web/public/cities apps/web/data/cities-index.json apps/web/data/cities-enrich-targets.json apps/web/data/country-facts.json)"
```
```bash
          git add apps/web/public/cities apps/web/data/cities-index.json apps/web/data/cities-enrich-targets.json apps/web/data/cities-report.md apps/web/data/country-facts.json apps/web/data/country-facts-report.md
```

- [ ] **Step 5: `refresh-climate.yml`**
  - `Ingest climate normals` gains `working-directory: apps/web`, directly above its `run:` line. `scripts/climate/acquire.mjs` resolves its root from `import.meta.url`, and `CIP_CHELSA_CACHE` stays `/mnt/cip-chelsa`.
  - `run: pnpm test` → `run: pnpm --filter @tsa/web test`.
  - In the commit step:

```bash
          CHANGED="$(git status --porcelain -- apps/web/public/climate)"
```
```bash
          git add apps/web/public/climate apps/web/data/climate-report.md
```

- [ ] **Step 6: no root-relative path is left in a workflow command**

```powershell
Select-String -Path .github\workflows\*.yml -Pattern "run: node scripts/" -Context 1,0 | ForEach-Object { "$($_.Filename):$($_.LineNumber)  above: $($_.Context.PreContext)" }
Select-String -Path .github\workflows\*.yml -Pattern "git add (public|data)|git diff --quiet -- data|-- (public|data)/|path: (\.|data)$" | Select-Object Filename, LineNumber, Line
```
Expected:
- the first command lists five `run: node scripts/` lines (airports, cities, enrich, facts and climate), each with `working-directory: apps/web` as the line above;
- the second command prints only `refresh-climate.yml`'s header comment ("Commit condition: `git status --porcelain -- public/climate`"). Reword it to `apps/web/public/climate`; any other hit is a step still pointing at the old layout.

- [ ] **Step 7: commit and push, then open PR 2**

```powershell
git add .github/workflows
git commit -m "ci: run the web jobs and the data refreshes from apps/web" -m "The ingest scripts run with apps/web as their working directory. Both artifacts are restored to their new roots (apps/web and apps/web/data), and the placement check now treats any data/ or public/ at the repo root, or a data file loose in apps/web/, as the fingerprint of a moved root." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin chore/apps-web
gh pr create --base main --title "chore: move the web app into apps/web" --body "<summary; baseline vs branch counts; the eol check; the browser glance; note that the Vercel preview FAILS until Task 6 flips the Root Directory>"
```
Expected: CI's `test` and `e2e` go green. The Vercel preview fails, because the project's Root Directory is still `.`. Task 6 handles that.

---

### Task 6: Vercel cutover and merge (PR 2)

**Who:** the owner, with the controlling session. Every command that changes GitHub or Vercel state needs the owner's yes first.

- [ ] **Step 1: choose the window.** The scheduled refreshes start between about 12:30 and 17:30 UTC (20:30 to 01:30 SGT). Do the cutover outside that window, and disable them for its length (owner approves):

```powershell
gh workflow disable "Refresh cities"
gh workflow disable "Refresh airports"
```

- [ ] **Step 2 (owner): point Vercel at `apps/web`.** In the Vercel dashboard, open project `china-itinerary-planner`, then Settings, then Build and Deployment:
  - Root Directory = `apps/web`;
  - "Include files outside the root directory in the Build Step" = Enabled;
  - Install Command: leave it not overridden;
  - Save.

  From now until the merge, builds of `main` fail. Production keeps serving the last good deployment, and nothing pushes to `main` while the refreshes are disabled.

- [ ] **Step 3: rebuild the PR's preview and read it**

```powershell
vercel ls china-itinerary-planner -m githubCommitRef=chore/apps-web
$preview = "https://paste-the-branch-preview-url-here.vercel.app"
vercel redeploy $preview
vercel ls china-itinerary-planner -m githubCommitRef=chore/apps-web
$newPreview = "https://paste-the-NEW-preview-url-here.vercel.app"
vercel inspect $newPreview --logs
```
If the redeployed preview fails with the same error as before the Root Directory change, the redeploy reused the old settings. Push an empty commit instead (`git commit --allow-empty -m "chore: rebuild the preview with Root Directory apps/web"`, then `git push`) for a fresh build.
Expected in the log:
- the install runs at the repo root with pnpm 10.34.6;
- `Compiled successfully`;
- the deployment is Ready.

Then the owner opens the preview URL while signed in to Vercel, since preview URLs are SSO-protected. `/login` must render with the vendored fonts. Then:
```powershell
vercel logs $newPreview
```
Expected: no `Cannot find module` errors. Database errors from the dead Supabase project (`tenant/user not found`) are expected, the same as production today.

- [ ] **Step 4: if the preview fails and the fix is not quick,** the owner sets Root Directory back to `.` and re-enables the two workflows. `main` then deploys as before. Fix the PR and repeat from Step 1.

- [ ] **Step 5 (owner): merge PR 2**, rebase-merge.

```powershell
$pr = 0   # set to PR 2's number
gh pr view $pr --json state
vercel ls china-itinerary-planner --prod
```
Expected: `"state":"MERGED"`, and the newest production deployment, built from `apps/web`, is Ready.

- [ ] **Step 6: re-enable the refreshes and prove them on the new paths**

```powershell
gh workflow enable "Refresh cities"
gh workflow enable "Refresh airports"
gh workflow run "Refresh airports" --ref main
```
Wait about 20 seconds, because the new run takes a moment to register, then:
```powershell
gh run list --workflow "Refresh airports" --limit 1
gh run watch
git fetch; git log -1 --stat origin/main
```
Expected: the run goes green. It either prints `No change in the airport set` or commits a change touching only `apps/web/data/airports.json` and `airports-report.md`.

Then let the next scheduled `Refresh cities` run, or have the owner dispatch it. It must be green, and any commit it makes must touch only `apps/web/public/cities/**` and `apps/web/data/*`.

- [ ] **Step 7: delete the branch,** only after Step 5 printed `MERGED`:

```powershell
git switch main; git pull --ff-only
git branch -d chore/apps-web; git push origin --delete chore/apps-web
```

---

### Task 7: Workspace packages and the registry generator (PR 3)

**Files:**
- Create: `features/package.json`, `platform/package.json`
- Create: `tools/registry-gen/{package.json,tsconfig.json,vitest.config.mts,generate.mjs,generate.test.ts,cli.mjs}`
- Modify: `pnpm-workspace.yaml` (add packages and a catalog), the root `package.json` (`postinstall`, `typecheck`), `apps/web/package.json` (catalog versions, a `typecheck` script), `.gitignore`

**Interfaces:**
- Produces:
  - `buildRegistry(root: string): Record<string, string>`, mapping each repo-relative path to its content (pure);
  - `writeRegistry(root: string): { written: string[]; unchanged: string[] }`;
  - `identifier(name: string): string`;
  - the constants `FEATURE_PARTS = ['client','server','web','mobile']` and `PLATFORM_PARTS = ['server']`.
- Produces, as generated files (gitignored):
  - `features/_registry/manifests.ts`, which exports `manifests`, a `readonly` tuple of the features' default-exported manifests, sorted by folder name;
  - `features/_registry/{client,server,web,mobile}.ts`, which export `clientParts`, `serverParts`, `webParts` and `mobileParts`: objects keyed by feature folder name, whose values are the namespace imports of `<feature>/<part>/index.ts`;
  - `platform/_registry/server.ts`, which exports `serverParts` for platform modules.
- Produces the package entry points `@tsa/features/_registry/{manifests,client,server,web,mobile}` and `@tsa/platform/_registry/server`. They are named like their folders, so no module name can collide with them (decision D14). Only the apps may import them; Task 8's scan enforces that.

- [ ] **Step 1: branch**

```powershell
git switch main; git pull --ff-only
git switch -c feat/workspace-tools
```

- [ ] **Step 2: register the new packages and start the catalog.** `pnpm-workspace.yaml` becomes:

```yaml
packages:
  - apps/*
  - features
  - platform
  - tools/*

# Versions shared by more than one package. A package asks for one with
# "name": "catalog:". Expo's exact pins (react, react-native) join in PR 4.
catalog:
  "@types/node": ^26.2.0
  typescript: ^7.0.2
  vitest: ^4.1.11

# Dependency install scripts stay OFF unless a package is listed `true` here.
# better-sqlite3 ships prebuilt binaries (prebuilds/win32-x64.node, linux-x64)
# and this machine has no C++ toolchain, so the `node-gyp rebuild` npm used to
# infer for it must never run. `false` records that decision and silences the
# "ignored build scripts" warning.
allowBuilds:
  better-sqlite3: false
```
In `apps/web/package.json`, set `"@types/node"`, `"typescript"` and `"vitest"` to `"catalog:"`, and add a script: `"typecheck": "tsc --noEmit"`.

- [ ] **Step 3: the two layer packages.** They hold no code yet. Their `exports` maps are the public surface spec §0 describes: a feature is reached only by part, and `db/` is not exported from features, because drizzle-kit reads it by glob in phase 1.

`features/package.json`:
```json
{
  "name": "@tsa/features",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "exports": {
    "./_registry/manifests": "./_registry/manifests.ts",
    "./_registry/client": "./_registry/client.ts",
    "./_registry/server": "./_registry/server.ts",
    "./_registry/web": "./_registry/web.ts",
    "./_registry/mobile": "./_registry/mobile.ts",
    "./*/manifest": "./*/manifest.ts",
    "./*/core": "./*/core/index.ts",
    "./*/client": "./*/client/index.ts",
    "./*/server": "./*/server/index.ts",
    "./*/web": "./*/web/index.ts",
    "./*/mobile": "./*/mobile/index.ts"
  }
}
```
`platform/package.json`. Platform `db` is exported, because platform tables are the foreign-key targets that feature tables may use:
```json
{
  "name": "@tsa/platform",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "exports": {
    "./_registry/server": "./_registry/server.ts",
    "./*/core": "./*/core/index.ts",
    "./*/client": "./*/client/index.ts",
    "./*/server": "./*/server/index.ts",
    "./*/db": "./*/db/index.ts",
    "./*/web": "./*/web/index.ts",
    "./*/mobile": "./*/mobile/index.ts"
  }
}
```

- [ ] **Step 4: the generator's package scaffolding**

`tools/registry-gen/package.json`:
```json
{
  "name": "@tsa/registry-gen",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```
`tools/registry-gen/tsconfig.json`. `checkJs` holds the JSDoc types in `generate.mjs` to account:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "allowJs": true,
    "checkJs": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["*.mjs", "*.ts"]
}
```
`tools/registry-gen/vitest.config.mts`:
```ts
import { defineConfig } from "vitest/config";

// Its own config on purpose: without one, Vitest walks up and picks up another package's.
export default defineConfig({ test: { include: ["*.test.ts"], environment: "node" } });
```
Then install so the new packages link:
```powershell
pnpm install
```

- [ ] **Step 5: write the failing test** `tools/registry-gen/generate.test.ts`:

```ts
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildRegistry, identifier, writeRegistry } from "./generate.mjs";

let root: string;
const touch = (rel: string, content = "export {};\n") => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
};
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "registry-gen-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const HEADER = "// GENERATED by tools/registry-gen. Do not edit: `pnpm install` rewrites it.\n";

describe("buildRegistry", () => {
  it("writes empty registries when there are no features or platform modules", () => {
    const files = buildRegistry(root);
    expect(Object.keys(files).sort()).toEqual([
      "features/_registry/client.ts",
      "features/_registry/manifests.ts",
      "features/_registry/mobile.ts",
      "features/_registry/server.ts",
      "features/_registry/web.ts",
      "platform/_registry/server.ts",
    ]);
    expect(files["features/_registry/manifests.ts"]).toBe(`${HEADER}\nexport const manifests = [] as const;\n`);
    expect(files["features/_registry/web.ts"]).toBe(`${HEADER}\nexport const webParts = {\n} as const;\n`);
  });

  it("imports each feature's manifest and only the parts it has, in name order", () => {
    touch("features/packing-list/manifest.ts");
    touch("features/packing-list/mobile/index.ts");
    touch("features/money/manifest.ts");
    touch("features/money/server/index.ts");
    touch("features/money/web/index.ts");
    const files = buildRegistry(root);
    expect(files["features/_registry/manifests.ts"]).toBe(
      `${HEADER}import money from '../money/manifest';\nimport packingList from '../packing-list/manifest';\n\nexport const manifests = [money, packingList] as const;\n`,
    );
    expect(files["features/_registry/server.ts"]).toBe(
      `${HEADER}import * as money from '../money/server/index';\n\nexport const serverParts = {\n  'money': money,\n} as const;\n`,
    );
    expect(files["features/_registry/mobile.ts"]).toBe(
      `${HEADER}import * as packingList from '../packing-list/mobile/index';\n\nexport const mobileParts = {\n  'packing-list': packingList,\n} as const;\n`,
    );
    expect(files["features/_registry/client.ts"]).toBe(`${HEADER}\nexport const clientParts = {\n} as const;\n`);
  });

  it("registers platform modules' server parts", () => {
    touch("platform/sync/server/index.ts");
    touch("platform/identity/core/index.ts");
    expect(buildRegistry(root)["platform/_registry/server.ts"]).toBe(
      `${HEADER}import * as sync from '../sync/server/index';\n\nexport const serverParts = {\n  'sync': sync,\n} as const;\n`,
    );
  });

  it("skips _registry, _template, dot-folders and node_modules", () => {
    touch("features/_template/manifest.ts");
    touch("features/_registry/manifests.ts");
    touch("features/.cache/manifest.ts");
    touch("features/node_modules/x/manifest.ts");
    expect(buildRegistry(root)["features/_registry/manifests.ts"]).toBe(`${HEADER}\nexport const manifests = [] as const;\n`);
  });

  it("refuses a feature folder without a manifest", () => {
    touch("features/money/server/index.ts");
    expect(() => buildRegistry(root)).toThrow("features/money has no manifest.ts");
  });

  it("refuses a module name that cannot become an import", () => {
    touch("features/Money/manifest.ts");
    expect(() => buildRegistry(root)).toThrow('"Money" is not a valid module name');
  });
});

describe("writeRegistry", () => {
  it("writes every file once, then leaves unchanged files untouched", () => {
    touch("features/money/manifest.ts");
    const first = writeRegistry(root);
    expect(first.written).toHaveLength(6);
    const manifests = join(root, "features/_registry/manifests.ts");
    const before = statSync(manifests).mtimeMs;
    const second = writeRegistry(root);
    expect(second.written).toEqual([]);
    expect(second.unchanged).toHaveLength(6);
    expect(statSync(manifests).mtimeMs).toBe(before);
    expect(readFileSync(manifests, "utf8")).toContain("import money from '../money/manifest';");
  });
});

describe("identifier", () => {
  it.each([
    ["money", "money"],
    ["packing-list", "packingList"],
    ["x-2-y", "x2Y"],
  ])("%s → %s", (name, id) => {
    expect(identifier(name)).toBe(id);
  });
});
```

- [ ] **Step 6: run it to see it fail**

```powershell
pnpm --filter @tsa/registry-gen test
```
Expected: FAIL, with `Failed to load url ./generate.mjs` or `Cannot find module`.

- [ ] **Step 7: write the generator** `tools/registry-gen/generate.mjs`:

```js
/**
 * The registry generator (spec §0 "Registry"). Metro cannot run import.meta.glob,
 * so the list of features is written out as plain imports that both apps (the
 * composition roots) read. The output is gitignored and rebuilt on every install,
 * so parallel branches never conflict on it.
 *
 * Node built-ins only: this runs in postinstall on this machine, in CI, on Vercel
 * and on EAS, before any dependency is guaranteed to be usable.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The parts a feature can contribute, each through `<part>/index.ts`. */
export const FEATURE_PARTS = ['client', 'server', 'web', 'mobile'];
/** Platform modules register only their server part (commands and pulls). */
export const PLATFORM_PARTS = ['server'];
const NAME = /^[a-z][a-z0-9-]*$/;
const HEADER = '// GENERATED by tools/registry-gen. Do not edit: `pnpm install` rewrites it.\n';

/**
 * Every generated file, as repo-relative path → content. Pure: reads the tree, writes nothing.
 * @param {string} root absolute repo root
 * @returns {Record<string, string>}
 */
export function buildRegistry(root) {
  const features = listModules(join(root, 'features'));
  for (const name of features) {
    if (!existsSync(join(root, 'features', name, 'manifest.ts'))) {
      throw new Error(`features/${name} has no manifest.ts — every feature folder needs one (copy features/_template)`);
    }
  }
  const platform = listModules(join(root, 'platform'));

  /** @type {Record<string, string>} */
  const files = {};
  files['features/_registry/manifests.ts'] = listFile(features.map((name) => ({ name, from: `../${name}/manifest` })));
  for (const part of FEATURE_PARTS) {
    const present = features.filter((name) => existsSync(join(root, 'features', name, part, 'index.ts')));
    files[`features/_registry/${part}.ts`] = mapFile(present.map((name) => ({ name, from: `../${name}/${part}/index` })), part);
  }
  for (const part of PLATFORM_PARTS) {
    const present = platform.filter((name) => existsSync(join(root, 'platform', name, part, 'index.ts')));
    files[`platform/_registry/${part}.ts`] = mapFile(present.map((name) => ({ name, from: `../${name}/${part}/index` })), part);
  }
  return files;
}

/**
 * Write the registry, touching only files whose content changed (so watchers stay quiet).
 * @param {string} root absolute repo root
 * @returns {{ written: string[], unchanged: string[] }}
 */
export function writeRegistry(root) {
  const written = [];
  const unchanged = [];
  for (const [rel, content] of Object.entries(buildRegistry(root))) {
    const path = join(root, rel);
    if (existsSync(path) && readFileSync(path, 'utf8') === content) {
      unchanged.push(rel);
      continue;
    }
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
    written.push(rel);
  }
  return { written, unchanged };
}

/** @typedef {{ name: string, from: string }} Entry */

/**
 * Module folders under a layer, sorted; `_registry`, `_template` and dot-folders are not modules.
 * @param {string} dir
 * @returns {string[]}
 */
function listModules(dir) {
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .map((entry) => entry.name)
    .sort();
  for (const name of names) {
    if (!NAME.test(name)) throw new Error(`"${name}" is not a valid module name: use lowercase letters, digits and dashes`);
  }
  return names;
}

/**
 * "packing-list" → "packingList": a safe identifier for a module name that passed NAME.
 * @param {string} name
 * @returns {string}
 */
export function identifier(name) {
  return name.replace(/-([a-z0-9])/g, (_match, /** @type {string} */ c) => c.toUpperCase());
}

/**
 * @param {Entry[]} entries
 * @returns {string}
 */
function listFile(entries) {
  const imports = entries.map((e) => `import ${identifier(e.name)} from '${e.from}';\n`).join('');
  const list = entries.map((e) => identifier(e.name)).join(', ');
  return `${HEADER}${imports}\nexport const manifests = [${list}] as const;\n`;
}

/**
 * @param {Entry[]} entries
 * @param {string} part
 * @returns {string}
 */
function mapFile(entries, part) {
  const imports = entries.map((e) => `import * as ${identifier(e.name)} from '${e.from}';\n`).join('');
  const body = entries.map((e) => `  '${e.name}': ${identifier(e.name)},\n`).join('');
  return `${HEADER}${imports}\nexport const ${part}Parts = {\n${body}} as const;\n`;
}
```

- [ ] **Step 8: run the tests and the type-check**

```powershell
pnpm --filter @tsa/registry-gen test
pnpm --filter @tsa/registry-gen typecheck
```
Expected: `Tests 10 passed (10)`, and `tsc` exits 0.

- [ ] **Step 9: the command-line entry point** `tools/registry-gen/cli.mjs`:

```js
/**
 * The root postinstall's entry point: writes the generated registries for this
 * checkout. Plain Node with built-ins only, so it runs before anything else
 * installed is known to work (this machine, CI, Vercel, EAS).
 */
import { fileURLToPath } from 'node:url';
import { writeRegistry } from './generate.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const { written } = writeRegistry(root);
for (const rel of written) console.log(`registry-gen: wrote ${rel}`);
```
In the root `package.json`, add these two scripts:
```json
    "postinstall": "node tools/registry-gen/cli.mjs",
    "typecheck": "pnpm -r typecheck",
```

- [ ] **Step 10: keep the output out of git**, and prove the postinstall writes it once. Add to `.gitignore`:

```gitignore
# Written by tools/registry-gen on every install (spec §0 "Registry"); never committed,
# so parallel feature branches never conflict on it.
/features/_registry/
/platform/_registry/
```
```powershell
pnpm install
pnpm install
git status --short
```
Expected:
- the first `pnpm install` prints six lines of the form `. postinstall: registry-gen: wrote ...`: five under `features/_registry/` and `platform/_registry/server.ts`;
- the second runs the postinstall again but prints no `wrote` line, because the content is unchanged and no file is rewritten. pnpm reruns the root `postinstall` on every install, even `--frozen-lockfile` and "Already up to date"; checked on pnpm 10.33.2, 2026-09-30;
- `git status` shows no `_registry` path.

- [ ] **Step 11: the web app is untouched**

```powershell
pnpm --filter @tsa/web why vitest
pnpm typecheck
pnpm test
```
Expected:
- vitest is still 4.1.11 in `@tsa/web`, since the catalog range equals the old one;
- `pnpm typecheck` passes for `@tsa/web` and `@tsa/registry-gen`;
- `pnpm test` shows the web suite at `Tests T passed`, exactly the baseline, plus `@tsa/registry-gen` at 10.

- [ ] **Step 12: commit**

```powershell
git add pnpm-workspace.yaml pnpm-lock.yaml package.json apps/web/package.json .gitignore features/package.json platform/package.json tools/registry-gen
git commit -m "feat: add the features and platform packages and the registry generator" -m "Metro cannot run import.meta.glob, so the list of features is generated as plain imports into gitignored files that only the apps read (spec §0). The root postinstall writes them, and rewrites nothing when nothing changed. The catalog starts with the versions the web app and the tools share." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The boundary scan (PR 3)

**Files:**
- Create: `tools/boundaries/{package.json,tsconfig.json,vitest.config.mts}`
- Create: `tools/boundaries/src/{imports,zones,rules,scan}.ts` and their tests `{imports,zones,rules,scan}.test.ts`
- Create: `tools/boundaries/src/repo.test.ts`, the scan of this repo
- Modify: `.github/workflows/ci.yml` (the `test` job's type-check line)

**Interfaces:**
- Produces:
  - `collectImports(filename: string, source: string): { imports: ImportRef[]; errors: string[] }`, where `ImportRef` is `{ specifier: string | null; kind: "import"|"export"|"dynamic"|"require"|"import-equals"|"require-context"|"dynamic-unknown"; typeOnly: boolean; line: number }`;
  - `classify(rel: string): Zone | null`, where `Zone` is `{ layer: "feature"|"platform"|"reference"|"app"; owner: string; part: Part | null }` and `Part` is `"manifest"|"core"|"client"|"server"|"db"|"web"|"mobile"|"test"|"registry"`;
  - `TEST_FILE: RegExp`;
  - `checkEdge(from: Zone, to: Target): string | null`, where `Target` is a zone, an unzoned repo file, an npm package or a Node built-in;
  - `scanRepo(options: { root: string; scanRoots?: string[]; tsconfigs?: Record<string, string> }): { violations: Violation[]; scannedFiles: string[] }`, where `Violation` is `{ file; line; specifier; reason }`;
  - `packageName(specifier: string): string | null`;
  - `SCAN_ROOTS = ["apps/web", "apps/mobile/src", "features", "platform", "reference"]`.
- Task 10 adds an `apps/mobile` assertion to `repo.test.ts`. The mobile app uses no path alias, so it needs no tsconfig entry.

**What the rules say.** This is spec §0's zone table, with the interpretations it left open written down:
- A part may import only the parts its row lists: core imports core; client imports core and client; server imports core, server and its **own** db; db imports core, its own db and platform db (the foreign-key targets); web imports core, client and web; mobile imports core, client and mobile.
- Features never import each other, the platform never imports a feature, and reference imports only reference.
- Only the apps import the generated registry, and the generated files may import any feature or platform part, since that is their job. `apps/web` may import web, client, core and server parts, because routes are one-line re-exports and API routes re-export server handlers. `apps/mobile` may import mobile, client and core parts.
- Package bans follow the "Never" column. `core` and `client` may not use Node built-ins, and neither may `mobile`, since React Native has none. `server`, `db`, `web` and `apps/web` may.
- Test files are unrestricted within the ownership rules. Only test files may use a computed `import()` or `require()`: the one computed import in today's app is `lib/tokens.test.ts:194`.
- `require.context` is refused everywhere, because it bypasses the registry.
- Type-only imports count the same as value imports, which keeps it simple.
- Outside packages are judged by name and never resolved. The workspace's own packages, relative paths and the `@/` alias are resolved to real files, and a specifier that does not resolve, such as a subpath missing from an `exports` map, is a violation. That also catches Metro, which would silently fall back to a file path.

- [ ] **Step 1: scaffolding**

`tools/boundaries/package.json`. oxc-parser ships a new 0.x almost weekly, so both oxc packages are pinned exactly:
```json
{
  "name": "@tsa/boundaries",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "oxc-parser": "0.152.0",
    "oxc-resolver": "11.24.2",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```
`tools/boundaries/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "jsx": "preserve",
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*.ts"]
}
```
`tools/boundaries/vitest.config.mts`:
```ts
import { defineConfig } from "vitest/config";

// Its own config on purpose: without one, Vitest walks up and picks up another package's.
export default defineConfig({ test: { include: ["src/**/*.test.ts"], environment: "node" } });
```
```powershell
pnpm install
```
Expected: pnpm installs oxc-parser and oxc-resolver with their prebuilt Windows binaries, which come as optional platform packages with no build script, so there is no `Ignored build scripts` line.

- [ ] **Step 2: failing test for the import collector** `tools/boundaries/src/imports.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { collectImports } from "./imports";

const SOURCE = [
  'import { a } from "./a";', //                       1
  'import type { T } from "types-only";', //            2
  'import { type B, c } from "./mixed";', //            3
  'import "./side-effect";', //                         4
  'export { d } from "./d";', //                        5
  'export type { E } from "./e";', //                   6
  'export * from "./star";', //                         7
  'const lazy = await import("./lazy");', //            8
  "const tpl = await import(`./tpl`);", //              9
  "const bad = await import(`./x/${name}`);", //       10
  "const v = await import(someVar);", //               11
  'const r = require("./req");', //                    12
  'import eq = require("./equals");', //               13
  'const ctx = require.context("./dir", true);', //    14
  "const el = <div>{a}</div>;", //                     15
  "export const local = 1;", //                        16
].join("\n");

describe("collectImports", () => {
  const { imports, errors } = collectImports("fixture.tsx", SOURCE);
  const by = (specifier: string | null, kind?: string) =>
    imports.filter((i) => i.specifier === specifier && (kind === undefined || i.kind === kind));

  it("parses the fixture without errors", () => {
    expect(errors).toEqual([]);
  });

  it("reports static imports with their line and type-only flag", () => {
    expect(by("./a")).toEqual([{ specifier: "./a", kind: "import", typeOnly: false, line: 1 }]);
    expect(by("types-only")).toEqual([{ specifier: "types-only", kind: "import", typeOnly: true, line: 2 }]);
  });

  it("treats an import with any value binding as a value import", () => {
    expect(by("./mixed")[0].typeOnly).toBe(false);
  });

  it("reports side-effect imports as value imports", () => {
    expect(by("./side-effect")).toEqual([{ specifier: "./side-effect", kind: "import", typeOnly: false, line: 4 }]);
  });

  it("reports re-exports, including export * and export type", () => {
    expect(by("./d", "export")[0].line).toBe(5);
    expect(by("./e", "export")[0].typeOnly).toBe(true);
    expect(by("./star", "export")[0].line).toBe(7);
  });

  it("does not report local exports", () => {
    expect(imports.filter((i) => i.line === 16)).toEqual([]);
  });

  it("reads literal dynamic imports, including substitution-free templates", () => {
    expect(by("./lazy", "dynamic")[0].line).toBe(8);
    expect(by("./tpl", "dynamic")[0].line).toBe(9);
  });

  it("marks dynamic imports it cannot read as unknown", () => {
    const unknown = imports.filter((i) => i.kind === "dynamic-unknown").map((i) => i.line);
    expect(unknown).toEqual([10, 11]);
  });

  it("finds require, import-equals and require.context by walking the AST", () => {
    expect(by("./req", "require")[0].line).toBe(12);
    expect(by("./equals", "import-equals")[0].line).toBe(13);
    expect(by("./dir", "require-context")[0].line).toBe(14);
  });

  it("counts every reference exactly once", () => {
    expect(imports).toHaveLength(14);
  });

  it("returns parse errors instead of throwing", () => {
    const broken = collectImports("broken.ts", 'import { from "x"');
    expect(broken.errors.length).toBeGreaterThan(0);
  });
});
```

```powershell
pnpm --filter @tsa/boundaries exec vitest run src/imports.test.ts
```
Expected: FAIL (`Cannot find module './imports'`).

- [ ] **Step 3: the collector** `tools/boundaries/src/imports.ts`. oxc's module record reports static imports, re-exports and dynamic imports. It does not report `require()`, `require.context()` or TypeScript's `import x = require()`, so the AST walk finds those three.

```ts
import { parseSync } from "oxc-parser";

/** How a file refers to another module. */
export type ImportKind =
  | "import" // import … from "x" / import "x"
  | "export" // export … from "x" / export * from "x"
  | "dynamic" // import("x")
  | "require" // require("x")
  | "import-equals" // import x = require("x")  (TypeScript; oxc's module record leaves it out)
  | "require-context" // require.context("./dir")  (Metro; bypasses the registry)
  | "dynamic-unknown"; // import(someVariable) — cannot be checked

export interface ImportRef {
  specifier: string | null; // null only for "dynamic-unknown"
  kind: ImportKind;
  typeOnly: boolean;
  line: number;
}

export interface ParsedImports {
  imports: ImportRef[];
  errors: string[];
}

/** Every module reference in one file, including the forms oxc's module record does not report. */
export function collectImports(filename: string, source: string): ParsedImports {
  const result = parseSync(filename, source);
  const lineOf = lineIndex(source);
  const imports: ImportRef[] = [];

  for (const stmt of result.module.staticImports) {
    const typeOnly = stmt.entries.length > 0 && stmt.entries.every((e) => e.isType);
    imports.push({ specifier: stmt.moduleRequest.value, kind: "import", typeOnly, line: lineOf(stmt.moduleRequest.start) });
  }
  for (const stmt of result.module.staticExports) {
    const fromEntries = stmt.entries.filter((e) => e.moduleRequest);
    if (fromEntries.length === 0) continue;
    const request = fromEntries[0].moduleRequest!;
    const typeOnly = fromEntries.every((e) => e.isType);
    imports.push({ specifier: request.value, kind: "export", typeOnly, line: lineOf(request.start) });
  }
  for (const dyn of result.module.dynamicImports) {
    const text = source.slice(dyn.moduleRequest.start, dyn.moduleRequest.end);
    const literal = stringLiteral(text);
    imports.push(
      literal === null
        ? { specifier: null, kind: "dynamic-unknown", typeOnly: false, line: lineOf(dyn.start) }
        : { specifier: literal, kind: "dynamic", typeOnly: false, line: lineOf(dyn.start) },
    );
  }
  walk(result.program, (node) => {
    if (node.type === "TSImportEqualsDeclaration" && node.moduleReference?.type === "TSExternalModuleReference") {
      imports.push({
        specifier: node.moduleReference.expression.value,
        kind: "import-equals",
        typeOnly: node.importKind === "type",
        line: lineOf(node.start),
      });
    }
    if (node.type !== "CallExpression") return;
    const callee = node.callee;
    const first = node.arguments?.[0];
    const literal = first?.type === "Literal" && typeof first.value === "string" ? first.value : null;
    if (callee?.type === "Identifier" && callee.name === "require") {
      imports.push({ specifier: literal, kind: literal === null ? "dynamic-unknown" : "require", typeOnly: false, line: lineOf(node.start) });
    }
    if (
      callee?.type === "MemberExpression" &&
      callee.object?.type === "Identifier" &&
      callee.object.name === "require" &&
      callee.property?.name === "context"
    ) {
      imports.push({ specifier: literal, kind: "require-context", typeOnly: false, line: lineOf(node.start) });
    }
  });

  return { imports, errors: result.errors.map((e) => e.message) };
}

/** "x" / 'x' / `x` (no substitutions) → x; anything else → null. */
function stringLiteral(text: string): string | null {
  const t = text.trim();
  const quote = t[0];
  if ((quote === '"' || quote === "'" || quote === "`") && t.at(-1) === quote && t.length >= 2) {
    const body = t.slice(1, -1);
    if (quote === "`" && body.includes("${")) return null;
    return body;
  }
  return null;
}

function lineIndex(source: string): (offset: number) => number {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source.charCodeAt(i) === 10) starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

// oxc's program is a plain ESTree-shaped object; walk every nested node.
// biome-ignore lint/suspicious/noExplicitAny: the AST is untyped JSON here.
function walk(node: any, visit: (n: any) => void): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (typeof node.type === "string") visit(node);
  for (const key in node) {
    if (key !== "parent") walk(node[key], visit);
  }
}
```

```powershell
pnpm --filter @tsa/boundaries exec vitest run src/imports.test.ts
```
Expected: `Tests 11 passed (11)`.

- [ ] **Step 4: failing test for zones** `tools/boundaries/src/zones.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classify } from "./zones";

describe("classify", () => {
  it.each([
    ["features/money/core/split.ts", { layer: "feature", owner: "money", part: "core" }],
    ["features/money/client/useLedger.ts", { layer: "feature", owner: "money", part: "client" }],
    ["features/money/server/commands.ts", { layer: "feature", owner: "money", part: "server" }],
    ["features/money/db/schema.ts", { layer: "feature", owner: "money", part: "db" }],
    ["features/money/web/Home.tsx", { layer: "feature", owner: "money", part: "web" }],
    ["features/money/mobile/Home.tsx", { layer: "feature", owner: "money", part: "mobile" }],
    ["features/money/manifest.ts", { layer: "feature", owner: "money", part: "manifest" }],
    ["features/money/tests/fixtures.ts", { layer: "feature", owner: "money", part: "test" }],
    ["features/money/core/split.test.ts", { layer: "feature", owner: "money", part: "test" }],
    ["features/_registry/web.ts", { layer: "feature", owner: "_registry", part: "registry" }],
    ["platform/sync/core/protocol.ts", { layer: "platform", owner: "sync", part: "core" }],
    ["platform/_registry/server.ts", { layer: "platform", owner: "_registry", part: "registry" }],
    ["reference/countries/core/facts.ts", { layer: "reference", owner: "countries", part: "core" }],
    ["apps/web/lib/itinerary.ts", { layer: "app", owner: "web", part: null }],
    ["apps/mobile/src/app/index.tsx", { layer: "app", owner: "mobile", part: null }],
  ])("%s", (rel, zone) => {
    expect(classify(rel)).toEqual(zone);
  });

  it("gives a layered file outside a part folder no part, so the scan can report it", () => {
    expect(classify("features/money/utils.ts")).toEqual({ layer: "feature", owner: "money", part: null });
    expect(classify("platform/sync/helpers/x.ts")).toEqual({ layer: "platform", owner: "sync", part: null });
  });

  it("treats manifest.ts as the manifest only at a feature's root", () => {
    expect(classify("features/money/core/manifest.ts")?.part).toBe("core");
    expect(classify("platform/sync/manifest.ts")?.part).toBe(null);
  });

  it.each(["package.json", "docs/x.md", "tools/boundaries/src/scan.ts", "features/package.json", "platform/vitest.config.ts"])(
    "leaves %s ungoverned",
    (rel) => {
      expect(classify(rel)).toBeNull();
    },
  );
});
```

```powershell
pnpm --filter @tsa/boundaries exec vitest run src/zones.test.ts
```
Expected: FAIL (`Cannot find module './zones'`).

- [ ] **Step 5: zones** `tools/boundaries/src/zones.ts`:

```ts
/** Where a file sits in the monorepo (spec §0 "Feature zones"). */
export type Layer = "feature" | "platform" | "reference" | "app";
export type Part = "manifest" | "core" | "client" | "server" | "db" | "web" | "mobile" | "test" | "registry";

export interface Zone {
  layer: Layer;
  /** feature or module name ("money", "sync", "countries"), or the app name ("web", "mobile") */
  owner: string;
  /** null for app files and for layered files outside a known part folder */
  part: Part | null;
}

const LAYERS: Record<string, Layer> = { features: "feature", platform: "platform", reference: "reference" };
const PART_DIRS = new Set<Part>(["core", "client", "server", "db", "web", "mobile"]);
const TEST_DIRS = new Set(["tests", "e2e"]);
export const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/**
 * Classify a repo-relative POSIX path. Returns null for files the boundary rules
 * do not govern: repo-root files, tools/, docs/, and a layer package's own config
 * files (features/package.json, platform/vitest.config.ts …).
 */
export function classify(rel: string): Zone | null {
  const seg = rel.split("/");
  if (seg[0] === "apps" && seg.length >= 3) return { layer: "app", owner: seg[1], part: null };
  const layer = LAYERS[seg[0]];
  if (layer === undefined || seg.length < 3) return null;
  const owner = seg[1];
  if (owner === "_registry") return { layer, owner, part: "registry" };
  if (TEST_FILE.test(rel) || TEST_DIRS.has(seg[2])) return { layer, owner, part: "test" };
  if (layer === "feature" && seg.length === 3 && /^manifest\.[cm]?[jt]s$/.test(seg[2])) {
    return { layer, owner, part: "manifest" };
  }
  const part = seg[2] as Part;
  return { layer, owner, part: PART_DIRS.has(part) ? part : null };
}
```

```powershell
pnpm --filter @tsa/boundaries exec vitest run src/zones.test.ts
```
Expected: `Tests 22 passed (22)`.

- [ ] **Step 6: failing test for the rules** `tools/boundaries/src/rules.test.ts`. Every rule has one case it must refuse and a neighbouring case it must allow. Before this plan was written, each rule line was deleted or inverted in turn, and at least one row went red every time. Three rules that no row could isolate turned out to be redundant with the part table and were removed. The "generated registry → feature part" row was added after Fable's review of this plan, which caught that the ownership rule would otherwise flag the generated registry.

```ts
import { describe, expect, it } from "vitest";
import { checkEdge, type Target } from "./rules";
import type { Layer, Part, Zone } from "./zones";

const z = (layer: Layer, owner: string, part: Part | null): Zone => ({ layer, owner, part });
const to = (layer: Layer, owner: string, part: Part | null): Target => ({ kind: "zone", zone: z(layer, owner, part) });
const pkg = (name: string): Target => ({ kind: "package", name });
const builtin = (name: string): Target => ({ kind: "builtin", name });

const moneyCore = z("feature", "money", "core");
const moneyClient = z("feature", "money", "client");
const moneyServer = z("feature", "money", "server");
const moneyDb = z("feature", "money", "db");
const moneyWeb = z("feature", "money", "web");
const moneyMobile = z("feature", "money", "mobile");
const moneyManifest = z("feature", "money", "manifest");
const moneyTest = z("feature", "money", "test");
const syncCore = z("platform", "sync", "core");
const syncDb = z("platform", "sync", "db");
const countriesCore = z("reference", "countries", "core");
const web = z("app", "web", null);
const mobile = z("app", "mobile", null);

// Every rule has a case it must refuse and a neighbouring case it must allow,
// so deleting or inverting any one line of rules.ts turns at least one row red.
describe("checkEdge: ownership", () => {
  it.each<[string, Zone, Target, boolean]>([
    ["feature → other feature", moneyCore, to("feature", "polls", "core"), false],
    ["feature → own feature", moneyClient, to("feature", "money", "core"), true],
    ["feature test → other feature", moneyTest, to("feature", "polls", "core"), false],
    ["platform → feature", syncCore, to("feature", "money", "core"), false],
    ["platform → platform", syncCore, to("platform", "identity", "core"), true],
    ["platform → reference", syncCore, to("reference", "countries", "core"), true],
    ["reference → platform", countriesCore, to("platform", "sync", "core"), false],
    ["reference → reference", countriesCore, to("reference", "cities", "core"), true],
    ["feature → app", moneyWeb, to("app", "web", null), false],
    ["app → other app", web, to("app", "mobile", null), false],
    ["app → itself", web, to("app", "web", null), true],
  ])("%s", (_name, from, target, ok) => {
    expect(checkEdge(from, target) === null).toBe(ok);
  });
});

describe("checkEdge: parts", () => {
  it.each<[string, Zone, Target, boolean]>([
    ["core → core", moneyCore, to("platform", "sync", "core"), true],
    ["core → client", moneyCore, to("feature", "money", "client"), false],
    ["client → client", moneyClient, to("platform", "sync", "client"), true],
    ["client → server", moneyClient, to("feature", "money", "server"), false],
    ["server → own db", moneyServer, to("feature", "money", "db"), true],
    ["server → platform db", moneyServer, to("platform", "sync", "db"), false],
    ["server → platform server", moneyServer, to("platform", "sync", "server"), true],
    ["server → web", moneyServer, to("feature", "money", "web"), false],
    ["db → platform db (FK target)", moneyDb, to("platform", "identity", "db"), true],
    ["db → server", moneyDb, to("feature", "money", "server"), false],
    ["platform db → other platform db", syncDb, to("platform", "identity", "db"), true],
    ["web → client", moneyWeb, to("feature", "money", "client"), true],
    ["web → mobile", moneyWeb, to("feature", "money", "mobile"), false],
    ["web → server", moneyWeb, to("feature", "money", "server"), false],
    ["mobile → mobile", moneyMobile, to("platform", "shell", "mobile"), true],
    ["mobile → web", moneyMobile, to("feature", "money", "web"), false],
    ["manifest → registry types", moneyManifest, to("platform", "registry", "core"), true],
    ["manifest → other core", moneyManifest, to("platform", "sync", "core"), false],
    ["core → manifest", moneyCore, to("feature", "money", "manifest"), false],
    ["core → test helper", moneyCore, to("feature", "money", "test"), false],
    ["test → test helper", moneyTest, to("feature", "money", "test"), true],
    ["test → own server", moneyTest, to("feature", "money", "server"), true],
    ["core → stray file", moneyCore, to("feature", "money", null), false],
    ["core → unzoned repo file", moneyCore, { kind: "unzoned", rel: "tools/x.ts" }, false],
  ])("%s", (_name, from, target, ok) => {
    expect(checkEdge(from, target) === null).toBe(ok);
  });
});

describe("checkEdge: registry and apps", () => {
  it.each<[string, Zone, Target, boolean]>([
    ["web app → registry", web, to("feature", "_registry", "registry"), true],
    ["mobile app → registry", mobile, to("platform", "_registry", "registry"), true],
    ["feature → registry", moneyServer, to("feature", "_registry", "registry"), false],
    ["platform → registry", syncCore, to("feature", "_registry", "registry"), false],
    ["feature test → registry", moneyTest, to("platform", "_registry", "registry"), false],
    ["generated registry → feature part", z("feature", "_registry", "registry"), to("feature", "money", "server"), true],
    ["web app → feature web", web, to("feature", "money", "web"), true],
    ["web app → feature server", web, to("feature", "money", "server"), true],
    ["web app → feature mobile", web, to("feature", "money", "mobile"), false],
    ["web app → feature db", web, to("feature", "money", "db"), false],
    ["mobile app → feature mobile", mobile, to("feature", "money", "mobile"), true],
    ["mobile app → feature server", mobile, to("feature", "money", "server"), false],
    ["mobile app → feature web", mobile, to("feature", "money", "web"), false],
    ["app → manifest", web, to("feature", "money", "manifest"), false],
  ])("%s", (_name, from, target, ok) => {
    expect(checkEdge(from, target) === null).toBe(ok);
  });
});

describe("checkEdge: packages", () => {
  it.each<[string, Zone, Target, boolean]>([
    ["core → zod", moneyCore, pkg("zod"), true],
    ["core → react", moneyCore, pkg("react"), false],
    ["core → drizzle-orm", moneyCore, pkg("drizzle-orm"), false],
    ["core → next", moneyCore, pkg("next"), false],
    ["core → node:fs", moneyCore, builtin("node:fs"), false],
    ["client → react", moneyClient, pkg("react"), true],
    ["client → node:fs", moneyClient, builtin("node:fs"), false],
    ["client → react-dom", moneyClient, pkg("react-dom"), false],
    ["client → react-native", moneyClient, pkg("react-native"), false],
    ["client → expo-sqlite", moneyClient, pkg("expo-sqlite"), false],
    ["client → @react-native-community/netinfo", moneyClient, pkg("@react-native-community/netinfo"), false],
    ["core → @react-native/assets-registry", moneyCore, pkg("@react-native/assets-registry"), false],
    ["core → @next/env", moneyCore, pkg("@next/env"), false],
    ["core → expo", moneyCore, pkg("expo"), false],
    ["server → drizzle-orm", moneyServer, pkg("drizzle-orm"), true],
    ["server → node:crypto", moneyServer, builtin("node:crypto"), true],
    ["server → react", moneyServer, pkg("react"), false],
    ["db → drizzle-orm", moneyDb, pkg("drizzle-orm"), true],
    ["db → next", moneyDb, pkg("next"), false],
    ["web → next", moneyWeb, pkg("next"), true],
    ["web → react-dom", moneyWeb, pkg("react-dom"), true],
    ["web → @expo/vector-icons", moneyWeb, pkg("@expo/vector-icons"), false],
    ["web → drizzle-orm", moneyWeb, pkg("drizzle-orm"), false],
    ["web → react-native-reanimated", moneyWeb, pkg("react-native-reanimated"), false],
    ["mobile → expo-router", moneyMobile, pkg("expo-router"), true],
    ["mobile → react-native-svg", moneyMobile, pkg("react-native-svg"), true],
    ["mobile → react-dom", moneyMobile, pkg("react-dom"), false],
    ["mobile → next", moneyMobile, pkg("next"), false],
    ["mobile → node:path", moneyMobile, builtin("node:path"), false],
    ["manifest → any package", moneyManifest, pkg("zod"), false],
    ["test → anything", moneyTest, pkg("react-dom"), true],
    ["web app → d3-geo", web, pkg("d3-geo"), true],
    ["web app → react-native", web, pkg("react-native"), false],
    ["mobile app → expo", mobile, pkg("expo"), true],
    ["mobile app → next", mobile, pkg("next"), false],
    ["web app → node:fs", web, builtin("node:fs"), true],
    ["mobile app → node:fs", mobile, builtin("node:fs"), false],
  ])("%s", (_name, from, target, ok) => {
    expect(checkEdge(from, target) === null).toBe(ok);
  });
});
```

```powershell
pnpm --filter @tsa/boundaries exec vitest run src/rules.test.ts
```
Expected: FAIL (`Cannot find module './rules'`).

- [ ] **Step 7: the rules** `tools/boundaries/src/rules.ts`:

```ts
import type { Part, Zone } from "./zones";

/** What an import points at, once resolved. */
export type Target =
  | { kind: "zone"; zone: Zone }
  | { kind: "unzoned"; rel: string } // inside the repo, but in no zone (a stray file, a tools/ script)
  | { kind: "package"; name: string } // an npm package outside the workspace
  | { kind: "builtin"; name: string }; // node:fs, fs, …

const isReact = (p: string) => p === "react";
const isReactDom = (p: string) => p === "react-dom";
const isReactNative = (p: string) =>
  p === "react-native" || p.startsWith("react-native-") || p.startsWith("@react-native/") || p.startsWith("@react-native-");
const isExpo = (p: string) => p === "expo" || p.startsWith("expo-") || p.startsWith("@expo/");
const isNext = (p: string) => p === "next" || p.startsWith("@next/");
const isDrizzle = (p: string) => p === "drizzle-orm";

interface PackageRule {
  banned: ((name: string) => boolean)[];
  builtins: boolean;
}

/** Packages each part may not use (spec §0's "Never" column). Tests and registries are unrestricted. */
const PACKAGE_RULES: Partial<Record<Part | "app:web" | "app:mobile", PackageRule>> = {
  core: { banned: [isReact, isReactDom, isReactNative, isExpo, isNext, isDrizzle], builtins: false },
  client: { banned: [isReactDom, isReactNative, isExpo, isNext, isDrizzle], builtins: false },
  server: { banned: [isReact, isReactDom, isReactNative, isExpo], builtins: true },
  db: { banned: [isReact, isReactDom, isReactNative, isExpo, isNext], builtins: true },
  web: { banned: [isReactNative, isExpo, isDrizzle], builtins: true },
  mobile: { banned: [isReactDom, isNext, isDrizzle], builtins: false },
  "app:web": { banned: [isReactNative, isExpo], builtins: true },
  "app:mobile": { banned: [isReactDom, isNext, isDrizzle], builtins: false },
};

/** Which parts each part may import, before the ownership rules narrow it (spec §0 "May import"). */
const PART_RULES: Record<Exclude<Part, "test" | "registry" | "manifest">, Part[]> = {
  core: ["core"],
  client: ["core", "client"],
  server: ["core", "server", "db"],
  db: ["core", "db"],
  web: ["core", "client", "web"],
  mobile: ["core", "client", "mobile"],
};

/** Parts each app may import directly (route files are one-line re-exports; spec §0). */
const APP_PARTS: Record<string, Part[]> = {
  web: ["core", "client", "server", "web", "registry"],
  mobile: ["core", "client", "mobile", "registry"],
};

/** Why `from` may not import `to`, or null when it may. */
export function checkEdge(from: Zone, to: Target): string | null {
  if (to.kind === "package" || to.kind === "builtin") return checkPackage(from, to);
  if (to.kind === "unzoned") return `imports ${to.rel}, which is in no zone`;
  return checkZone(from, to.zone);
}

function checkPackage(from: Zone, to: Extract<Target, { kind: "package" | "builtin" }>): string | null {
  const key = from.layer === "app" ? (`app:${from.owner}` as const) : from.part;
  if (key === null) return null; // reported once, as "file is in no part folder"
  if (from.part === "manifest") return `a manifest imports only registry types, not ${to.name}`;
  const rule = PACKAGE_RULES[key as keyof typeof PACKAGE_RULES];
  if (rule === undefined) return null;
  if (to.kind === "builtin") return rule.builtins ? null : `${describe(from)} may not use Node built-in ${to.name}`;
  return rule.banned.some((test) => test(to.name)) ? `${describe(from)} may not import ${to.name}` : null;
}

function checkZone(from: Zone, to: Zone): string | null {
  const sameOwner = from.layer === to.layer && from.owner === to.owner;
  if (to.layer === "app") return from.layer === "app" && sameOwner ? null : `nothing imports into apps/${to.owner}`;
  if (to.part === "registry") return from.layer === "app" ? null : "only the apps import the generated registry";
  // Generated code: it imports every feature's parts by design, and only the apps import it.
  if (from.part === "registry") return null;

  if (from.layer === "app") {
    const allowed = APP_PARTS[from.owner] ?? [];
    return to.part !== null && allowed.includes(to.part) ? null : `apps/${from.owner} may not import ${to.part ?? "stray"} code`;
  }
  if (from.layer === "feature" && to.layer === "feature" && !sameOwner) return "features never import each other";
  if (from.layer === "platform" && to.layer === "feature") return "the platform never imports a feature";
  if (from.layer === "reference" && to.layer !== "reference") return "reference imports only reference";
  if (from.part === "test" || from.part === null) return null;

  if (from.part === "manifest") {
    return to.layer === "platform" && to.owner === "registry" && to.part === "core"
      ? null
      : "a manifest imports only registry types";
  }
  if (to.part === null || !PART_RULES[from.part].includes(to.part)) return `${describe(from)} may not import ${to.part ?? "stray"} code`;
  if (to.part === "db" && !sameOwner && !(from.part === "db" && to.layer === "platform")) {
    return "only a module's own server and db code import its tables";
  }
  return null;
}

function describe(zone: Zone): string {
  if (zone.layer === "app") return `apps/${zone.owner}`;
  return `${zone.part} code`;
}
```

```powershell
pnpm --filter @tsa/boundaries exec vitest run src/rules.test.ts
```
Expected: `Tests 86 passed (86)`.

- [ ] **Step 8: failing test for the scan** `tools/boundaries/src/scan.test.ts`. The fixture repo is built in a temp folder, so deliberately broken code never sits in the tree for a type-check to trip on. The file holds exactly one violation per bad file and none in the good ones, and the assertion is the whole list, so any change in behavior turns it red. The `@fx` scope keeps the fixture's package names from ever colliding with the real `@tsa/*` ones.

```ts
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { packageName, scanRepo } from "./scan";

// A small repo with exactly one violation per "bad" file. Built in a temp folder so no
// deliberately broken code ever sits in the real tree for a type-check or a linter to trip on.
const FIXTURE: Record<string, string> = {
  "platform/package.json": JSON.stringify({
    name: "@fx/platform",
    private: true,
    exports: { "./*/core": "./*/core/index.ts", "./*/client": "./*/client/index.ts", "./*/server": "./*/server/index.ts" },
  }, null, 2),
  "platform/sync/core/index.ts": "export const core = 1;\n",
  "platform/sync/server/index.ts": "export const server = 1;\n",
  "platform/sync/db/index.ts": "export const table = 1;\n",
  "features/package.json": JSON.stringify({ name: "@fx/features", private: true }, null, 2),
  "features/money/core/ok.ts": 'import { core } from "@fx/platform/sync/core";\nimport { z } from "zod";\nimport type { Money } from "./types";\nexport const ok = [core, z];\n',
  "features/money/core/types.ts": "export type Money = number;\n",
  "features/money/core/bad-react.ts": 'import { useState } from "react";\nexport const x = useState;\n',
  "features/money/core/bad-cross.ts": 'import { p } from "../../polls/core/p";\nexport const x = p;\n',
  "features/money/core/bad-unexported.ts": 'import { table } from "@fx/platform/sync/db";\nexport const x = table;\n',
  "features/money/core/load.test.ts": "export const load = (name: string) => import(name);\n",
  "features/money/core/bad-dynamic.ts": "export const load = (name: string) => import(name);\n",
  "features/money/core/bad-builtin.ts": 'const fs = require("node:fs");\nexport const x = fs;\n',
  "features/money/core/bad-equals.ts": 'import server = require("../server/s");\nexport const x = server;\n',
  "features/money/client/bad-server.ts": 'import { server } from "@fx/platform/sync/server";\nexport const x = server;\n',
  "features/money/mobile/bad-context.ts": 'export const ctx = require.context("../..");\n',
  "features/money/server/s.ts": "export const s = 1;\n",
  "features/money/web/Home.tsx": "export const Home = () => <main />;\n",
  "features/money/utils.ts": "export const stray = 1;\n",
  "features/polls/core/p.ts": "export const p = 1;\n",
  "features/_registry/server.ts": "import * as money from '../money/server/s';\nexport const serverParts = { money };\n",
  "apps/web/package.json": JSON.stringify({ name: "@fx/web", private: true }, null, 2),
  "apps/web/page.tsx": 'import { Home } from "../../features/money/web/Home";\nimport "react-native";\nexport default Home;\n',
  "apps/mobile/package.json": JSON.stringify({ name: "@fx/mobile", private: true }, null, 2),
  "apps/mobile/src/index.tsx": 'import { s } from "../../../features/money/server/s";\nexport default s;\n',
};

let fixture: string;

// pnpm links workspace packages into node_modules; a junction does the same here without admin rights.
beforeAll(() => {
  fixture = mkdtempSync(join(tmpdir(), "boundaries-"));
  for (const [rel, content] of Object.entries(FIXTURE)) {
    mkdirSync(dirname(join(fixture, rel)), { recursive: true });
    writeFileSync(join(fixture, rel), content);
  }
  mkdirSync(join(fixture, "node_modules", "@fx"), { recursive: true });
  symlinkSync(join(fixture, "platform"), join(fixture, "node_modules", "@fx", "platform"), "junction");
});
afterAll(() => {
  rmSync(fixture, { recursive: true, force: true });
});

describe("scanRepo on the fixture repo", () => {
  it("reports exactly one violation per bad file, and nothing for the good ones", () => {
    const found = scanRepo({ root: fixture }).violations.map((v) => [v.file, v.line, v.reason]);
    expect(found).toEqual([
      ["apps/mobile/src/index.tsx", 1, "apps/mobile may not import server code"],
      ["apps/web/page.tsx", 2, "apps/web may not import react-native"],
      ["features/money/client/bad-server.ts", 1, "client code may not import server code"],
      ["features/money/core/bad-builtin.ts", 1, "core code may not use Node built-in node:fs"],
      ["features/money/core/bad-cross.ts", 1, "features never import each other"],
      ["features/money/core/bad-dynamic.ts", 1, "an import or require with a computed specifier cannot be checked"],
      ["features/money/core/bad-equals.ts", 1, "core code may not import server code"],
      ["features/money/core/bad-react.ts", 1, "core code may not import react"],
      ["features/money/core/bad-unexported.ts", 1, expect.stringContaining('"./sync/db" is not exported')],
      ["features/money/mobile/bad-context.ts", 1, "require.context bypasses the generated registry"],
      ["features/money/utils.ts", 1, "file is in no part folder (core, client, server, db, web, mobile, tests)"],
    ]);
  });
});

describe("scanRepo coverage", () => {
  it("lists every governed file it scanned, and skips the ungoverned ones", () => {
    const { scannedFiles } = scanRepo({ root: fixture });
    expect(scannedFiles).toContain("features/money/core/ok.ts");
    expect(scannedFiles).toContain("apps/web/page.tsx");
    expect(scannedFiles).toContain("apps/mobile/src/index.tsx");
    expect(scannedFiles).not.toContain("features/package.json");
    expect(scannedFiles).toContain("features/_registry/server.ts");
    expect(scannedFiles).toHaveLength(21);
  });
});

describe("packageName", () => {
  it.each([
    ["react", "react"],
    ["react-dom/client", "react-dom"],
    ["@tsa/platform/sync/core", "@tsa/platform"],
    ["@scope", null],
    ["./x", null],
    ["../x", null],
    ["/abs", null],
    ["@/lib/x", null],
    ["#internal", null],
  ])("%s → %s", (specifier, name) => {
    expect(packageName(specifier)).toBe(name);
  });
});
```

```powershell
pnpm --filter @tsa/boundaries exec vitest run src/scan.test.ts
```
Expected: FAIL (`Cannot find module './scan'`).

- [ ] **Step 9: the scan** `tools/boundaries/src/scan.ts`:

```ts
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { isBuiltin } from "node:module";
import { dirname, join, relative } from "node:path";
import { ResolverFactory } from "oxc-resolver";
import { collectImports, type ImportRef } from "./imports";
import { checkEdge, type Target } from "./rules";
import { classify, TEST_FILE, type Zone } from "./zones";

export interface Violation {
  file: string; // repo-relative, POSIX
  line: number;
  specifier: string | null;
  reason: string;
}

export interface ScanResult {
  violations: Violation[];
  /** Every file the rules were applied to, repo-relative and sorted: proof the scan looked at something. */
  scannedFiles: string[];
}

export interface ScanOptions {
  /** Absolute path of the repo root. */
  root: string;
  /** Repo-relative directories to scan. */
  scanRoots?: string[];
  /** Repo-relative directory → its tsconfig.json, for path aliases such as "@/". Longest prefix wins. */
  tsconfigs?: Record<string, string>;
}

export const SCAN_ROOTS = ["apps/web", "apps/mobile/src", "features", "platform", "reference"];
const SKIP_DIRS = new Set([
  "node_modules", ".next", ".expo", ".turbo", ".git", ".claude", ".vercel", ".superpowers", "dist", "build", "coverage",
  "android", "ios", "playwright-report", "test-results",
]);
const CODE_FILE = /\.[cm]?[jt]sx?$/;
const LAYER_ROOTS = ["features", "platform", "reference"];

/** Every boundary violation under the scan roots, sorted by file then line. */
export function scanRepo(options: ScanOptions): ScanResult {
  // The resolver answers with real paths, so the root must be real too, or a root reached
  // through a junction or an 8.3 short name would read every import as outside the repo.
  const root = realpathSync.native(options.root);
  const workspace = workspacePackageNames(root);
  const resolvers = new Map<string, ResolverFactory>();
  const resolverFor = (rel: string) => {
    const match = Object.keys(options.tsconfigs ?? {})
      .filter((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))
      .sort((a, b) => b.length - a.length)[0];
    const key = match ?? "";
    let resolver = resolvers.get(key);
    if (resolver === undefined) {
      resolver = new ResolverFactory({
        conditionNames: ["import", "require", "node", "default", "types"],
        extensions: [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".json"],
        extensionAlias: { ".js": [".ts", ".tsx", ".js"], ".mjs": [".mts", ".mjs"] },
        ...(match ? { tsconfig: { configFile: join(root, options.tsconfigs![match]), references: "auto" as const } } : {}),
      });
      resolvers.set(key, resolver);
    }
    return resolver;
  };

  const violations: Violation[] = [];
  const scannedFiles: string[] = [];
  for (const scanRoot of options.scanRoots ?? SCAN_ROOTS) {
    const dir = join(root, scanRoot);
    if (!existsSync(dir)) continue;
    for (const file of walk(dir)) {
      const rel = toPosix(relative(root, file));
      const zone = classify(rel);
      if (zone === null) continue;
      scannedFiles.push(rel);
      if (zone.layer !== "app" && zone.part === null) {
        violations.push({ file: rel, line: 1, specifier: null, reason: "file is in no part folder (core, client, server, db, web, mobile, tests)" });
        continue;
      }
      const { imports, errors } = collectImports(file, readFileSync(file, "utf8"));
      for (const message of errors) violations.push({ file: rel, line: 1, specifier: null, reason: `cannot parse: ${message}` });
      for (const ref of imports) {
        const reason = judge(ref, zone, file);
        if (reason !== null) violations.push({ file: rel, line: ref.line, specifier: ref.specifier, reason });
      }
    }
  }
  violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return { violations, scannedFiles: scannedFiles.sort() };

  function judge(ref: ImportRef, zone: Zone, file: string): string | null {
    if (ref.kind === "dynamic-unknown") return TEST_FILE.test(file) ? null : "an import or require with a computed specifier cannot be checked";
    if (ref.kind === "require-context") return "require.context bypasses the generated registry";
    const specifier = ref.specifier!;
    const target = resolveTarget(specifier, file);
    return typeof target === "string" ? target : checkEdge(zone, target);
  }

  function resolveTarget(specifier: string, file: string): Target | string {
    if (isBuiltin(specifier)) return { kind: "builtin", name: specifier };
    const name = packageName(specifier);
    if (name !== null && !workspace.has(name)) return { kind: "package", name };
    const result = resolverFor(toPosix(relative(root, file))).sync(dirname(file), specifier);
    if (!result.path) return `cannot resolve ${specifier}: ${result.error ?? "unknown error"}`;
    const rel = toPosix(relative(root, result.path));
    if (rel.startsWith("..") || rel.split("/").includes("node_modules")) {
      return name !== null ? { kind: "package", name } : `${specifier} resolves outside the repo`;
    }
    const zone = classify(rel);
    return zone === null ? { kind: "unzoned", rel } : { kind: "zone", zone };
  }
}

/** Names of the workspace's own packages: their imports resolve to files and are judged by zone. */
function workspacePackageNames(root: string): Set<string> {
  const names = new Set<string>();
  const manifests = [...LAYER_ROOTS.map((d) => join(root, d, "package.json"))];
  for (const group of ["apps", "tools"]) {
    const dir = join(root, group);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) manifests.push(join(dir, entry.name, "package.json"));
    }
  }
  for (const manifest of manifests) {
    if (existsSync(manifest)) names.add(JSON.parse(readFileSync(manifest, "utf8")).name);
  }
  return names;
}

/** "@scope/pkg/sub" → "@scope/pkg"; "pkg/sub" → "pkg"; relative, absolute and aliased specifiers → null. */
export function packageName(specifier: string): string | null {
  if (isRelative(specifier) || specifier.startsWith("@/") || specifier.startsWith("#") || specifier.startsWith("~")) return null;
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  return parts[0];
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith(".") || specifier.startsWith("/");
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(join(dir, entry.name));
    } else if (CODE_FILE.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      yield join(dir, entry.name);
    }
  }
}

function toPosix(path: string): string {
  return path.split("\\").join("/");
}
```

```powershell
pnpm --filter @tsa/boundaries exec vitest run src/scan.test.ts
```
Expected: `Tests 11 passed (11)`.

- [ ] **Step 10: the scan of this repo** `tools/boundaries/src/repo.test.ts`:

```ts
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scanRepo } from "./scan";

const root = fileURLToPath(new URL("../../..", import.meta.url));

// Path aliases per app. apps/web's "@/*" resolves through its own tsconfig.
const TSCONFIGS = { "apps/web": "apps/web/tsconfig.json" };

describe("this repo's imports", () => {
  const { violations, scannedFiles } = scanRepo({ root, tsconfigs: TSCONFIGS });

  // A clean result only means something if the scan reached the code: check
  // for files it must see, and a floor well under today's count.
  it("reach the whole web app", () => {
    expect(scannedFiles).toContain("apps/web/proxy.ts");
    expect(scannedFiles).toContain("apps/web/app/layout.tsx");
    expect(scannedFiles).toContain("apps/web/lib/server/store.ts");
    expect(scannedFiles.length).toBeGreaterThan(300);
  });

  it("cross no zone boundary", () => {
    expect(violations).toEqual([]);
  });
});
```
```powershell
pnpm --filter @tsa/boundaries exec vitest run src/repo.test.ts
```
Expected: `Tests 2 passed (2)`. In the spike, the whole of today's app produced one violation, a computed `import()` in `lib/tokens.test.ts`, which is allowed because it is a test file. So a violation here is new information: report it, don't widen a rule to hide it.

Record the real `scannedFiles.length` in the PR description. The floor of 300 is deliberately below it, because about 430 code files are expected.

- [ ] **Step 11: prove the repo test would catch a real crossing.** Temporarily create `apps/web/lib/_probe.ts` containing `import "react-native";`, then run:

```powershell
pnpm --filter @tsa/boundaries exec vitest run src/repo.test.ts
Remove-Item apps\web\lib\_probe.ts
```
Expected: FAIL, naming `apps/web/lib/_probe.ts:1` and `apps/web may not import react-native`. Then delete the probe and check that `git status` shows no `_probe`.

- [ ] **Step 12: the whole package, type-checked**

```powershell
pnpm --filter @tsa/boundaries test
pnpm --filter @tsa/boundaries typecheck
```
Expected: `Tests 132 passed (132)` (11 + 22 + 86 + 11 + 2), and `tsc` exits 0.

- [ ] **Step 13: CI runs every package's checks.** In `.github/workflows/ci.yml`'s `test` job, replace `pnpm --filter @tsa/web exec tsc --noEmit` with:

```yaml
      - run: pnpm typecheck
```
`pnpm test` already runs every package's tests (`pnpm -r`), so the tool suites and the repo scan run from the next push on. The three refresh workflows keep running the web suite only, so a tool test can never block a data commit.

- [ ] **Step 14: commit, push, open PR 3**

```powershell
git add tools/boundaries .github/workflows/ci.yml pnpm-lock.yaml
git commit -m "feat: add the boundary scan that decides spec §0's zone rules" -m "oxc-parser reads every import form, including the require(), require.context() and import x = require() that its module record leaves out. oxc-resolver follows workspace links and exports maps to real files, each of which is classified into a zone and checked against the rule table. The repo test scans the whole web app and must stay clean." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/workspace-tools
gh pr create --base main --title "feat: registry generator and boundary scan" --body "<summary; the rule interpretations from Task 8; test counts; scannedFiles.length; the probe check; test plan>"
```
Expected: CI goes green, with `pnpm typecheck` covering web and both tools and `pnpm test` running web, registry-gen (10) and boundaries (132). The Vercel preview is Ready, because the root `postinstall` runs there too. Check the build log for the `registry-gen: wrote` lines.

- [ ] **Step 15 (owner): merge PR 3**, rebase-merge. Delete the branch only after `gh pr view <n> --json state` says `MERGED`.

---

### Task 9: The Android toolchain on this machine (owner, before PR 4)

**Who:** the owner. These change Windows features, install software and set user environment variables, so an agent must not do them.

What the machine had on 2026-09-30:
- Android Studio is installed, and its bundled JBR is JDK 21.
- The SDK at `%LOCALAPPDATA%\Android\Sdk` has platform API 36, build-tools and the emulator.
- There is **no** CMake, NDK, system image or AVD.
- `java`, `adb`, `ANDROID_HOME` and `JAVA_HOME` are all missing.
- Windows long paths are already on (`LongPathsEnabled = 1`).

- [ ] **Step 1: Windows Hypervisor Platform.** Go to Settings, then System, then Optional features, then More Windows features. Tick "Windows Hypervisor Platform", press OK and restart. The emulator needs it, and the older AEHD driver is retired on 2026-12-31.

- [ ] **Step 2: JDK 17.** Install the Microsoft Build of OpenJDK 17 MSI from https://learn.microsoft.com/java/openjdk/download#openjdk-17, and tick "Set JAVA_HOME" in the installer. Expo's Windows guide names JDK 17; whether Android Studio's JDK 21 works with React Native 0.86's Gradle is unresearched, so don't rely on it.

- [ ] **Step 3: the SDK pieces.** In Android Studio, open More Actions, then SDK Manager, then SDK Tools, and tick "Show Package Details". Tick these, then Apply:
  - **CMake 3.31.6**. It must be exactly the version `app.config.js` names; this is what builds past Windows' 260-character paths.
  - **NDK (Side by side)**, the newest. If Gradle later asks for a specific NDK, install that one too.
  - **Android SDK Command-line Tools (latest)**.
  - **Android SDK Platform-Tools**.

  Under SDK Platforms, tick "Show Package Details", then under Android 16 (API 36) tick **Google APIs Intel x86_64 Atom System Image**. Apply.

- [ ] **Step 4: an emulator.** Open Device Manager, choose Create Virtual Device, pick Pixel 8, then the API 36 Google APIs image, then Finish. Start it once and wait for the home screen.

- [ ] **Step 5: environment variables** (user scope, no admin). In a PowerShell window:

```powershell
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
$path = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("Path", "$path;$env:LOCALAPPDATA\Android\Sdk\platform-tools;$env:LOCALAPPDATA\Android\Sdk\emulator", "User")
```

- [ ] **Step 6: accept the SDK licences and verify.** Open a **new** PowerShell window, so it picks up the variables:

```powershell
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" --licenses
java -version
adb version
emulator -list-avds
Test-Path "$env:ANDROID_HOME\cmake\3.31.6"
```
Expected:
- answer `y` to every licence;
- `java` reports `17.`;
- `adb` prints a version;
- the AVD from Step 4 is listed;
- `Test-Path` prints `True`.

---

### Task 10: The Expo skeleton in `apps/mobile` (PR 4)

**Files:**
- Create: `apps/mobile/`, from the `blank-typescript` template, then trimmed
- Create: `apps/mobile/app.config.js`, `apps/mobile/src/app/_layout.tsx`, `apps/mobile/src/app/index.tsx`, `apps/mobile/tests/home.test.tsx`
- Modify: `apps/mobile/package.json`, `apps/mobile/tsconfig.json`, `pnpm-workspace.yaml` (catalog), `apps/web/package.json` (react and react-dom from the catalog), `tools/boundaries/src/repo.test.ts`
- Delete: the template's `App.tsx`, `index.ts` and `app.json`

**Interfaces:**
- Consumes: `@tsa/features/_registry/manifests` (Task 7), which exports `manifests` as an empty tuple while no feature exists.
- Produces: the package `@tsa/mobile`, with the scripts `start`, `android`, `test`, `typecheck` and `export`. Its home screen shows `Travel super app` and `0 apps registered`. That text is how Task 12 sees, on the emulator, that the generated registry reached Metro.

- [ ] **Step 1: branch, and pick the SDK**

```powershell
git switch main; git pull --ff-only
git switch -c feat/mobile-skeleton
npm view expo dist-tags --json
```
If `latest` is `57.x`, follow this task as written, and Task 13 does the 58 upgrade later. If `latest` is `58.x`, SDK 58 is stable. Then:
- use the React, React Native and TypeScript versions the SDK 58 template writes, instead of the 57 numbers below;
- skip Task 13;
- note it in the PR.

- [ ] **Step 2: create the app from the template, without installing.** The workspace installs it.

```powershell
pnpm dlx create-expo-app@5.0.0 apps/mobile --template blank-typescript --no-install --no-agents-md
Get-ChildItem -Force apps\mobile
```
Expected: `.gitignore`, `App.tsx`, `app.json`, `assets`, `index.ts`, `package.json`, `tsconfig.json`. If it also created `.git`, `pnpm-workspace.yaml`, `.npmrc` or a lockfile inside `apps/mobile`, delete them, because the root owns all four.

- [ ] **Step 3: swap the template's entry for Expo Router's**

```powershell
Remove-Item apps\mobile\App.tsx, apps\mobile\index.ts, apps\mobile\app.json
```
Create `apps/mobile/app.config.js`:
```js
// Plain JavaScript on purpose: Expo loads app.config.ts through TypeScript's
// JavaScript API, which TypeScript 7 does not have (spec §0). The identifiers
// are placeholders until the name is chosen in phase 3, and must be final
// before any store upload (phase 6).
module.exports = {
  name: "Travel super app",
  slug: "travel-super-app",
  scheme: "travelsuperapp",
  version: "0.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  // No web target: the website is apps/web, and screens are never shared (spec §0).
  platforms: ["ios", "android"],
  ios: { bundleIdentifier: "com.darrencwj.travelsuperapp" },
  android: { package: "com.darrencwj.travelsuperapp" },
  plugins: [
    "expo-router",
    // CMake 3.31.6 or newer builds past Windows' 260-character paths. The
    // Android SDK must have this exact version installed (Task 9).
    ["expo-build-properties", { android: { cmakeVersion: "3.31.6" } }],
  ],
};
```

- [ ] **Step 4: make it the `@tsa/mobile` package.** In `apps/mobile/package.json`:
- set `"name": "@tsa/mobile"`, `"version": "0.0.0"`, `"private": true` and `"main": "expo-router/entry"`;
- replace `"scripts"` with:

```json
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "test": "jest",
    "typecheck": "tsc --noEmit",
    "export": "expo export --platform android --platform ios --output-dir dist"
  },
  "jest": {
    "preset": "jest-expo"
  },
```
- add `"@tsa/features": "workspace:*"` to `"dependencies"`;
- delete `react-dom` and `react-native-web` from the dependencies if the template put them there, since there is no web target.

- [ ] **Step 5: one React for the whole workspace.** Add the SDK's exact pins to `catalog:` in `pnpm-workspace.yaml`. These are SDK 57's numbers, from Expo's `bundledNativeModules.json`:

```yaml
  react: 19.2.3
  react-dom: 19.2.3
  react-native: 0.86.3
```
Set `"react": "catalog:"` and `"react-native": "catalog:"` in `apps/mobile/package.json`, and `"react": "catalog:"` and `"react-dom": "catalog:"` in `apps/web/package.json`. That moves the web app from 19.2.8 to 19.2.3 (decision D7).
```powershell
pnpm install
pnpm --filter @tsa/web why react
pnpm --filter @tsa/mobile why react
```
Expected: both print `react 19.2.3`, one physical copy.

- [ ] **Step 6: Expo Router, the development client and the test tools,** at the versions SDK 57 expects. `expo install` chooses them; never hand-edit them.

```powershell
cd apps\mobile
pnpm exec expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar expo-dev-client expo-build-properties
pnpm exec expo install jest-expo jest @types/jest @testing-library/react-native --dev
cd ..\..
Select-String -Path apps\mobile\package.json -Pattern '"react(-native)?":'
```
Expected: the last command still shows `"react": "catalog:"` and `"react-native": "catalog:"`. If `expo install` rewrote either one to a plain version, put `catalog:` back and run `pnpm install`.

The React Native tree is the first to bring packages with install scripts. If any `pnpm install` in this task prints `Ignored build scripts:`, apply Task 2 Step 5's rule to each name: `false` if it ships prebuilt binaries or is optional, `true` only if the build or the app fails without it, with a comment saying why. Either way, nothing is left unlisted.

- [ ] **Step 7: the TypeScript config.** Replace `apps/mobile/tsconfig.json` with:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "types": ["jest"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts", "tests/**/*.tsx", "expo-env.d.ts"]
}
```
TypeScript 7 defaults `types` to `[]`, so the Jest globals must be named here.

- [ ] **Step 8: write the failing test** `apps/mobile/tests/home.test.tsx`. It sits outside `src/app` because Expo Router turns every file under `src/app` into a route.

```tsx
import { render, screen } from "@testing-library/react-native";
import Home from "../src/app/index";

test("the home screen names the app and shows how many apps the generated registry lists", () => {
  render(<Home />);
  expect(screen.getByRole("header", { name: "Travel super app" })).toBeTruthy();
  // No feature exists yet, so the registry lists none. If the registry import
  // broke, this file would fail to load, which is part of what it checks.
  expect(screen.getByText("0 apps registered")).toBeTruthy();
});
```
```powershell
pnpm --filter @tsa/mobile exec jest
```
Expected: FAIL (`Cannot find module '../src/app/index'`).

If it fails instead with `SyntaxError: Cannot use import statement outside a module` from a file under `node_modules/.pnpm/`, jest-expo's default ignore pattern is not matching pnpm's layout. Add this to the `"jest"` block and run again; it should now fail with the expected message:
```json
    "transformIgnorePatterns": [
      "node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg))"
    ]
```

- [ ] **Step 9: the two routes**

`apps/mobile/src/app/_layout.tsx`:
```tsx
import { Stack } from "expo-router";

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```
`apps/mobile/src/app/index.tsx`:
```tsx
import { StyleSheet, Text, View } from "react-native";
import { manifests } from "@tsa/features/_registry/manifests";

// The skeleton's only job: prove the app builds, and that the generated registry
// reaches Metro through the workspace (spec §0 "Registry"). The launcher that
// lists apps arrives with the shell in phase 3.
export default function Home() {
  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>
        Travel super app
      </Text>
      <Text style={styles.body}>{`${manifests.length} apps registered`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#f3f6fa" },
  title: { fontSize: 24, fontWeight: "700", color: "#17263b" },
  body: { marginTop: 8, fontSize: 16, color: "#4a5b72" },
});
```
```powershell
pnpm --filter @tsa/mobile exec jest
```
Expected: `Tests: 1 passed, 1 total`.

- [ ] **Step 10: TypeScript. Decide the spec's TS 7 route by running it** (decision D8). Set `"typescript": "catalog:"` in `apps/mobile/package.json`'s devDependencies, and add this top-level block:

```json
  "expo": {
    "install": {
      "exclude": ["typescript"]
    }
  },
```
```powershell
pnpm install
pnpm --filter @tsa/mobile typecheck
```
- **If `tsc` exits 0**, keep TS 7. This is the spec's route.
- **If `tsc` fails with errors inside `node_modules` type definitions, or crashes**, TS 7 cannot yet check the real React Native and Expo types. Set `apps/mobile`'s `typescript` back to the version the template wrote (`~6.0.3`), delete the `"expo": {"install": ...}` block (`expo install --check` then passes on its own), run `pnpm install` and then `pnpm --filter @tsa/mobile typecheck`, which must exit 0. Record which route was taken, and why, in the PR description.

An error in `src/` or `tests/` is neither case. It is a real bug to fix.

- [ ] **Step 11: the Expo checks CI will run**

```powershell
pnpm --filter @tsa/mobile exec expo install --check
pnpm --filter @tsa/mobile export
```
Expected:
- `Dependencies are up to date`. This command asks Expo's API, so it needs the network.
- The export writes `apps/mobile/dist/` with an Android and an iOS bundle, and no error such as `Unable to resolve module @tsa/features/_registry/manifests`. `dist/` is covered by the template's `.gitignore`.

- [ ] **Step 12: the scan now covers the mobile app.** The scan already walks `apps/mobile/src` (`SCAN_ROOTS`). The mobile app uses no path alias, so `TSCONFIGS` stays as it is. In `tools/boundaries/src/repo.test.ts`, add to the first test:
```ts
    expect(scannedFiles).toContain("apps/mobile/src/app/index.tsx");
```
```powershell
pnpm --filter @tsa/boundaries test
```
Expected: `Tests 132 passed (132)`. The mobile screen imports `react-native`, `expo-router` and the registry, and all three are allowed for `apps/mobile`.

- [ ] **Step 13: the web app on React 19.2.3**

```powershell
pnpm --filter @tsa/web typecheck
pnpm --filter @tsa/web test
pnpm --filter @tsa/web build
```
Expected: `Tests T passed`, the baseline number. Only Vitest and jsdom run the installed React; the App Router runtime uses Next's vendored copy. If a count moves, root-cause it; do not adjust it.

- [ ] **Step 14: commit**

```powershell
git add apps/mobile pnpm-workspace.yaml pnpm-lock.yaml apps/web/package.json tools/boundaries/src/repo.test.ts
git status --short
git commit -m "feat: add the Expo skeleton in apps/mobile" -m "Expo SDK 57 from the blank TypeScript template, with Expo Router, a development client and CMake 3.31.6 for Windows paths. The home screen reads the generated registry through @tsa/features, which proves Metro resolves the workspace. React and React Native come from the pnpm catalog, one copy for both apps." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: `git status` before the commit shows no `apps/mobile/android`, `ios`, `dist`, `.expo` or `node_modules` paths staged; the template's `.gitignore` covers them.

---

### Task 11: One always-running CI workflow (PR 4)

**Files:**
- Replace: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the package scripts `@tsa/web` (`typecheck`, `test`, `build`, and Playwright through `exec`), `@tsa/mobile` (`typecheck`, `export`, and `jest`/`expo` through `exec`), and the tools' `typecheck` and `test`.
- Produces: the check names `changes`, `tools`, `web`, `e2e`, `mobile` and `ci-ok`. `ci-ok` is the one to make required if branch protection is ever turned on.

- [ ] **Step 1: replace `.github/workflows/ci.yml`**

```yaml
# The repo's checks, run on every push and pull request.
#
# One workflow that always runs (spec §0). Each job is gated by `if:` on the
# path filter below, so a job with nothing to check is skipped. A skipped job
# counts as success, whereas a workflow skipped by `paths:` would leave a
# required check pending forever. EAS never runs here.
name: CI

on:
  push:
    branches: ["**"]
  pull_request:

jobs:
  changes:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
    outputs:
      shared: ${{ steps.filter.outputs.shared }}
      web: ${{ steps.filter.outputs.web }}
      mobile: ${{ steps.filter.outputs.mobile }}
    steps:
      - uses: actions/checkout@v5
      - uses: dorny/paths-filter@v4
        id: filter
        with:
          filters: |
            shared:
              - 'features/**'
              - 'platform/**'
              - 'tools/**'
              - 'package.json'
              - 'pnpm-workspace.yaml'
              - 'pnpm-lock.yaml'
              - '.github/workflows/ci.yml'
            web:
              - 'apps/web/**'
            mobile:
              - 'apps/mobile/**'

  # The boundary scan reads both apps and every package, so any code change runs it.
  tools:
    needs: changes
    if: ${{ needs.changes.outputs.shared == 'true' || needs.changes.outputs.web == 'true' || needs.changes.outputs.mobile == 'true' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter "./tools/*" typecheck
      - run: pnpm --filter "./tools/*" test

  web:
    needs: changes
    if: ${{ needs.changes.outputs.shared == 'true' || needs.changes.outputs.web == 'true' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @tsa/web typecheck
      - run: pnpm --filter @tsa/web test
      # The `server-only` guard on lib/server/airports.ts, cityIndex.ts,
      # catalog.ts and cityEnrichment.ts is only guaranteed to fire in a
      # production build: it is what turns a client import of a multi-megabyte
      # artifact, or of a Wikidata call whose User-Agent Chromium would drop,
      # into a build error instead of a silent shipment. Nothing else in CI
      # runs `next build` — `tsc` and vitest cannot see the boundary, and the
      # e2e job runs `next dev`, which compiles a page only when a test visits
      # it — so without this step the guard's only reliable trigger would be
      # Vercel's preview check, which is not required.
      - run: pnpm --filter @tsa/web build

  # A separate job from `web`, deliberately: a browser download and a Next
  # build are minutes of work that the unit gate should not wait behind, and a
  # flaky browser must not be able to redden the suite that has never been
  # flaky on CI.
  e2e:
    needs: changes
    if: ${{ needs.changes.outputs.shared == 'true' || needs.changes.outputs.web == 'true' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      # Keyed on the resolved Playwright version, because that decides which
      # browser build is wanted.
      - name: Resolve Playwright version
        id: pw
        working-directory: apps/web
        run: echo "version=$(node -p "require('@playwright/test/package.json').version")" >> "$GITHUB_OUTPUT"
      - uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ steps.pw.outputs.version }}
      # `--with-deps` pulls the system libraries the browser needs; still run
      # on a cache hit, because the cache holds the browser, not the apt packages.
      - run: pnpm --filter @tsa/web exec playwright install --with-deps chromium
      - run: pnpm --filter @tsa/web exec playwright test
        env:
          CI: "true"
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: |
            apps/web/playwright-report/
            apps/web/test-results/
          retention-days: 7

  mobile:
    needs: changes
    if: ${{ needs.changes.outputs.shared == 'true' || needs.changes.outputs.mobile == 'true' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @tsa/mobile typecheck
      # Compares the installed versions with what this Expo SDK expects. It asks
      # Expo's API, so this step needs the network.
      - run: pnpm --filter @tsa/mobile exec expo install --check
      - run: pnpm --filter @tsa/mobile exec jest --ci
      # Bundles the JavaScript for both platforms without a native build: proves
      # Metro resolves the workspace packages and the generated registry.
      - run: pnpm --filter @tsa/mobile export

  # The one check to require: green only when every job above passed or was
  # skipped by the path filter.
  ci-ok:
    needs: [changes, tools, web, e2e, mobile]
    if: ${{ always() }}
    runs-on: ubuntu-latest
    steps:
      - name: A job failed or was cancelled
        if: ${{ contains(needs.*.result, 'failure') || contains(needs.*.result, 'cancelled') }}
        run: exit 1
      - run: echo "Every job passed or was skipped."
```

- [ ] **Step 2: commit and push, then open PR 4**

```powershell
git add .github/workflows/ci.yml
git commit -m "ci: one always-running workflow with path filters and a mobile job" -m "A changes job decides which of tools, web, e2e and mobile run; skipped jobs count as success, and ci-ok summarises them for a future required check. The mobile job type-checks, runs expo install --check and jest, and bundles both platforms with expo export. EAS never runs on pull requests." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/mobile-skeleton
gh pr create --base main --title "feat: Expo skeleton in apps/mobile and one path-filtered CI workflow" --body "<summary; SDK version; which TypeScript route Task 10 Step 10 took; web counts on React 19.2.3; the emulator screenshot from Task 12; test plan>"
```
Expected: this PR touches `apps/mobile`, `apps/web/package.json`, `pnpm-*` and the workflow, so every job runs. `tools`, `web`, `e2e` and `mobile` are green, and `ci-ok` is green.

- [ ] **Step 3: prove the filter skips.** After PR 4 merges, the next docs-only PR (for example Task 14's) must show `tools`, `web`, `e2e` and `mobile` as **skipped** and `ci-ok` as green. Record it in Task 14.

---

### Task 12: A development build on the Android emulator (PR 4, the phase 0 gate)

**Who:** the controlling session, with the owner watching the emulator. Needs Task 9.

- [ ] **Step 1: start the emulator**

```powershell
emulator -list-avds
Start-Process emulator -ArgumentList "-avd", "<the AVD name from Task 9>"
adb wait-for-device
adb devices
```
Expected: one `emulator-5554   device` line.

- [ ] **Step 2: build and install the development build.** The first run takes 10 to 20 minutes. `expo run:android` generates `apps/mobile/android/`, which is gitignored and never committed, builds a debug APK with the development client, installs it and starts Metro.

```powershell
pnpm --filter @tsa/mobile android
```
Expected: `BUILD SUCCESSFUL`, then `Installing ... on emulator-5554`, then the app opens and shows **Travel super app** and **0 apps registered**.

- [ ] **Step 3: keep the proof**

```powershell
adb shell screencap -p /sdcard/phase0-emulator.png
adb pull /sdcard/phase0-emulator.png "$env:TEMP\phase0-emulator.png"
```
Don't use `adb exec-out screencap -p > file.png` here. In PowerShell 5.1, `>` re-encodes a native command's output as UTF-16 text, which corrupts the PNG.

Look at the screenshot and confirm both lines of text. Attach it to PR 4's description, or send it to the owner.

Known failures and their fixes:
- **`Filename longer than 260 characters`, or a CMake or ninja path error:**
  1. check `Test-Path "$env:ANDROID_HOME\cmake\3.31.6"` is `True`, and that `app.config.js` names `3.31.6`;
  2. delete `apps/mobile/android` and rerun;
  3. if it persists, add `nodeLinker: hoisted` to `pnpm-workspace.yaml`, which is Expo's documented fallback for pnpm. Run `pnpm install`, rerun, and tell the owner, because it trades away pnpm's isolation (the scan still enforces the boundaries).
- **`Unsupported class file major version` or another Gradle and JDK mismatch:** `java -version` must say 17 in the same shell.
- **The NDK is not installed, or a licence is not accepted:** install the NDK version the error names in SDK Manager, then rerun `sdkmanager --licenses`.
- **A native library fails under pnpm's isolated layout:** `nodeLinker: hoisted` as above.
- **Windows App Control blocks Gradle, the Kotlin daemon or the emulator:** stop and tell the owner. Never change the policy.

- [ ] **Step 4 (owner): merge PR 4** once CI is green and the screenshot is in, rebase-merge. Delete the branch only after `gh pr view <n> --json state` says `MERGED`.

---

### Task 13: Expo SDK 58, when it is stable (PR 5, conditional)

Spec §0 says SDK 57 is used until 58 is stable and then "upgraded within phase 0". SDK 58 was in beta on 2026-09-30 (React Native 0.88 RC, React 19.3.0), and its stable release follows React Native 0.88, scheduled for 2026-10-12. Skip this task if Task 10 already started on 58.

- [ ] **Step 1: wait for stable**

```powershell
npm view expo dist-tags.latest
```
Continue only when it prints `58.x`.

- [ ] **Step 2: upgrade**

```powershell
git switch main; git pull --ff-only
git switch -c chore/expo-sdk-58
cd apps\mobile
pnpm exec expo install expo@^58.0.0 --fix
cd ..\..
```
`--fix` may rewrite the `catalog:` entries in `apps/mobile/package.json` to plain versions:
1. Read the React, React Native and `@types/react` versions it wrote. For SDK 58 expect React 19.3.0 and React Native 0.88.x.
2. Put those versions into the catalog in `pnpm-workspace.yaml` (`react`, `react-dom`, `react-native`).
3. Put `catalog:` back in `apps/mobile/package.json` and `apps/web/package.json`.
4. Run `pnpm install`.

- [ ] **Step 3: every check on the new SDK**

```powershell
pnpm --filter @tsa/mobile typecheck
pnpm --filter @tsa/mobile exec expo install --check
pnpm --filter @tsa/mobile exec jest
pnpm --filter @tsa/mobile export
pnpm --filter @tsa/web test
pnpm --filter @tsa/boundaries test
Remove-Item -Recurse -Force apps\mobile\android -ErrorAction SilentlyContinue
pnpm --filter @tsa/mobile android
```
Expected:
- all green;
- the web suite is at the baseline T on React 19.3.0;
- the rebuilt development build shows the same two lines on the emulator.

SDK 58 needs Node ^22.13, ^24.3 or 26+, and Node 24.14 is fine. It also rewrote the Router navigation core, but the skeleton uses only `Stack`.

- [ ] **Step 4: PR, CI and merge** as in the earlier PRs, with the title `chore: upgrade the mobile app to Expo SDK 58` and the new versions in the body.

---

### Task 14: Close phase 0

**Who:** the controlling session, and the owner for Steps 4 and 6.

- [ ] **Step 1: the gate, with evidence.** Write one line of evidence, with links, for each of these in the close-out PR description (Step 5):
  - all checks green on `main`;
  - Vercel preview Ready from `apps/web`;
  - development build on the emulator (the screenshot);
  - `pnpm test` counts: web T; registry-gen 10; boundaries 132; mobile 1;
  - the docs-only PR showing the four jobs skipped (Task 11, Step 3);
  - a nightly refresh committing to `apps/web/` paths (Task 6, Step 6).

- [ ] **Step 2: Fable's final pass.** This is a standing rule. Give Fable:
  - `git diff <phase-0 start>..main` minus the data refresh commits;
  - spec §0 and §12;
  - this plan;
  - where the earlier reviewers looked hard: the rule table was mutation-checked, and the workflow artifact roots were reviewed.

  Ask it to lead with anything they got wrong, and say that a clean report is an acceptable result. Verify each finding before acting on it.

- [ ] **Step 3: record the phase in memory,** in `C:\Users\msn-f\.claude\projects\C--dev-travel-super-app\memory\`:
  - `super-app-architecture.md`: phase 0 is done, with the dates, the PR numbers, the SDK in use, the TypeScript route taken, and "next: phase 1 spec, then plan";
  - `MEMORY.md`: the index line, and the new repo path;
  - a note that the old OneDrive checkout is retired once Step 6 is done.

- [ ] **Step 4 (owner): decide the old checkout's fate.** Keeping it until phase 1 starts costs nothing. Deleting it frees about 2.5 GB, including its three worktrees' `node_modules`, and is the owner's action. Never delete it for them.

- [ ] **Step 5: the close-out PR** (docs only). In the spec's status line add "Phase 0 complete on <date> (PRs #…)", and in this plan add an "Execution record" section: each task's PR and SHA, the counts, the TypeScript route, and any step that went differently from the plan and why. Push it, open the PR and merge it. It is also the docs-only PR for Task 11, Step 3.

- [ ] **Step 6 (owner): turn on branch protection if wanted.** Require `ci-ok` on `main`. This is optional, and it is a repository setting, so it is the owner's action.

# Phase 1: platform foundations

**Status:** Design approved by the owner on 2026-10-02, section by section. Not yet planned or built.
**Parent:** [`2026-09-24-travel-super-app-design.md`](2026-09-24-travel-super-app-design.md) (the master spec), §12 item 1. This document says how phase 1 is cut up and settles what the master spec left open for it. Where the two disagree, §11 below lists the disagreement and this document wins for phase 1.
**Before it:** phase 0 (the monorepo conversion), complete on 2026-10-01. Its plan's execution record lists what it left for this phase.

---

## 1. What phase 1 delivers

No new screens. Phase 1 delivers the base that every later phase stands on:

- the old data layer gone, and the site still building without it;
- one Postgres database, with a migration history applied from CI;
- identity on that database;
- groups, trips and permissions, written as command handlers behind one push route;
- the guardrails that do not depend on sync, and the template every mini-app is copied from;
- nightly encrypted backups, with a restore that has been tested.

**Not in phase 1:** any sync beyond the push route (no outbox, no stored results, no pull); the shell and launcher; any mini-app; places; any screen in the mobile app; the domain; any paid plan. The mobile app's only obligation is that its checks stay green.

## 2. Owner decisions taken on 2026-10-02

1. **One spec, six slices.** Each slice gets its own plan, a few pull requests and its own gate.
2. **The destination explorer stays alive.** On preview links and in local development, `/plan`'s globe, country maps and city search keep working without sign-in. Production shows "being rebuilt" on every route, as decided on 2026-09-25.
3. **Backups stay in phase 1's gate, on Cloudflare R2.**
4. **Build order: tooling early, then upward.** Identity and the domain code are written under the guardrails from their first line, and the template is extracted from two real modules.
5. **Each backup is encrypted to two keys:** the owner's, kept offline, and a second one in GitHub secrets so CI can run the restore test.

## 3. The slices and their gates

| Slice | What it does | Gate |
|---|---|---|
| **A. Clear the ground** | Removes the old store, SQLite, wallets and every route and page that needs them. Adds the "being rebuilt" page. Keeps the explorer. Replaces the old repo name. | The site builds and runs with no database. The explorer and its browser tests pass on a preview. Production shows "being rebuilt". |
| **B. Database foundation and tooling** | Neon in Singapore, functions in `sin1`, the Vercel project renamed. Drizzle and the migration history. The CI migrate job. The test databases. Biome and per-zone TypeScript configs. | An empty migration history reaches production and a preview branch through CI, and every new guard is green. |
| **C. Identity** | better-auth on the new database: sign-up by access code, sign-in, the wall, the admin role. | Sign up, sign in and sign out work on a preview. The wall fails closed. |
| **D. Groups, trips and permissions** | The platform tables and their 28 commands behind `/api/sync/push`. A personal group for every user. | Every command passes through the push route on PGlite and on real Postgres. |
| **E. Template and guardrails** | `features/_template`, the scaffold command, the remaining scans, the Claude file layout. | An empty app scaffolded from the template passes every guard built so far. |
| **F. Backups** | The nightly encrypted dump to R2 and the restore test. | The restore test is green once. This closes phase 1. |

Each slice ends the way phase 0 did: a review per task, a whole-branch review, Fable's final pass, and an execution record in its plan.

## 4. Slice A: clear the ground

The master spec says the old data layer goes first, because its cold-start DDL would otherwise create its own auth tables in the new database.

**Deleted**
- `apps/web/lib/server/`: `store.ts`, `tripStore.ts`, `pgStore.ts`, `db.ts`, `migrate.ts`, `auth.ts`, `session.ts`, `authz.ts`, and whatever only they use.
- The 27 API routes that reach the store, the session or auth, wallets included.
- The pages `/`, `/trip/[id]`, `/b/[code]`, `/account`, `/login` and `/signup` as they are today. Each path answers with the "being rebuilt" page until its replacement lands.
- The tests that pin the deleted code (about twelve Vitest files), the sign-up setup and the wall tests in Playwright, and the expectation in `tools/boundaries/src/repo.test.ts` that `lib/server/store.ts` is scanned.
- The dependencies `better-sqlite3`, `postgres` and `pg`, and with them the `allowBuilds` entry and the SQLite lines in `.gitignore` and `.vercelignore`. `better-auth` goes too and returns in slice C.

**Kept, dormant.** The trip, money, tickets, journal and briefing components, their shared types and their unit tests. Nothing mounts them. Phase 4 moves them one feature at a time and deletes the old code in the same pull request, as the master spec says. A dormant file that no longer type-checks without the deleted server code is deleted now, and the execution record lists it.

**Kept, working**
- The five reference-data routes: airports search, destinations, destination resolve, map airports, map cities.
- `/plan` as the explorer. Its last step shows a "trips are being rebuilt" note instead of creating a trip.
- The nightly refresh workflows and the web suite they verify with.

**"Being rebuilt".** One static page with no data and no client code beyond the layout. In production, every route shows it; the switch is the Vercel environment, so previews and local development are unaffected. On previews and locally, the home page links to the explorer.

**The old repo name.** `china-itinerary-planner` is replaced in the 17 files outside `docs/` that still carry it: the README, the catalog's raw URL, the eleven User-Agent constants and the four tests that pin them. The history documents keep the old name. The display name, the `CIP_` environment names and the `cip-` storage keys are not touched: the product name is phase 3's decision.

**Hosting** does not change in this slice. The app needs no database.

## 5. Slice B: database foundation and tooling

**Hosting.** Neon is installed from the Vercel Marketplace, in `aws-ap-southeast-1`, on the Free plan. The functions move to `sin1`. The Vercel project is renamed to `travel-super-app`, and the dead Supabase URL is removed. Each preview deployment gets its own Neon branch through the integration. These are the owner's steps (§10).

**One way into the database.** Drizzle, over a single connection pool at runtime, through the pooled URL. The same schema files and the same queries run on PGlite in tests and in local development. The app connects as a role that may read and write rows and may not change the schema. Migrations run as the owner over the unpooled URL.

**Migrations**
- One append-only history in `db/migrations/`, a folder per migration, generated from `platform/*/db/schema.ts` and `features/*/db/schema.ts`. Triggers, roles and deferrable constraints are custom SQL migrations.
- A CI job applies the history on every push to `main`, under `pg_advisory_lock`, and to each pull request's Neon preview branch. Nothing migrates when the app starts, except the local PGlite database in development.
- **Every migration is safe for the code before it and the code after it:** add first, remove in a later pull request. Vercel deploys from Git on its own, so nothing guarantees the migration finishes before new code is live. Gating the deploy on the migration is a phase 6 decision.
- Guards: an existing migration folder never changes (a committed hash list); `drizzle-kit check`; `db/migrations/** eol=lf`; the path filter in `ci.yml` gains `db/**` and `biome.json`.

**Test databases**
- PGlite, in process, for every constraint and handler test. It runs on Windows with nothing installed.
- A second CI job runs the tests that need real concurrency against Postgres 17 in a GitHub Actions service container.
- Local development uses PGlite on disk in a gitignored folder. No one installs a database.

**Schema rules, enforced by tests that walk the schema**
- Every synced table carries `id` (UUIDv7, made by the client), `space_id`, `version` and `deleted_at`, from one column helper.
- Uniqueness on a synced table is a partial index `WHERE deleted_at IS NULL`.
- Enums are `text` plus `CHECK`.
- No foreign key runs from one feature's table into another feature's.

**Tooling**
- Biome, with the zone import rules at error. No ESLint.
- A TypeScript config per zone in `features/` and `platform/`, each registered with the boundary scan when it declares `paths`.
- `typecheck` and `test` scripts on `@tsa/platform` and `@tsa/features`, which is all the CI `tools` job needs to pick them up.
- The web app depends on both packages and transpiles them (`transpilePackages`).

## 6. Slice C: identity

- **better-auth**, pinned to an exact version at or above 1.7.6, on the platform's pool and in the same migration history. Its tables are `user`, `session`, `account`, `verification`, and a rate-limit table so that limits survive across function instances. The `expo()` server plugin is on, for the phone in phase 3.
- **Sign-up** needs the correct `ACCESS_CODE`, compared in constant time, with one neutral error for every failure. **If `ACCESS_CODE` is unset, sign-up is closed.** From slice D, a valid invite token is accepted in its place.
- **Sign-in** is email and password. Email is not verified, so nothing is ever granted because of an email address.
- **Sessions** last 90 days. The device list is phase 2's, as the master spec has it.
- **Instance admin** is a role on the user row. A step in the migrate job gives it to every existing user listed in `ADMIN_USER_IDS` and takes it from anyone else. The list is a GitHub Actions variable, because that job is the only thing that reads it; the app reads the role from the database. Impersonation is off.
- **Password reset** is admin-assisted, and in phase 1 it is a break-glass script only. It takes the database URL from the environment, holds no secret, and revokes the user's sessions.
- **Pages:** `/login`, `/signup` and a minimal `/account` (who you are, sign out).
- **The wall** covers `/app`, `/admin` and `/account`. It fails closed when `BETTER_AUTH_SECRET` or the database is missing: those paths and the auth routes answer 503, and public pages still render. The explorer and "being rebuilt" are public; previews are already behind Vercel's own sign-in.
- **Mobile:** no change, except that the boundary scan learns that `@better-auth/expo/client` is the phone's entry and the package root is the server's.

## 7. Slice D: groups, trips and permissions as commands

### 7.1 Modules

All inside `@tsa/platform`:

| Module | Holds |
|---|---|
| `db` | The pool, the column helper, the migration runner |
| `registry` | The manifest and command types (`core`), read by every manifest |
| `sync` | The push pipeline (`server`) |
| `identity` | The better-auth setup, the sign-up rule, the admin seed |
| `groups` | Groups, members, invites and trips, with their commands |
| `access` | Roles, switches and the resolver (`core`, pure TypeScript the phone reuses), and the switch commands |

### 7.2 Tables

Twelve land in phase 1: the five identity tables of §6, and these seven.

| Table | What a row is | Rules the database enforces |
|---|---|---|
| `sync_space` | One space: a group, a trip, a user or a community | `kind` is one of the four; `version` only rises |
| `group` | A group, shared or personal | At most one personal group per user |
| `member` | A person in a group, with or without an account | The display name is unique among a group's current members. A group has exactly one owner at all times. A person is never deleted, only marked as left. `user_id` is set to null when the account goes. |
| `trip` | A trip in a group: name, dates or a length, countries | It belongs to its group. It is at most 60 days long. Each country is a two-letter code. |
| `trip_member` | A role override or a guest's access for one trip | The trip and the member belong to the same group |
| `capability_grant` | One switch, set for a group or for a trip | One row per switch and scope |
| `invite` | A link into a group, or into one trip as a guest | The token is stored hashed and is at least 128 bits. It expires (14 days by default), may carry a use limit, and can be revoked. |

Rows of a group live in the group's space; a trip and its rows live in the trip's own space. `sync_command`, `share_link`, `blob`, the place tables, `content_report` and `signal_event` wait for the phases that use them.

### 7.3 A command

A command is data plus a handler:

- a name and a version (`group.rename`, version 1);
- a zod schema for its input;
- the spaces it writes, worked out from the input;
- who may run it: a fixed role rule, or a switch;
- the handler, `(tx, cmd, ctx) => result`.

A platform module exports its commands from `server/index.ts`. The generated registry collects them, and collects each feature's the same way. Two commands with one name and version stop the build.

Nothing in the repo writes to the database any other way: no one-off API route, no Server Action. The identity tables are the exception, because better-auth owns them.

### 7.4 The push route

`POST /api/sync/push` lives in the web app, because only the apps may combine the platform's and the features' registries. It requires the `x-sync-client` header and a session. Its body is a list of commands, each `{ id, name, version, input }`, where `id` is made by the client.

For each command, in order, in its own transaction:

1. There is a session, or the answer is `paused`. The command runs as the session's user.
2. Lock the declared spaces in id order and raise each `version`.
3. Check membership, then the role rule or the switch (§7.6). The check comes after the lock, so a role change in the same space cannot race it. A rejection rolls the version back with everything else.
4. Validate the input, then run the handler.
5. Postgres checks every key, check and trigger.
6. Commit.

The answer for each command is one of:
- `applied`, with the handler's result and the new space versions;
- `rejected`, with a stable reason code, for a business rule or a constraint;
- `retry`, for a serialization failure, a deadlock or a lost connection;
- `paused`, when there is no session.

**What phase 1 leaves out, on purpose.** Results are not stored, so a command sent twice may run twice. Nothing retries yet, and because row ids come from the client, most replays fail on a primary key and come back `rejected`. Phase 2 adds stored results, duplicate detection and pull without changing a handler.

**A command may not write a space it did not declare.** The pipeline sets the declared spaces for the transaction, and a trigger on every synced table refuses a row whose `space_id` is not among them. The column helper attaches the trigger, so a new table cannot forget it.

### 7.5 The commands

All 28 of the catalogue's first-release platform commands:

- **Groups (12):** create, rename, addPerson, createInvite, revokeInvite, redeemInvite, setRole, renameMember, removeMember, leave, transferOwnership, delete.
- **Trips (12):** create, rename, setDates, setCountries, setTravellers, addGuest, createGuestInvite, removeGuest, setRoleOverride, archive, unarchive, delete.
- **Access (4):** set and reset a switch, for a group and for a trip.

Three things differ from the catalogue until later phases:

- An invite link is returned once, in the result of the command that creates it. Phase 2 moves it into its creator's private space.
- Sign-up accepts an invite token, but the page an invite link opens is phase 3's.
- `trip.setCountries` accepts any two-letter code. Phase 4 checks it against `reference/`.

`trip.delete` has nothing to refuse yet: the rule about expenses arrives with Money.

**Personal group.** Created when the account is created. The push route checks for it again on the user's first command, so a failure between the two heals itself.

### 7.6 Permissions

One pure function, used by the push route for every command and reused by the phone later:

1. The person's role is the trip's override if there is one, otherwise their role in the group.
2. A switch is the trip's setting if there is one, otherwise the group's, otherwise the default in the app's manifest.

The roles are owner, organiser, member and viewer. Organisers invite. Only the owner removes people, changes roles and changes a group's defaults.

## 8. Slice E: template and guardrails

**`features/_template`** holds every part a mini-app can have: `CLAUDE.md`, `manifest.ts`, `core`, `client`, `server`, `db`, `web`, `mobile`, `tests`, `e2e` and `docs`. The registry generator skips it.

**The scaffold command** copies the template to `features/<name>/` and writes the one-line route files in both apps. In the web app they go under `app/app/<name>/`, behind the wall. Phase 3 moves them with the shell.

**The gate test** runs in CI. It scaffolds an empty app into a throwaway copy of the repo and runs every guard on it: registry generation, the boundary scan, Biome, the type-checks, the schema rules, the migration check and the new app's own tests. Nothing scaffolded is committed.

**Guardrails that land here**
- The global-only scan: no country special case in `features/` or `platform/`.
- The design-token and GeoNames-credit scans, re-rooted to cover `features/`, `platform/` and `reference/`.
- The diff-scope warning: a feature's pull request touches only that feature's folders and new migration folders.
- The Playwright file-name conventions: `x.spec.ts`, `x.signed-out.spec.ts`, `x.mobile.spec.ts`.
- Wall exemptions read from each manifest's public routes.

**Claude files**
- A tracked root `CLAUDE.md`: a short repo map, and an import of the web app's Next-managed `AGENTS.md`.
- `.claude/rules/platform/*.md`, always loaded, under 200 lines in all.
- `.claude/rules/platform-internals.md`, loaded for `platform/**` only.
- The `new-mini-app` skill, which runs the scaffold command.
- Two reviewer agents: boundaries, and data integrity.
- `features/_template/CLAUDE.md` and `apps/mobile/CLAUDE.md`.
- `.claude` in `.vercelignore`.

## 9. Slice F: backups and the phase gate

- **Nightly:** a scheduled workflow dumps production's database over the unpooled URL, encrypts the dump with age, and uploads it to the owner's R2 bucket under a dated name. The bucket keeps 30 days. A dump is never an Actions artifact, because the repository is public.
- **Two recipients.** Each dump is encrypted to the owner's key, whose private half stays offline with the owner, and to a CI key, whose private half is a GitHub secret. The owner's key recovers everything if GitHub is lost. Anyone who reaches the repository's secrets could read the dumps, which hold only test data until release; phase 6 revisits this before real data exists.
- **The alarm.** A failed nightly run is the signal that the database or the backup is broken.
- **The restore test** downloads the newest dump, decrypts it with the CI key, loads it into a throwaway Postgres in CI, and checks the schema against the migration history and the row counts against the dump's own listing. It runs monthly and on demand.
- **The phase gate:** the scaffold test of slice E is green, a nightly backup has run, and the restore test has been green once.

## 10. The owner's tasks

Each is written out step by step in its slice's plan. The executing agent asks and waits; it never does these itself.

| Slice | Task |
|---|---|
| B | Install Neon from the Vercel Marketplace. Rename the Vercel project. Remove the dead database URL. Add the Neon API key, the Neon project id and production's unpooled database URL as GitHub secrets. |
| C | Set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `ACCESS_CODE` in Vercel, for Preview and Production. After the first sign-up, add `ADMIN_USER_IDS` as a GitHub Actions variable. |
| F | Create the Cloudflare account, the R2 bucket and its access token. Generate the owner's age key and keep its private half. Add the R2 secrets and the CI key. |

Merging stays the owner's, unless the owner says otherwise for a slice.

## 11. Where this departs from the master spec

| Master spec | Phase 1 |
|---|---|
| A Testcontainers job for real Postgres (§3) | A GitHub Actions service container. Same purpose, less machinery, and neither runs on the owner's machine without Docker. |
| "Migrations run once per production deploy from a CI job" (§3) | A CI job on every push to `main`, plus the rule that every migration is safe before and after its code. Deploys are not gated on it until phase 6. |
| "Sign-up needs `ACCESS_CODE` or a group invite" (§0); unset means open today | Unset means closed. |
| Handlers "registered through the same glob as features" (§12) | Through the generated registry, which replaced the glob in §0. |
| Membership and the switch are checked before the spaces are locked (§4, steps 2 and 3) | Checked after the lock, inside the same transaction, so a concurrent role change cannot slip between the two. |
| The invite link lives in its creator's user space (catalogue) | Returned once in the command's result until phase 2. |
| Trip countries validated against `reference/` (catalogue) | Two-letter codes only until phase 4. |
| A backup key the CI never sees is implied by "encrypted with age" (§13) | Two recipients, one of them a CI secret, so the restore test can run. |
| The spec tree's `apps/web/src/app/(signed-in)/app/<name>` (§0) | `apps/web/app/app/<name>` until phase 3 adds `src/` and the shell. |

## 12. What each plan must verify before it relies on it

- The exact current releases of better-auth, Drizzle and drizzle-kit, PGlite, Biome and the Neon integration, and that better-auth's Drizzle adapter runs on PGlite.
- How the Neon integration names a preview's branch, and how the CI job finds and migrates it.
- Whether Cloudflare needs a payment method on file to enable R2's free tier.
- That Next's dev server starts with an on-disk PGlite database on this machine, where Smart App Control blocks unsigned binaries with no reputation.
- What the secret-carrying CI jobs need so that a pull request from a fork can never read a secret.

## 13. What phase 1 leaves for later

- **Phase 2:** `sync_command`, stored results and duplicate detection, pull, the outbox on both clients, user spaces, the device list.
- **Phase 3:** the shell and launcher, native sign-up, the invite landing page, an admin screen, the product name and with it the `CIP_` and `cip-` names, `src/` in the web app.
- **Phase 4:** the dormant trip, money, tickets, journal and briefing code; `reference/` and the country check; splitting the agent's long project memory by feature.
- **Phase 6:** gating deploys on migrations, the backup key arrangement, the domain, every paid plan.

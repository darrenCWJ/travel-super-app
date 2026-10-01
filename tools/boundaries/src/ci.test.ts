import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  filterGroups,
  filtersWithoutFailIfNoMatch,
  gateProblems,
  jobsNotNeededBy,
  matchesPattern,
  namedTestFiles,
  parseWorkflow,
  unaccountedFiles,
  type Workflow,
} from "./ci";
import { trackedFiles } from "./tracked";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const packageDir = fileURLToPath(new URL("..", import.meta.url));

// The filter outputs each job's `if:` reads. A job that is added, or a gate that changes, has to
// change this table too: that is the review the gates used to get only by reading.
const GATES = {
  tools: ["shared", "web", "mobile"],
  web: ["shared", "web"],
  e2e: ["shared", "web"],
  mobile: ["shared", "mobile"],
};

// Paths that deliberately run no job. Everything else has to match a filter group, so a new
// top-level folder or a new app fails here until it is given a group or a line below.
const RUNS_NOTHING = [
  "docs/**", // specs, plans and notes: no code or test reads them
  "README.md",
  ".gitignore",
  ".claude/**", // editor and agent settings
  // The refresh workflows run on a schedule or by hand, and no CI job exercises them.
  ".github/workflows/refresh-airports.yml",
  ".github/workflows/refresh-cities.yml",
  ".github/workflows/refresh-climate.yml",
];

describe("the CI workflow", () => {
  const workflow = parseWorkflow(readFileSync(join(root, ".github/workflows/ci.yml"), "utf8"));

  it("has a filter group, or a line in the run-nothing list, for every tracked file", () => {
    expect(unaccountedFiles(trackedFiles(root), filterGroups(workflow), RUNS_NOTHING)).toEqual([]);
  });

  it("gates each job on the filter outputs the table gives it", () => {
    expect(gateProblems(workflow, GATES)).toEqual([]);
  });

  it("has ci-ok wait for every other job", () => {
    expect(jobsNotNeededBy(workflow, "ci-ok")).toEqual([]);
  });

  it("puts --fail-if-no-match on every --filter", () => {
    expect(filtersWithoutFailIfNoMatch(workflow)).toEqual([]);
  });

  // Vitest runs the files it finds and says nothing about a name that matches none, so a guard
  // that was renamed or deleted would drop out of the by-name step without turning it red.
  it("names this package's repo guards in its by-name step, and each of them exists", () => {
    expect(namedTestFiles(workflow)).toEqual({ "@tsa/boundaries": ["src/repo.test.ts", "src/ci.test.ts"] });
    const missing = namedTestFiles(workflow)["@tsa/boundaries"].filter((file) => !existsSync(join(packageDir, file)));
    expect(missing).toEqual([]);
  });
});

// A small workflow of the same shape as ci.yml. Each test below breaks one thing in a copy of it.
const FILTERS = "shared:\n  - 'tools/**'\n  - 'package.json'\nweb:\n  - 'apps/web/**'\n";
const BOTH = "${{ needs.changes.outputs.shared == 'true' || needs.changes.outputs.web == 'true' }}";
const TABLE = { tools: ["shared", "web"], web: ["shared", "web"] };
function sound(): Workflow {
  return {
    jobs: {
      changes: {
        outputs: { shared: "${{ steps.filter.outputs.shared }}", web: "${{ steps.filter.outputs.web }}" },
        steps: [{ uses: "actions/checkout@v5" }, { id: "filter", uses: "dorny/paths-filter@v4", with: { filters: FILTERS } }],
      },
      tools: { needs: "changes", if: BOTH, steps: [{ run: 'pnpm --filter "!@x/web" --fail-if-no-match test' }] },
      web: { needs: "changes", if: BOTH, steps: [{ run: "pnpm --filter @x/web --fail-if-no-match test" }] },
      "ci-ok": { needs: ["changes", "tools", "web"], if: "${{ always() }}", steps: [{ run: "echo ok" }] },
    },
  };
}
/** The sound workflow with one change made to it. */
function broken(change: (workflow: Workflow) => void): Workflow {
  const workflow = sound();
  change(workflow);
  return workflow;
}

describe("matchesPattern", () => {
  it.each([
    ["apps/web/**", "apps/web/app/trip/[id]/page.tsx", true],
    ["apps/web/**", "apps/web/.env.example", true],
    ["apps/web/**", "apps/webby/page.tsx", false],
    ["apps/web/**", "apps/mobile/src/app/index.tsx", false],
    ["tools/**", "apps/web/tools/x.ts", false],
    ["package.json", "package.json", true],
    ["package.json", "apps/web/package.json", false],
    [".github/workflows/ci.yml", ".github/workflows/ci.yml", true],
  ])("%s against %s → %s", (pattern, path, matched) => {
    expect(matchesPattern(pattern, path)).toBe(matched);
  });

  it.each(["**/*.md", "apps/*/package.json", "src/**/*.ts", "!docs/**", "apps/web/*", "{a,b}/**", "docs/?.md"])(
    "refuses %s, a shape it does not understand",
    (pattern) => {
      expect(() => matchesPattern(pattern, "docs/x.md")).toThrow(`unsupported pattern "${pattern}"`);
    },
  );
});

describe("unaccountedFiles", () => {
  const tracked = ["package.json", "tools/a.ts", "apps/web/page.tsx", "docs/plan.md", "README.md"];

  it("names nothing when every file matches a group or the run-nothing list", () => {
    expect(unaccountedFiles(tracked, filterGroups(sound()), ["docs/**", "README.md"])).toEqual([]);
  });

  it("names the files that match neither", () => {
    expect(unaccountedFiles([...tracked, "packages/db/index.ts", "LICENSE"], filterGroups(sound()), ["docs/**", "README.md"])).toEqual([
      "packages/db/index.ts",
      "LICENSE",
    ]);
  });

  it("names a group's files once the filter loses that group", () => {
    const withoutWeb = broken((workflow) => {
      workflow.jobs.changes.steps![1].with = { filters: "shared:\n  - 'tools/**'\n  - 'package.json'\n" };
    });
    expect(unaccountedFiles(tracked, filterGroups(withoutWeb), ["docs/**", "README.md"])).toEqual(["apps/web/page.tsx"]);
  });

  it("refuses an unsupported pattern even when no file gets as far as it", () => {
    expect(() => unaccountedFiles(["package.json"], { shared: ["package.json", "**/*.md"] }, [])).toThrow('unsupported pattern "**/*.md"');
    expect(() => unaccountedFiles(["package.json"], { shared: ["package.json"] }, ["**/*.md"])).toThrow('unsupported pattern "**/*.md"');
  });
});

describe("filterGroups", () => {
  it("reads the groups out of the filter step's text", () => {
    expect(filterGroups(sound())).toEqual({ shared: ["tools/**", "package.json"], web: ["apps/web/**"] });
  });

  it("throws when the changes job has no filter step to read", () => {
    const noFilter = broken((workflow) => {
      workflow.jobs.changes.steps = [{ uses: "actions/checkout@v5" }];
    });
    expect(() => filterGroups(noFilter)).toThrow('no step with id "filter"');
  });
});

describe("gateProblems", () => {
  it("finds nothing wrong with a workflow whose gates follow the table", () => {
    expect(gateProblems(sound(), TABLE)).toEqual([]);
  });

  it.each<[string, (workflow: Workflow) => void, string]>([
    [
      "a gate that reads an output under a misspelt name",
      (w) => {
        w.jobs.web.if = BOTH.replace("outputs.web", "outputs.wbe");
      },
      "job web is gated by ${{ needs.changes.outputs.shared == 'true' || needs.changes.outputs.wbe == 'true' }}, not by " + BOTH,
    ],
    [
      "a gate that joins its outputs with && instead of ||",
      (w) => {
        w.jobs.web.if = BOTH.replace("||", "&&");
      },
      "job web is gated by ${{ needs.changes.outputs.shared == 'true' && needs.changes.outputs.web == 'true' }}, not by " + BOTH,
    ],
    [
      "a job with no gate at all",
      (w) => {
        delete w.jobs.web.if;
      },
      "job web is gated by nothing, not by " + BOTH,
    ],
    [
      "a job the table does not know",
      (w) => {
        w.jobs.mobile = { needs: "changes", if: BOTH, steps: [] };
      },
      "job mobile has no row in the gate table",
    ],
    [
      "a table row for a job the workflow does not have",
      (w) => {
        delete w.jobs.tools;
      },
      "the gate table names job tools, which the workflow does not have",
    ],
    [
      "a gated job that does not wait for the filter",
      (w) => {
        delete w.jobs.web.needs;
      },
      "job web reads the filter's outputs without needing the changes job",
    ],
    [
      "an output the changes job does not declare",
      (w) => {
        delete w.jobs.changes.outputs!.web;
      },
      "jobs.changes.outputs.web is not declared, not ${{ steps.filter.outputs.web }}",
    ],
    [
      "an output wired to another group's result",
      (w) => {
        w.jobs.changes.outputs!.web = "${{ steps.filter.outputs.shared }}";
      },
      "jobs.changes.outputs.web is ${{ steps.filter.outputs.shared }}, not ${{ steps.filter.outputs.web }}",
    ],
    [
      "an output that is not a filter group",
      (w) => {
        w.jobs.changes.steps![1].with = { filters: "shared:\n  - 'tools/**'\n" };
      },
      "web is not a filter group",
    ],
    [
      "a filter group that no job reads",
      (w) => {
        w.jobs.changes.steps![1].with = { filters: `${FILTERS}docs:\n  - 'docs/**'\n` };
      },
      "filter group docs is read by no job: a change only it matches would run nothing",
    ],
  ])("reports %s", (_name, change, problem) => {
    expect(gateProblems(broken(change), TABLE)).toContain(problem);
  });
});

describe("jobsNotNeededBy", () => {
  it("names nothing when the summary job needs every other job", () => {
    expect(jobsNotNeededBy(sound(), "ci-ok")).toEqual([]);
  });

  it("names a job the summary job does not wait for", () => {
    const withMobile = broken((workflow) => {
      workflow.jobs.mobile = { needs: "changes", if: BOTH, steps: [] };
    });
    expect(jobsNotNeededBy(withMobile, "ci-ok")).toEqual(["mobile"]);
  });

  it("reads a single need written as a string", () => {
    const oneNeed = broken((workflow) => {
      workflow.jobs["ci-ok"].needs = "tools";
    });
    expect(jobsNotNeededBy(oneNeed, "ci-ok")).toEqual(["changes", "web"]);
  });

  it("throws when the workflow has no such summary job", () => {
    expect(() => jobsNotNeededBy(sound(), "all-green")).toThrow("the workflow has no all-green job");
  });
});

describe("filtersWithoutFailIfNoMatch", () => {
  it("names nothing when every --filter carries the flag", () => {
    expect(filtersWithoutFailIfNoMatch(sound())).toEqual([]);
  });

  it("names each run line that filters without it, in a multi-line script too", () => {
    const loose = broken((workflow) => {
      workflow.jobs.web.steps = [
        { run: "pnpm --filter @x/web test" },
        { run: "echo start\npnpm --filter @x/web --fail-if-no-match typecheck\npnpm --filter @x/web build\n" },
        { run: "pnpm install --frozen-lockfile" },
      ];
    });
    expect(filtersWithoutFailIfNoMatch(loose)).toEqual(["web: pnpm --filter @x/web test", "web: pnpm --filter @x/web build"]);
  });
});

describe("namedTestFiles", () => {
  it("lists the files each `exec vitest run` step names, by package, without the flags", () => {
    const named = broken((workflow) => {
      workflow.jobs.tools.steps = [
        { run: "pnpm --filter @x/tools --fail-if-no-match exec vitest run src/a.test.ts src/b.test.ts --reporter=dot" },
        { run: "pnpm --filter @x/tools --fail-if-no-match test" },
        { run: "pnpm --filter @x/other --fail-if-no-match exec vitest run src/c.test.ts" },
        { run: "pnpm --filter @x/tools --fail-if-no-match exec vitest run src/d.test.ts" },
      ];
    });
    expect(namedTestFiles(named)).toEqual({
      "@x/tools": ["src/a.test.ts", "src/b.test.ts", "src/d.test.ts"],
      "@x/other": ["src/c.test.ts"],
    });
  });

  it("lists nothing for a workflow with no such step", () => {
    expect(namedTestFiles(sound())).toEqual({});
  });
});

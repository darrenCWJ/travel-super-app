import { parse } from "yaml";

/**
 * Checks on .github/workflows/ci.yml, as pure functions over the parsed file so that each can be
 * shown a broken workflow without the real one being edited. The workflow gates every job on a
 * path filter, and a job that is skipped counts as success: a path in no filter group, or a gate
 * that reads a name the filter does not set, leaves `ci-ok` green with nothing having run. A job
 * the summary check does not wait for can fail without turning it red.
 */

/** The parts of a GitHub Actions workflow these checks read. */
export interface Step {
  id?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}
export interface Job {
  needs?: string | string[];
  if?: string;
  outputs?: Record<string, string>;
  steps?: Step[];
}
export interface Workflow {
  jobs: Record<string, Job>;
}

export function parseWorkflow(text: string): Workflow {
  return parse(text) as Workflow;
}

/** The job that runs the path filter, and the id of the filter step inside it. */
const FILTER_JOB = "changes";
const FILTER_STEP = "filter";

/** The path filter's groups, name → patterns: the YAML text handed to the step with id "filter". */
export function filterGroups(workflow: Workflow): Record<string, string[]> {
  const filters = workflow.jobs[FILTER_JOB]?.steps?.find((step) => step.id === FILTER_STEP)?.with?.filters;
  if (typeof filters !== "string") throw new Error(`jobs.${FILTER_JOB} has no step with id "${FILTER_STEP}" and a filters text`);
  return parse(filters) as Record<string, string[]>;
}

const GLOB_CHARACTERS = /[*?[\]{}!]/;

/** The folder a "dir/**" pattern covers, or null for a pattern that is an exact path. Any other shape throws. */
function coveredFolder(pattern: unknown): string | null {
  if (typeof pattern === "string") {
    const folder = pattern.endsWith("/**") ? pattern.slice(0, -"**".length) : null;
    if (!GLOB_CHARACTERS.test(folder ?? pattern)) return folder;
  }
  throw new Error(`unsupported pattern ${JSON.stringify(pattern)}: this check understands "dir/**" and an exact path, nothing else`);
}

/**
 * Whether `path` matches `pattern`, for the two shapes the filter uses: "dir/**" (everything under
 * dir/, dot-files included, as the filter matches them) and an exact path. A fancier pattern throws,
 * so that it has to be taught here rather than matched wrongly.
 */
export function matchesPattern(pattern: string, path: string): boolean {
  const folder = coveredFolder(pattern);
  return folder === null ? path === pattern : path.startsWith(folder);
}

/**
 * The tracked files that no filter group and no entry of `runsNothing` matches: a change to one of
 * them alone would run no job. Every pattern is checked for its shape first, matched or not.
 */
export function unaccountedFiles(tracked: string[], groups: Record<string, string[]>, runsNothing: string[]): string[] {
  const patterns = [...Object.values(groups).flat(), ...runsNothing];
  for (const pattern of patterns) coveredFolder(pattern);
  return tracked.filter((path) => !patterns.some((pattern) => matchesPattern(pattern, path)));
}

function needsOf(job: Job): string[] {
  return job.needs === undefined ? [] : [job.needs].flat();
}

/**
 * What is wrong with the jobs' gates. `table` gives, for each job the filter gates, the filter
 * outputs its `if:` reads; the gate has to be exactly those outputs, each compared with 'true' and
 * joined by ||. A job in the workflow but not in the table (the filter job and the summary job
 * aside) is a problem too, as is a filter group that no job reads.
 */
export function gateProblems(workflow: Workflow, table: Record<string, string[]>, summary = "ci-ok"): string[] {
  const problems: string[] = [];
  const groups = Object.keys(filterGroups(workflow));
  const outputs = workflow.jobs[FILTER_JOB]?.outputs ?? {};
  for (const name of Object.keys(workflow.jobs)) {
    if (name !== FILTER_JOB && name !== summary && !(name in table)) problems.push(`job ${name} has no row in the gate table`);
  }
  for (const [name, reads] of Object.entries(table)) {
    const job = workflow.jobs[name];
    if (job === undefined) {
      problems.push(`the gate table names job ${name}, which the workflow does not have`);
      continue;
    }
    const gate = "${{ " + reads.map((output) => `needs.${FILTER_JOB}.outputs.${output} == 'true'`).join(" || ") + " }}";
    if (job.if !== gate) problems.push(`job ${name} is gated by ${job.if ?? "nothing"}, not by ${gate}`);
    if (!needsOf(job).includes(FILTER_JOB)) problems.push(`job ${name} reads the filter's outputs without needing the ${FILTER_JOB} job`);
    for (const output of reads) {
      const source = "${{ steps." + FILTER_STEP + ".outputs." + output + " }}";
      if (outputs[output] !== source) problems.push(`jobs.${FILTER_JOB}.outputs.${output} is ${outputs[output] ?? "not declared"}, not ${source}`);
      if (!groups.includes(output)) problems.push(`${output} is not a filter group`);
    }
  }
  const read = new Set(Object.values(table).flat());
  for (const group of groups) {
    if (!read.has(group)) problems.push(`filter group ${group} is read by no job: a change only it matches would run nothing`);
  }
  return problems;
}

/** The jobs that the summary job does not wait for: one of them could fail and leave it green. */
export function jobsNotNeededBy(workflow: Workflow, summary: string): string[] {
  const job = workflow.jobs[summary];
  if (job === undefined) throw new Error(`the workflow has no ${summary} job`);
  const needs = needsOf(job);
  return Object.keys(workflow.jobs).filter((name) => name !== summary && !needs.includes(name));
}

/** Every line of every `run:` script, with the job it belongs to. */
function runLines(workflow: Workflow): [job: string, line: string][] {
  return Object.entries(workflow.jobs).flatMap(([name, job]) =>
    (job.steps ?? []).flatMap((step) => (step.run ?? "").split("\n").map((line): [string, string] => [name, line.trim()])),
  );
}

/**
 * The `run:` lines that pick packages with --filter but lack --fail-if-no-match. pnpm exits 0 when
 * a filter selects no package, so such a line would turn into a silent no-op after a rename.
 */
export function filtersWithoutFailIfNoMatch(workflow: Workflow): string[] {
  return runLines(workflow)
    .filter(([, line]) => line.includes("--filter") && !line.includes("--fail-if-no-match"))
    .map(([job, line]) => `${job}: ${line}`);
}

const NAMED_TESTS = /--filter\s+(\S+)\s.*\bexec vitest run\s+(.+)$/;

/** The test files that `pnpm --filter <package> … exec vitest run <files>` lines name, by package. */
export function namedTestFiles(workflow: Workflow): Record<string, string[]> {
  const named: Record<string, string[]> = {};
  for (const [, line] of runLines(workflow)) {
    const match = NAMED_TESTS.exec(line);
    if (match === null) continue;
    const files = match[2].split(/\s+/).filter((word) => !word.startsWith("-"));
    named[match[1]] = [...(named[match[1]] ?? []), ...files];
  }
  return named;
}

import { parse } from "yaml";

/**
 * Checks on .github/workflows/ci.yml, as pure functions over the parsed file so that each can be
 * shown a broken workflow without the real one being edited. The workflow gates every job on a
 * path filter, and a job that is skipped counts as success: a path in no filter group, or a gate
 * that reads a name the filter does not set, leaves `ci-ok` green with nothing having run. A job
 * the summary check does not wait for can fail without turning it red, and so can one that may
 * continue on error. The summary job's own shape and the workflow's triggers are pinned as well.
 */

/** The parts of a GitHub Actions workflow these checks read. */
export interface Step {
  id?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, unknown>;
  "continue-on-error"?: unknown;
}
export interface Job {
  needs?: string | string[];
  if?: string;
  outputs?: Record<string, string>;
  steps?: Step[];
  "continue-on-error"?: unknown;
}
export interface Workflow {
  on?: unknown;
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

const ALWAYS = "${{ always() }}";
const A_JOB_FAILED = "${{ contains(needs.*.result, 'failure') || contains(needs.*.result, 'cancelled') }}";

/**
 * What is wrong with the summary job's own shape. It has to run whatever happened to the jobs it
 * waits for: without `always()` a failed job leaves it skipped, and a skipped job counts as
 * success. And its first step has to fail it when one of those jobs failed or was cancelled.
 */
export function summaryProblems(workflow: Workflow, summary = "ci-ok"): string[] {
  const job = workflow.jobs[summary];
  if (job === undefined) throw new Error(`the workflow has no ${summary} job`);
  const first = job.steps?.[0];
  const problems: string[] = [];
  if (job.if !== ALWAYS) problems.push(`job ${summary} is gated by ${job.if ?? "nothing"}, not by ${ALWAYS}`);
  if (first?.if !== A_JOB_FAILED) problems.push(`the first step of ${summary} is gated by ${first?.if ?? "nothing"}, not by ${A_JOB_FAILED}`);
  if (first?.run !== "exit 1") problems.push(`the first step of ${summary} runs ${first?.run ?? "nothing"}, not exit 1`);
  return problems;
}

/**
 * The jobs and the steps that carry `continue-on-error`, whatever its value. On a step it keeps the
 * job from failing when the step fails, and on a job it keeps the run from failing when the job
 * does: either way a failure the summary job exists to report could pass.
 */
export function continueOnError(workflow: Workflow): string[] {
  return Object.entries(workflow.jobs).flatMap(([name, job]) => [
    ...("continue-on-error" in job ? [`job ${name}`] : []),
    ...(job.steps ?? []).flatMap((step, index) => ("continue-on-error" in step ? [`job ${name}, step ${index + 1}`] : [])),
  ]);
}

/**
 * What is wrong with the workflow's triggers: `on.push.branches` has to be ["**"], a push to any
 * branch, and `on.pull_request` has to be there.
 */
export function triggerProblems(workflow: Workflow): string[] {
  const on = workflow.on;
  // Anything but a map of triggers (a list of event names, a single name, nothing) has neither key.
  const triggers: { push?: { branches?: unknown } | null; pull_request?: unknown } = typeof on === "object" ? { ...on } : {};
  const branches = triggers.push?.branches;
  const problems: string[] = [];
  if (JSON.stringify(branches) !== '["**"]') problems.push(`on.push.branches is ${branches === undefined ? "not set" : JSON.stringify(branches)}, not ["**"]`);
  if (!("pull_request" in triggers)) problems.push("on.pull_request is missing");
  return problems;
}

/** Every line of every `run:` script, with the job it belongs to. */
function runLines(workflow: Workflow): [job: string, line: string][] {
  return Object.entries(workflow.jobs).flatMap(([name, job]) =>
    (job.steps ?? []).flatMap((step) => (step.run ?? "").split("\n").map((line): [string, string] => [name, line.trim()])),
  );
}

/** `-F`, the short form of --filter, as a word of its own on a pnpm line (grep and others have a -F too). */
const SHORT_FILTER = /\bpnpm\b.*\s-F\s/;

/**
 * The `run:` lines that pick packages with --filter or -F but lack --fail-if-no-match. pnpm exits 0
 * when a filter selects no package, so such a line would turn into a silent no-op after a rename.
 */
export function filtersWithoutFailIfNoMatch(workflow: Workflow): string[] {
  return runLines(workflow)
    .filter(([, line]) => (line.includes("--filter") || SHORT_FILTER.test(line)) && !line.includes("--fail-if-no-match"))
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

// The problems the language server finds in the project's files: errors and warnings, by file
// and position. Monaco keeps them as markers; this is the list the editor shows of them.

export interface Problem {
  path: string;
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning";
  /** The rule it breaks, such as "type-mismatch" (spec/check.md section 3). */
  code?: string;
}

/** A marker as Monaco has it, with its model's path; severity is MarkerSeverity: 8 error, 4 warning. */
export interface Marker {
  path: string;
  line: number;
  column: number;
  message: string;
  severity: number;
  code?: string;
}

/** collect turns markers into problems, in the order of file, line and column, without hints. */
export function collect(markers: Marker[]): Problem[] {
  return markers
    .filter((m) => m.severity >= 4)
    .map((m) => ({ ...m, severity: m.severity >= 8 ? ("error" as const) : ("warning" as const) }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line || a.column - b.column));
}

export class ProblemStore {
  private state: readonly Problem[] = [];
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): readonly Problem[] => this.state;

  set(markers: Marker[]) {
    this.state = collect(markers);
    for (const listener of this.listeners) listener();
  }
}

/** The codes of the errors that stop a program before it runs: ant run reports them itself. */
const loadErrors = new Set(["syntax", "missing-module", "import"]);

/**
 * runNotes are the lines the console shows before a run, naming the errors the checker found
 * in the Ant files, at most max of them. A program that will not load says why itself, so then
 * there are none.
 */
export function runNotes(problems: readonly Problem[], max = 5): string[] {
  const errors = problems.filter((p) => p.severity === "error" && p.path.endsWith(".ant"));
  if (errors.some((p) => p.code !== undefined && loadErrors.has(p.code))) return [];
  const notes = errors.slice(0, max).map(describe);
  if (errors.length > max) notes.push(`and ${errors.length - max} more errors, in Problems\n`);
  return notes;
}

/** describe is a problem as a line of the console: a link to it, and the message. */
export function describe(p: Problem): string {
  return `${p.path}:${p.line}:${p.column}: ${p.message}\n`;
}

// The problems the language server finds in the project's files: errors and warnings, by file
// and position. Monaco keeps them as markers; this is the list the editor shows of them.

export interface Problem {
  path: string;
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning";
}

/** A marker as Monaco has it, with its model's path; severity is MarkerSeverity: 8 error, 4 warning. */
export interface Marker {
  path: string;
  line: number;
  column: number;
  message: string;
  severity: number;
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

/** describe is a problem as a line of the console: a link to it, and the message. */
export function describe(p: Problem): string {
  return `${p.path}:${p.line}:${p.column}: ${p.message}\n`;
}

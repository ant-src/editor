// The breakpoints the user set: lines by module. During a debug session the debugger binds each
// to a statement, which may be on a later line, or says that it cannot.
import type { BoundBreakpoint } from "../run/runner";

export interface BreakpointsState {
  /** The lines with a breakpoint, ascending, by path. */
  lines: Readonly<Record<string, readonly number[]>>;
  /** Of those, the lines the debugger of the session under way could not bind. */
  unverified: Readonly<Record<string, readonly number[]>>;
}

const none: readonly number[] = [];

export class BreakpointStore {
  private state: BreakpointsState = { lines: {}, unverified: {} };
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): BreakpointsState => this.state;

  private update(state: BreakpointsState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  lines(path: string): readonly number[] {
    return this.state.lines[path] ?? none;
  }

  /** all returns the breakpoints of every module that has some. */
  all(): Record<string, number[]> {
    return Object.fromEntries(Object.entries(this.state.lines).map(([path, lines]) => [path, [...lines]]));
  }

  /** toggle sets a breakpoint on a line, or removes the one there. */
  toggle(path: string, line: number) {
    const lines = this.lines(path);
    this.set(path, lines.includes(line) ? lines.filter((l) => l !== line) : [...lines, line]);
  }

  /** set replaces the breakpoints of a module. */
  set(path: string, lines: readonly number[]) {
    const next = normalize(lines);
    if (same(next, this.lines(path))) return;
    const unverified = (this.state.unverified[path] ?? none).filter((l) => next.includes(l));
    this.update({ lines: put(this.state.lines, path, next), unverified: put(this.state.unverified, path, unverified) });
  }

  /** bind moves each breakpoint to the line the debugger bound it to, and marks the ones it could not bind. */
  bind(path: string, bound: BoundBreakpoint[]) {
    const lines = normalize(bound.map((b) => (b.verified && b.boundLine ? b.boundLine : b.line)));
    const unverified = normalize(bound.filter((b) => !b.verified).map((b) => b.line));
    this.update({
      lines: put(this.state.lines, path, lines),
      unverified: put(this.state.unverified, path, unverified),
    });
  }

  /** endSession forgets what the debugger said: a breakpoint is unverified only while a session runs. */
  endSession() {
    if (Object.keys(this.state.unverified).length > 0) this.update({ ...this.state, unverified: {} });
  }

  /** move gives the breakpoints of a module that moved to its new path. */
  move(from: string, to: string) {
    const lines = this.lines(from);
    if (lines.length === 0) return;
    this.set(to, lines);
    this.remove(from);
  }

  /** remove drops the breakpoints of a module that is gone. */
  remove(path: string) {
    this.set(path, []);
  }
}

function normalize(lines: readonly number[]): number[] {
  return [...new Set(lines)].filter((l) => l >= 1).sort((a, b) => a - b);
}

function same(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((l, i) => l === b[i]);
}

function put(record: Readonly<Record<string, readonly number[]>>, path: string, lines: readonly number[]) {
  const { [path]: _, ...rest } = record;
  return lines.length > 0 ? { ...rest, [path]: lines } : rest;
}

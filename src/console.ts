// The console's text: what the program wrote, and what the editor says about the run. Writes
// are gathered and shown once a frame, so that a program printing in a loop does not hold the
// page, and the oldest text is dropped past a limit.
import type { Stream } from "./run/runner";

export interface Segment {
  id: number;
  stream: Stream;
  text: string;
}

/** How many characters the console keeps. */
export const maxLength = 400_000;

/** A segment grows by the writes to its stream up to this length, then another starts. */
const segmentLength = 8192;

type Schedule = (flush: () => void) => void;

const frame: Schedule = (flush) =>
  typeof requestAnimationFrame === "function" ? requestAnimationFrame(flush) : setTimeout(flush, 16);

export class ConsoleStore {
  private segments: readonly Segment[] = [];
  private pending: [Stream, string][] = [];
  private scheduled = false;
  private ids = 0;
  private length = 0;
  private listeners = new Set<() => void>();

  constructor(private schedule: Schedule = frame) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): readonly Segment[] => this.segments;

  write = (stream: Stream, text: string) => {
    if (text === "") return;
    this.pending.push([stream, text]);
    if (!this.scheduled) {
      this.scheduled = true;
      this.schedule(() => this.flush());
    }
  };

  clear() {
    this.pending = [];
    this.length = 0;
    this.publish([]);
  }

  /** flush shows what was written since the last one. */
  flush() {
    this.scheduled = false;
    if (this.pending.length === 0) return;
    const segments = [...this.segments];
    for (const [stream, text] of this.pending) {
      const last = segments.at(-1);
      if (last && last.stream === stream && last.text.length < segmentLength) {
        segments[segments.length - 1] = { ...last, text: last.text + text };
      } else {
        segments.push({ id: ++this.ids, stream, text });
      }
      this.length += text.length;
    }
    this.pending = [];
    while (this.length > maxLength && segments.length > 1) {
      this.length -= segments.shift()!.text.length;
    }
    this.publish(segments);
  }

  private publish(segments: readonly Segment[]) {
    this.segments = segments;
    for (const listener of this.listeners) listener();
  }
}

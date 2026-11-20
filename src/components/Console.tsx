// The console shows what the program wrote. A position in a file of the project, such as
// lib/util.ant:3:5 in a panic's trace, is a link to it.
import { memo, useLayoutEffect, useRef, type ReactNode } from "react";
import type { Segment } from "../console";

export interface ConsoleProps {
  segments: readonly Segment[];
  /** Says whether a path names a file that can be opened. */
  isFile(path: string): boolean;
  onOpen(path: string, line: number, column: number): void;
}

const position = /((?:[\w.@-]+\/)*[\w.@-]+\.ant):(\d+)(?::(\d+))?/g;

export function Console({ segments, isFile, onOpen }: ConsoleProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true); // the view follows the output while it is at the end

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [segments]);

  return (
    <div
      className="console-output"
      ref={scroller}
      role="log"
      aria-label="Console"
      onScroll={(e) => {
        const el = e.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
    >
      {segments.length === 0 ? (
        <div className="console-empty">Output of the program shows here.</div>
      ) : (
        <pre>
          {segments.map((s) => (
            <Text key={s.id} segment={s} isFile={isFile} onOpen={onOpen} />
          ))}
        </pre>
      )}
    </div>
  );
}

const Text = memo(function Text(props: { segment: Segment } & Pick<ConsoleProps, "isFile" | "onOpen">) {
  const { segment, isFile, onOpen } = props;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of segment.text.matchAll(position)) {
    const [text, path, line, column] = m;
    if (!isFile(path)) continue;
    parts.push(segment.text.slice(last, m.index));
    parts.push(
      <button key={m.index} className="console-link" onClick={() => onOpen(path, Number(line), Number(column ?? 1))}>
        {text}
      </button>,
    );
    last = m.index + text.length;
  }
  parts.push(segment.text.slice(last));
  return <span className={"console-" + segment.stream}>{parts}</span>;
});

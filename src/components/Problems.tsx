// The list of problems in the project's files; a click on one opens the file there.
import { basename, dirname } from "../fs/workspace";
import type { Problem } from "../problems";
import { ErrorIcon, WarningIcon } from "./icons";

export interface ProblemsProps {
  problems: readonly Problem[];
  onOpen(path: string, line: number, column: number): void;
}

export function Problems({ problems, onOpen }: ProblemsProps) {
  if (problems.length === 0) {
    return <div className="problems-empty">No problems in the project’s files.</div>;
  }
  return (
    <ul className="problems" aria-label="Problems">
      {problems.map((p, i) => (
        <li key={i}>
          <button className={"problem " + p.severity} onClick={() => onOpen(p.path, p.line, p.column)}>
            {p.severity === "error" ? <ErrorIcon /> : <WarningIcon />}
            <span className="problem-message">{p.message}</span>
            <span className="problem-where">
              {basename(p.path)}
              {dirname(p.path) && <span className="problem-dir"> {dirname(p.path)}</span>}:{p.line}:{p.column}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Count is the number of errors and warnings, as icons with numbers. */
export function Count({ problems }: { problems: readonly Problem[] }) {
  const errors = problems.filter((p) => p.severity === "error").length;
  const warnings = problems.length - errors;
  return (
    <>
      {errors > 0 && (
        <span className="count error">
          <ErrorIcon />
          {errors}
        </span>
      )}
      {warnings > 0 && (
        <span className="count warning">
          <WarningIcon />
          {warnings}
        </span>
      )}
    </>
  );
}

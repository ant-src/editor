// The debugger's panel: why the program stopped, the call stack, and the variables in scope in
// the selected frame, whose values open into their parts.
import { useEffect, useRef, useState } from "react";
import type { Frame, Scope, StepCommand, Stop, Variable } from "../run/runner";
import { key } from "../keys";
import { ChevronIcon, ContinueIcon, StepIntoIcon, StepOutIcon, StepOverIcon } from "./icons";

/** What the panel asks the debugger for. */
export interface Inspector {
  scopes(frameId: number): Promise<Scope[]>;
  variables(variablesReference: number, start?: number, count?: number): Promise<Variable[]>;
}

export interface VariablesProps {
  /** The stop the program is at, or undefined while it runs. */
  stop: Stop | undefined;
  /** The index of the selected frame of the stop. */
  frame: number;
  inspector: Inspector;
  /** Resumes the program, when the panel shows the buttons that do. */
  onStep?(command: StepCommand): void;
  onSelectFrame(index: number): void;
}

const steps: { command: StepCommand; label: string; shortcut: string; icon: () => React.JSX.Element }[] = [
  { command: "continue", label: "Continue", shortcut: "F5", icon: ContinueIcon },
  { command: "next", label: "Step over", shortcut: "F10", icon: StepOverIcon },
  { command: "stepIn", label: "Step into", shortcut: "F11", icon: StepIntoIcon },
  { command: "stepOut", label: "Step out", shortcut: key("shift+F11"), icon: StepOutIcon },
];

/** Header is the panel's title, and the buttons that resume the program while it is paused. */
function Header({ paused, onStep }: { paused: boolean; onStep?(command: StepCommand): void }) {
  return (
    <header className="panel-header">
      <span className="panel-title">Debugger</span>
      {onStep && (
        <div className="step-buttons" role="group" aria-label="Step">
          {steps.map(({ command, label, shortcut, icon: Icon }) => (
            <button
              key={command}
              className={"icon-button " + command}
              disabled={!paused}
              title={`${label} (${shortcut})`}
              aria-label={label}
              onClick={() => onStep(command)}
            >
              <Icon />
            </button>
          ))}
        </div>
      )}
    </header>
  );
}

/** How many elements of an array show at first, and how many more each time. */
const page = 100;

export function Variables({ stop, frame, inspector, onStep, onSelectFrame }: VariablesProps) {
  // The last stop stays in view for a moment while the program runs, so that a step, which
  // resumes and stops at once, does not blink.
  const shown = useLinger(stop, 200);
  const selected = shown === stop ? frame : 0;
  const scopes = useScopes(shown, selected, inspector);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [closedScopes, setClosedScopes] = useState<ReadonlySet<string>>(new Set());

  const toggle = (set: (f: (before: ReadonlySet<string>) => ReadonlySet<string>) => void) => (key: string) =>
    set((before) => {
      const next = new Set(before);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const toggleVar = toggle(setOpen);
  const toggleScope = toggle(setClosedScopes);

  if (!shown) {
    return (
      <aside className="variables" aria-label="Debugger">
        <Header paused={false} onStep={onStep} />
        <div className="variables-running">Running…</div>
      </aside>
    );
  }

  const stale = shown !== stop;
  return (
    <aside className={"variables" + (stale ? " stale" : "")} aria-label="Debugger">
      <Header paused={!stale} onStep={onStep} />
      <div className="variables-body">
        <div className={"stop-reason" + (shown.reason === "exception" ? " panic" : "")}>{describe(shown)}</div>

        <h3 className="section-title">Call stack</h3>
        <ol className="frames">
          {shown.frames.map((f, i) => (
            <li key={f.id}>
              <button className={"frame" + (i === selected ? " selected" : "")} onClick={() => onSelectFrame(i)}>
                <span className="frame-name">{f.name}</span>
                <span className="frame-where">{where(f)}</span>
              </button>
            </li>
          ))}
        </ol>

        <h3 className="section-title">Variables</h3>
        {scopes.length === 0 && <div className="variables-empty">No variables in scope.</div>}
        {scopes.map((scope) => (
          <section key={scope.name} className="scope">
            <button
              className="scope-name"
              aria-expanded={!closedScopes.has(scope.name)}
              onClick={() => toggleScope(scope.name)}
            >
              <span className={"tree-chevron" + (closedScopes.has(scope.name) ? "" : " open")}>
                <ChevronIcon />
              </span>
              {scope.name}
            </button>
            {!closedScopes.has(scope.name) && (
              <ul className="vars">
                {scope.variables.map((v) => (
                  <VariableRow
                    key={v.name}
                    variable={v}
                    path={scope.name + "/" + v.name}
                    depth={0}
                    open={open}
                    onToggle={toggleVar}
                    inspector={inspector}
                    live={!stale}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </aside>
  );
}

function describe(stop: Stop): string {
  switch (stop.reason) {
    case "exception":
      return "Paused on panic" + (stop.text ? ": " + stop.text : "");
    case "breakpoint":
    case "function breakpoint":
      return "Paused on breakpoint";
    case "step":
      return "Paused after step";
    case "entry":
      return "Paused on entry";
  }
  return "Paused";
}

function where(frame: Frame): string {
  return frame.path ? `${frame.path}:${frame.line}` : "";
}

interface RowProps {
  variable: Variable;
  /** The names from the scope down to this variable, which keep a row open from stop to stop. */
  path: string;
  depth: number;
  open: ReadonlySet<string>;
  onToggle(path: string): void;
  inspector: Inspector;
  /** Whether the program is stopped where the variable was read, so that its parts can be asked for. */
  live: boolean;
}

function VariableRow({ variable, path, depth, open, onToggle, inspector, live }: RowProps) {
  const expandable = variable.variablesReference > 0;
  const isOpen = expandable && open.has(path);
  const total = variable.indexedVariables ?? 0;
  const [count, setCount] = useState(page);
  const [children, setChildren] = useState<Variable[] | null>(null);

  // The parts are read again at each stop; the ones of the stop before stay until they arrive.
  useEffect(() => {
    if (!isOpen || !live) return;
    let current = true;
    const paged = total > page;
    inspector.variables(variable.variablesReference, paged ? 0 : undefined, paged ? count : undefined).then(
      (vars) => current && setChildren(vars),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [isOpen, live, variable.variablesReference, count, total, inspector]);

  return (
    <li>
      <div
        className={"var" + (variable.changed ? " changed" : "") + (expandable ? " expandable" : "")}
        style={{ paddingLeft: 10 + depth * 12 }}
        onClick={expandable ? () => onToggle(path) : undefined}
        title={variable.type ? `${variable.name}: ${variable.type}` : variable.name}
      >
        {expandable ? (
          <button
            className={"tree-chevron" + (isOpen ? " open" : "")}
            aria-label={isOpen ? "Collapse" : "Expand"}
            aria-expanded={isOpen}
          >
            <ChevronIcon />
          </button>
        ) : (
          <span className="tree-chevron" />
        )}
        <span className="var-name">{variable.name}</span>
        <span className={"var-value " + kind(variable.value)}>{variable.value}</span>
      </div>
      {isOpen && children && (
        <ul className="vars">
          {children.map((child) => (
            <VariableRow
              key={child.name}
              variable={child}
              path={path + "/" + child.name}
              depth={depth + 1}
              open={open}
              onToggle={onToggle}
              inspector={inspector}
              live={live}
            />
          ))}
          {total > page && children.length < total && (
            <li>
              <button
                className="var-more"
                style={{ paddingLeft: 26 + (depth + 1) * 12 }}
                onClick={() => setCount(count + page)}
              >
                Show more ({total - children.length} left)
              </button>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

/** kind names the look of a value by how it is written. */
function kind(value: string): string {
  if (/^["`]/.test(value)) return "string";
  if (/^-?\d/.test(value)) return "number";
  if (/^(true|false|none|void)$/.test(value)) return "keyword";
  return "";
}

/** useLinger returns the value, and when it becomes undefined the one before for a while longer. */
function useLinger<T>(value: T | undefined, ms: number): T | undefined {
  const [kept, setKept] = useState(value);
  useEffect(() => {
    if (value !== undefined) {
      setKept(value);
      return;
    }
    const timer = setTimeout(() => setKept(undefined), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return value ?? kept;
}

/** useScopes returns the scopes of a frame of the stop: the innermost's come with the stop. */
function useScopes(stop: Stop | undefined, frame: number, inspector: Inspector): Scope[] {
  const [fetched, setFetched] = useState<{ stop: Stop; frame: number; scopes: Scope[] } | null>(null);
  const latest = useRef(0);
  useEffect(() => {
    if (!stop || frame === 0 || !stop.frames[frame]) return;
    const request = ++latest.current;
    inspector.scopes(stop.frames[frame].id).then(
      (scopes) => request === latest.current && setFetched({ stop, frame, scopes }),
      () => {},
    );
  }, [stop, frame, inspector]);
  if (!stop) return [];
  if (frame === 0) return stop.scopes;
  return fetched?.stop === stop && fetched.frame === frame ? fetched.scopes : [];
}

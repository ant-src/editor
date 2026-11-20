// The editor: a folder's file tree on the left, the code in the middle with the console under
// it, and the debugger's panel on the right while a program is debugged.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from "react";
import { CodeEditor } from "./components/CodeEditor";
import { Console } from "./components/Console";
import { FileTree } from "./components/FileTree";
import {
  BugIcon,
  CloseIcon,
  ContinueIcon,
  FolderIcon,
  PlayIcon,
  SaveIcon,
  SidebarIcon,
  StepIntoIcon,
  StepOutIcon,
  StepOverIcon,
  StopIcon,
} from "./components/icons";
import { Variables } from "./components/Variables";
import { ConsoleStore } from "./console";
import { BreakpointStore } from "./debug/breakpoints";
import { compileAnt, createModel, monaco, pathOf, startLanguageServer } from "./editor/monaco";
import {
  basename,
  browserWorkspace,
  files as workspaceFiles,
  pickFolder,
  supported,
  type TreeNode,
  type Workspace,
} from "./fs/workspace";
import logo from "./logo.svg";
import { isAnt, Project } from "./project";
import AntWorker from "./run/ant.worker?worker";
import type { WorkerLike } from "./run/protocol";
import { Runner, type RunnerState, type StepCommand } from "./run/runner";

const output = new ConsoleStore();
const breakpoints = new BreakpointStore();

let booted: Promise<Runner> | undefined;

/** boot loads ant.wasm once, and starts the language server and the runner on it. */
function boot(): Promise<Runner> {
  booted ??= compileAnt().then((module) => {
    startLanguageServer(module);
    return new Runner(
      () => new AntWorker() as unknown as WorkerLike,
      { output: output.write, bound: (path, bound) => breakpoints.bind(path, bound) },
      module,
    );
  });
  return booted;
}

export function App() {
  const [runner, setRunner] = useState<Runner | null>(null);
  const [failure, setFailure] = useState("");
  const [project, setProject] = useState<Project | null>(null);
  const [opened, setOpened] = useState(0); // counts the folders opened
  const [error, setError] = useState("");
  const current = useRef<Project | null>(null);

  useEffect(() => {
    boot().then(setRunner, (err) => setFailure(String(err?.message ?? err)));
  }, []);

  /** show makes the folder the project, in place of the one before. */
  const show = useCallback(async (workspace: Workspace, keepBreakpoints = false) => {
    const next = new Project(workspace, createModel);
    current.current?.dispose(); // the buffers of the folder before give way to this one's
    current.current = next;
    await next.refresh();
    if (current.current !== next) return;
    if (!keepBreakpoints) {
      for (const path of Object.keys(breakpoints.all())) breakpoints.remove(path);
    }
    setProject(next);
    setOpened((n) => n + 1);
  }, []);

  // Work starts at once, in the folder the browser keeps for the page.
  useEffect(() => {
    if (current.current) return;
    browserWorkspace().then(
      (workspace) => void (!current.current && show(workspace)),
      (err) => setError(String(err?.message ?? err)),
    );
  }, [show]);

  const openFolder = useCallback(async () => {
    setError("");
    try {
      const workspace = await pickFolder();
      if (!workspace) return;
      runner?.stop();
      output.clear();
      await show(workspace);
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    }
  }, [runner, show]);

  /** saveToFolder copies the files kept in the browser to a folder on disk, and works there from then on. */
  const saveToFolder = useCallback(async () => {
    const from = current.current;
    if (!from?.workspace.inBrowser) return;
    try {
      const target = await pickFolder();
      if (!target) return;
      await from.saveAll();
      const replaced = await target.existing(workspaceFiles((await from.workspace.tree()).nodes));
      if (replaced.length > 0 && !window.confirm(`${target.name} already has ${list(replaced)}. Replace?`)) return;
      runner?.stop();
      await from.workspace.copyTo(target);
      await show(target, true);
      await from.workspace.clear(); // the next start is a new workspace
      output.write("info", `Saved to the folder ${target.name}\n`);
    } catch (err) {
      output.write("stderr", `Saving to a folder: ${(err as Error)?.message ?? err}\n`);
    }
  }, [runner, show]);

  if (!project) {
    return <Welcome error={error} />;
  }
  return (
    <Ide
      key={opened}
      project={project}
      runner={runner}
      failure={failure}
      onOpenFolder={supported() ? openFolder : undefined}
      onSaveToFolder={supported() && project.workspace.inBrowser ? saveToFolder : undefined}
    />
  );
}

function list(paths: string[]): string {
  return paths.length <= 3 ? paths.join(", ") : `${paths.slice(0, 3).join(", ")} and ${paths.length - 3} more`;
}

/** Welcome shows while the workspace opens, and why it did not. */
function Welcome({ error }: { error: string }) {
  return (
    <main className="welcome">
      <img src={logo} alt="" width="56" height="56" />
      <h1>Ant Editor</h1>
      {error ? (
        <p className="welcome-note" role="alert">
          {error}
        </p>
      ) : (
        <p>Opening…</p>
      )}
    </main>
  );
}

const starting: RunnerState = { status: "starting", debugging: false };
const noSubscription = () => () => {};

interface IdeProps {
  project: Project;
  runner: Runner | null;
  /** Why ant.wasm did not load. */
  failure: string;
  /** Opens a folder on disk, where the browser can. */
  onOpenFolder?: () => void;
  /** Saves the files kept in the browser to a folder on disk, while the project is there. */
  onSaveToFolder?: () => void;
}

function Ide({ project, runner, failure, onOpenFolder, onSaveToFolder }: IdeProps) {
  const files = useSyncExternalStore(project.subscribe, project.getState);
  const run = useSyncExternalStore(runner?.subscribe ?? noSubscription, runner?.getState ?? (() => starting));
  const marks = useSyncExternalStore(breakpoints.subscribe, breakpoints.getState);
  const segments = useSyncExternalStore(output.subscribe, output.getState);

  const [tabs, setTabs] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ path: string; line: number; column: number } | null>(null);
  const [picked, setPicked] = useState<{ stop: unknown; frame: number } | null>(null); // a frame of the stack
  const [sidebar, setSidebar] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [consoleHeight, setConsoleHeight] = useState(220);

  const stop = run.status === "paused" ? run.stop : undefined;
  const frame = picked && picked.stop === stop ? picked.frame : 0;
  const location = stop?.frames[frame];
  const canStart = runner !== null && run.status === "idle" && active !== null && isAnt(active);
  const running = run.status === "running" || run.status === "paused";

  const open = useCallback(
    async (path: string, position?: { line: number; column: number }) => {
      try {
        await project.open(path);
      } catch (err) {
        output.write("stderr", `${path}: ${(err as Error).message}\n`);
        return;
      }
      setTabs((before) => (before.includes(path) ? before : [...before, path]));
      setActive(path);
      if (position) setReveal({ path, ...position });
    },
    [project],
  );

  const close = (path: string) => {
    setTabs((before) => {
      const i = before.indexOf(path);
      const next = before.filter((p) => p !== path);
      setActive((current) => (current === path ? (next[Math.min(i, next.length - 1)] ?? null) : current));
      return next;
    });
  };

  // A file that is gone from disk closes, and its breakpoints go with it.
  useEffect(() => {
    project.onRemoved = (path) => {
      close(path);
      breakpoints.remove(path);
    };
  }, [project]);

  // The first Ant file opens with the folder: main.ant if there is one.
  useEffect(() => {
    const sources = Object.keys(project.sources()).sort();
    const first = sources.includes("main.ant") ? "main.ant" : (sources.find((p) => !p.includes("/")) ?? sources[0]);
    if (first) void open(first);
  }, [project, open]);

  // When the program stops, the editor shows where; so it does for a frame picked in the stack.
  useEffect(() => {
    if (location?.path) void open(location.path, { line: location.line, column: location.column });
  }, [location, open]);

  useEffect(() => {
    if (!run.debugging) breakpoints.endSession();
  }, [run.debugging]);

  useEffect(() => {
    const refresh = () => void project.refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [project]);

  const unsaved = files.dirty.size > 0;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  useEffect(() => {
    document.title = (active ? basename(active) + " · " : "") + files.name + " · Ant Editor";
  }, [active, files.name]);

  // Go to definition in another file opens it here.
  useEffect(() => {
    const opener = monaco.editor.registerEditorOpener({
      openCodeEditor(_source, uri, at) {
        const path = pathOf(uri);
        if (!project.has(path)) return false;
        const position =
          at &&
          ("startLineNumber" in at
            ? { line: at.startLineNumber, column: at.startColumn }
            : { line: at.lineNumber, column: at.column });
        void open(path, position ?? undefined);
        return true;
      },
    });
    return () => opener.dispose();
  }, [project, open]);

  const program = () => ({ files: project.sources(), path: active! });
  const start = (debug: boolean) => {
    if (!canStart) return;
    output.clear();
    if (debug) runner.debug(program(), breakpoints.all());
    else runner.run(program());
  };
  const step = (command: StepCommand) => runner?.resume(command);
  const save = (path: string | null) =>
    path && project.save(path).catch((err) => output.write("stderr", `${path}: ${(err as Error).message}\n`));

  /** rename moves a file or a directory, and its tabs and breakpoints with it. */
  const rename = async (from: string, to: string) => {
    let moved: Map<string, string>;
    try {
      moved = await project.rename(from, to);
    } catch (err) {
      output.write("stderr", `Renaming ${from}: ${(err as Error).message}\n`);
      throw err;
    }
    const place = (path: string) => moved.get(path) ?? path;
    setTabs((before) => before.map(place));
    setActive((before) => before && place(before));
    for (const [before, after] of moved) breakpoints.move(before, after);
  };

  const remove = (node: TreeNode) => {
    const what = node.kind === "directory" ? `the folder ${node.path} and everything in it` : node.path;
    if (!window.confirm(`Delete ${what}?`)) return;
    project.remove(node.path).catch((err) => output.write("stderr", `Deleting ${node.path}: ${err?.message ?? err}\n`));
  };

  const sendBreakpoints = (path: string) => {
    if (run.debugging) runner?.setBreakpoints(path, [...breakpoints.lines(path)]).catch(() => {});
  };
  const toggleBreakpoint = (line: number) => {
    if (!active || !isAnt(active)) return;
    breakpoints.toggle(active, line);
    sendBreakpoints(active);
  };
  const moveBreakpoints = (lines: number[]) => {
    if (!active) return;
    breakpoints.set(active, lines);
    sendBreakpoints(active);
  };

  const keys = useRef<(e: KeyboardEvent) => boolean>(() => false);
  keys.current = (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "s") {
      if (e.shiftKey) void project.saveAll();
      else void save(active);
    } else if (mod && e.key === "Enter") start(false);
    else if (mod && e.key.toLowerCase() === "b" && !e.shiftKey) setSidebar((s) => !s);
    else if (e.key === "F5" && e.shiftKey) runner?.stop();
    else if (e.key === "F5" && run.status === "paused") step("continue");
    else if (e.key === "F5") start(true);
    else if (e.key === "F10") step("next");
    else if (e.key === "F11") step(e.shiftKey ? "stepOut" : "stepIn");
    else return false;
    return true;
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (keys.current(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const model = active ? ((project.buffer(active) as monaco.editor.ITextModel | undefined) ?? null) : null;
  const paused = location && location.path === active ? { line: location.line, innermost: frame === 0 } : undefined;

  return (
    <div className="app">
      <header className="toolbar">
        <button
          className="icon-button"
          title="Toggle the file tree (⌘B)"
          aria-label="Toggle file tree"
          aria-pressed={sidebar}
          onClick={() => setSidebar(!sidebar)}
        >
          <SidebarIcon />
        </button>
        <img className="toolbar-logo" src={logo} alt="" width="20" height="20" />
        <span
          className="project-name"
          title={onSaveToFolder ? "Kept in this browser until you save it to a folder" : files.name}
        >
          {files.name}
          {project.workspace.inBrowser && <span className="project-place">in browser</span>}
        </span>
        {onSaveToFolder && (
          <button
            className="text-button"
            title="Copy these files to a folder on disk and work there"
            onClick={onSaveToFolder}
          >
            <SaveIcon />
            Save to folder
          </button>
        )}
        {onOpenFolder && (
          <button className="text-button" title="Open a folder on disk" onClick={onOpenFolder}>
            <FolderIcon />
            Open folder
          </button>
        )}

        <div className="toolbar-actions">
          {!running && (
            <>
              <button
                className="action run"
                disabled={!canStart}
                title="Run the active file (⌘Enter)"
                onClick={() => start(false)}
              >
                <PlayIcon />
                Run
              </button>
              <button
                className="action"
                disabled={!canStart}
                title="Debug the active file (F5)"
                onClick={() => start(true)}
              >
                <BugIcon />
                Debug
              </button>
            </>
          )}
          {running && run.debugging && (
            <div className="step-buttons" role="group" aria-label="Debugger">
              <button
                className="icon-button"
                disabled={!stop}
                title="Continue (F5)"
                aria-label="Continue"
                onClick={() => step("continue")}
              >
                <ContinueIcon />
              </button>
              <button
                className="icon-button"
                disabled={!stop}
                title="Step over (F10)"
                aria-label="Step over"
                onClick={() => step("next")}
              >
                <StepOverIcon />
              </button>
              <button
                className="icon-button"
                disabled={!stop}
                title="Step into (F11)"
                aria-label="Step into"
                onClick={() => step("stepIn")}
              >
                <StepIntoIcon />
              </button>
              <button
                className="icon-button"
                disabled={!stop}
                title="Step out (⇧F11)"
                aria-label="Step out"
                onClick={() => step("stepOut")}
              >
                <StepOutIcon />
              </button>
            </div>
          )}
          {running && (
            <button className="action stop" title="Stop the program (⇧F5)" onClick={() => runner?.stop()}>
              <StopIcon />
              Stop
            </button>
          )}
        </div>

        <span className={"status " + run.status} role="status">
          {failure
            ? `Ant did not load: ${failure}`
            : run.status === "unavailable"
              ? `Ant did not load: ${run.error}`
              : run.status === "starting"
                ? "Loading Ant…"
                : run.status === "running"
                  ? run.debugging
                    ? "Debugging…"
                    : "Running…"
                  : stop
                    ? `Paused at ${stop.frames[0]?.path ?? ""}:${stop.frames[0]?.line ?? ""}`
                    : ""}
        </span>
      </header>

      <div className="workbench">
        {sidebar && (
          <>
            <div className="sidebar" style={{ width: sidebarWidth }}>
              <FileTree
                tree={files.tree}
                truncated={files.truncated}
                active={active}
                dirty={files.dirty}
                onOpen={(path) => void open(path)}
                onCreate={async (kind, path) => {
                  if (kind === "directory") return project.createDirectory(path);
                  await project.createFile(path);
                  await open(path);
                }}
                onRename={rename}
                onDelete={remove}
                onRefresh={() => void project.refresh()}
              />
            </div>
            <Resizer direction="column" onResize={(d) => setSidebarWidth((w) => clamp(w + d, 160, 480))} />
          </>
        )}

        <div className="center">
          <div className="tabs" role="tablist">
            {tabs.map((path) => (
              <div
                key={path}
                className={"tab" + (path === active ? " active" : "")}
                role="tab"
                aria-selected={path === active}
                title={path}
              >
                <button className="tab-name" onClick={() => setActive(path)}>
                  {basename(path)}
                </button>
                {files.dirty.has(path) && <span className="dirty-dot" aria-label="unsaved changes" />}
                <button className="tab-close" aria-label={`Close ${basename(path)}`} onClick={() => close(path)}>
                  <CloseIcon />
                </button>
              </div>
            ))}
          </div>
          <div className="editor-area">
            <CodeEditor
              model={model}
              breakpoints={active ? (marks.lines[active] ?? none) : none}
              unverified={active ? (marks.unverified[active] ?? none) : none}
              paused={paused}
              reveal={reveal && reveal.path === active ? reveal : null}
              onToggleBreakpoint={toggleBreakpoint}
              onBreakpointsMoved={moveBreakpoints}
            />
            {!model && (
              <div className="editor-empty">
                <p>Open a file from the tree.</p>
                <dl>
                  <dt>⌘S</dt>
                  <dd>Save</dd>
                  <dt>⌘Enter</dt>
                  <dd>Run</dd>
                  <dt>F5</dt>
                  <dd>Debug, continue</dd>
                  <dt>F10 · F11 · ⇧F11</dt>
                  <dd>Step over, into, out</dd>
                </dl>
              </div>
            )}
          </div>
          <Resizer direction="row" onResize={(d) => setConsoleHeight((h) => clamp(h - d, 80, 640))} />
          <div className="console-area" style={{ height: consoleHeight }}>
            <Console
              segments={segments}
              isFile={(path) => project.has(path)}
              onOpen={(path, line, column) => void open(path, { line, column })}
              onClear={() => output.clear()}
            />
          </div>
        </div>

        {run.debugging && runner && (
          <Variables
            stop={stop}
            frame={frame}
            inspector={runner}
            onSelectFrame={(frame) => setPicked({ stop, frame })}
          />
        )}
      </div>
    </div>
  );
}

const none: readonly number[] = [];

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** Resizer is the edge between two panes: dragging it reports how far, in pixels. */
function Resizer({ direction, onResize }: { direction: "row" | "column"; onResize(delta: number): void }) {
  const last = useRef<number | null>(null);
  const at = (e: PointerEvent) => (direction === "column" ? e.clientX : e.clientY);
  return (
    <div
      className={"resizer " + direction}
      role="separator"
      aria-orientation={direction === "column" ? "vertical" : "horizontal"}
      onPointerDown={(e) => {
        last.current = at(e);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (last.current === null) return;
        onResize(at(e) - last.current);
        last.current = at(e);
      }}
      onPointerUp={() => (last.current = null)}
      onPointerCancel={() => (last.current = null)}
    />
  );
}

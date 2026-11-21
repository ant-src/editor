// The editor: a folder's file tree on the left, the code in the middle with the console under
// it, and the debugger's panel on the right while a program is debugged.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
} from "react";
import { CodeEditor } from "./components/CodeEditor";
import { Console } from "./components/Console";
import { FileTree } from "./components/FileTree";
import {
  BugIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClearIcon,
  CloseIcon,
  RunIcon,
  SidebarIcon,
  StopIcon,
} from "./components/icons";
import { Menu, type MenuEntry } from "./components/Menu";
import { SettingsButton } from "./components/Settings";
import { KeyList, ShortcutsButton } from "./components/Shortcuts";
import { Count, Problems } from "./components/Problems";
import { Variables } from "./components/Variables";
import { ConsoleStore } from "./console";
import { BreakpointStore } from "./debug/breakpoints";
import { compileAnt, createModel, monaco, pathOf, startLanguageServer } from "./editor/monaco";
import {
  basename,
  browserFolders,
  dirname,
  files as workspaceFiles,
  pickFolder,
  supported,
  type TreeNode,
  Workspace,
} from "./fs/workspace";
import { BrowserProjects, type ProjectsState } from "./fs/projects";
import { RecentFolders, type RecentFolder } from "./fs/recent";
import { zip } from "./fs/zip";
import { key, keymap, typesText } from "./keys";
import logo from "./logo.svg";
import { ProblemStore, runNotes } from "./problems";
import { isAnt, Project } from "./project";
import AntWorker from "./run/ant.worker?worker";
import type { WorkerLike } from "./run/protocol";
import { Runner, type RunnerState, type StepCommand } from "./run/runner";
import { forgetTargets, moveTargets, RunTargets, targetsKey } from "./run/targets";

const output = new ConsoleStore();
const breakpoints = new BreakpointStore();
const problems = new ProblemStore();
/** inMenu says whether target is in an open menu, whose keys are its own. */
const inMenu = (target: EventTarget | null) => target instanceof Element && target.closest('[role="menu"]') !== null;

/** brief is the keys the empty editor shows. */
const brief = keymap.flatMap((g) => g.shortcuts.filter((s) => s.brief));

monaco.editor.onDidChangeMarkers(() =>
  problems.set(
    monaco.editor.getModelMarkers({}).map((m) => ({
      path: pathOf(m.resource),
      line: m.startLineNumber,
      column: m.startColumn,
      message: m.message,
      severity: m.severity,
      code: typeof m.code === "string" ? m.code : m.code?.value,
    })),
  ),
);

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
  const [projects, setProjects] = useState<BrowserProjects | null>(null);
  const recent = useMemo(() => (supported() ? new RecentFolders() : null), []);
  useEffect(() => void recent?.refresh().catch(() => {}), [recent]);

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

  // Work starts at once, in the project kept in the browser that was used last.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    browserFolders()
      .then((folders) => {
        const list = new BrowserProjects(folders);
        setProjects(list);
        return list.openLast();
      })
      .then(
        (workspace) => void (!current.current && show(workspace)),
        (err) => setError(String(err?.message ?? err)),
      );
  }, [show]);

  /**
   * leave readies the open project to give way to another: one in the browser saves its changes,
   * a folder on disk with unsaved ones asks first. It reports whether to go on.
   */
  const leave = useCallback(async (): Promise<boolean> => {
    const from = current.current;
    if (from?.workspace.inBrowser) await from.saveAll();
    else if (from && from.getState().dirty.size > 0) {
      if (!window.confirm(`${from.workspace.name} has unsaved changes. Leave without saving them?`)) return false;
    }
    runner?.stop();
    output.clear();
    return true;
  }, [runner]);

  /** remember puts a folder on disk at the top of the recent folders, and names it by its id there. */
  const remember = useCallback(
    async (workspace: Workspace): Promise<Workspace> => {
      if (!recent) return workspace;
      try {
        return new Workspace(workspace.root, false, undefined, await recent.add(workspace.root));
      } catch {
        return workspace; // a folder the list cannot keep still opens
      }
    },
    [recent],
  );

  const openFolder = useCallback(async () => {
    setError("");
    try {
      const picked = await pickFolder();
      if (!picked || !(await leave())) return;
      await show(await remember(picked));
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    }
  }, [leave, show, remember]);

  /** openRecent opens a folder of the recent ones, once the browser allows it. */
  const openRecent = useCallback(
    async (id: string) => {
      try {
        if (current.current?.workspace.id === id || !recent) return;
        const workspace = await recent.open(id);
        if (!workspace) {
          output.write("warning", "The browser was not allowed to open the folder\n");
          return;
        }
        if (!(await leave())) return;
        await show(workspace);
      } catch (err) {
        output.write("stderr", `Opening a folder: ${(err as Error)?.message ?? err}\n`);
      }
    },
    [recent, leave, show],
  );

  const newProject = useCallback(async () => {
    try {
      if (!projects || !(await leave())) return;
      await show(await projects.create());
    } catch (err) {
      output.write("stderr", `Making a project: ${(err as Error)?.message ?? err}\n`);
    }
  }, [projects, leave, show]);

  const openProject = useCallback(
    async (id: string) => {
      try {
        const from = current.current?.workspace;
        if (!projects || (from?.inBrowser && from.id === id) || !(await leave())) return;
        await show(await projects.open(id));
      } catch (err) {
        output.write("stderr", `Opening a project: ${(err as Error)?.message ?? err}\n`);
      }
    },
    [projects, leave, show],
  );

  /** deleteProject deletes a project kept in the browser, and opens another in its place if it was open. */
  const deleteProject = useCallback(
    async (id: string) => {
      const project = projects?.getState().projects.find((p) => p.id === id);
      if (!projects || !project || !window.confirm(`Delete the project ${project.name} and its files?`)) return;
      try {
        const from = current.current?.workspace;
        if (from?.inBrowser && from.id === id) {
          runner?.stop();
          output.clear();
          const next = projects.getState().projects.find((p) => p.id !== id);
          await show(next ? await projects.open(next.id) : await projects.create(id));
        }
        await projects.remove(id);
        forgetTargets(targetsKey({ inBrowser: true, name: project.name, id }));
      } catch (err) {
        output.write("stderr", `Deleting ${project.name}: ${(err as Error)?.message ?? err}\n`);
      }
    },
    [projects, runner, show],
  );

  /** renameProject names the open project, or says why it cannot. */
  const renameProject = useCallback(
    (name: string): string | undefined => {
      const open = current.current;
      if (!projects || !open?.workspace.inBrowser || !open.workspace.id) return "This project cannot be renamed";
      try {
        projects.rename(open.workspace.id, name);
      } catch (err) {
        return (err as Error).message;
      }
      open.setName(name.trim());
    },
    [projects],
  );

  /** saveToFolder copies the files kept in the browser to a folder on disk, and works there from then on. */
  const saveToFolder = useCallback(async () => {
    const from = current.current;
    if (!from?.workspace.inBrowser) return;
    try {
      const picked = await pickFolder();
      if (!picked) return;
      const target = await remember(picked);
      await from.saveAll();
      const replaced = await target.existing(workspaceFiles((await from.workspace.tree()).nodes));
      if (replaced.length > 0 && !window.confirm(`${target.name} already has ${list(replaced)}. Replace?`)) return;
      runner?.stop();
      await from.workspace.copyTo(target);
      moveTargets(targetsKey(from.workspace), targetsKey(target)); // the files to run come along
      await show(target, true);
      output.write("info", `Saved to the folder ${target.name}\n`);
      // it lives on disk now; the copy in the browser goes
      if (from.workspace.id) {
        await projects
          ?.remove(from.workspace.id)
          .catch((err) => output.write("warning", `The copy in the browser was not deleted: ${err?.message ?? err}\n`));
      }
    } catch (err) {
      output.write("stderr", `Saving to a folder: ${(err as Error)?.message ?? err}\n`);
    }
  }, [runner, show, projects, remember]);

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
      projects={projects}
      onNewProject={newProject}
      onOpenProject={openProject}
      onDeleteProject={deleteProject}
      onRenameProject={renameProject}
      recent={recent}
      onOpenRecent={openRecent}
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
  /** The projects kept in the browser, once their list is read. */
  projects: BrowserProjects | null;
  onNewProject(): void;
  onOpenProject(id: string): void;
  onDeleteProject(id: string): void;
  /** Names the open project, or returns why it cannot. */
  onRenameProject(name: string): string | undefined;
  /** The folders on disk opened lately, where the browser can open folders. */
  recent: RecentFolders | null;
  onOpenRecent(id: string): void;
}

const noProjects: ProjectsState = { projects: [], last: null };
const emptyFolders: readonly RecentFolder[] = [];
const noFolders = () => emptyFolders;

function Ide(props: IdeProps) {
  const { project, runner, failure, onOpenFolder, onSaveToFolder, projects } = props;
  const { onNewProject, onOpenProject, onDeleteProject, onRenameProject, recent, onOpenRecent } = props;
  const folders = useSyncExternalStore(recent?.subscribe ?? noSubscription, recent?.getState ?? noFolders);
  const browser = useSyncExternalStore(projects?.subscribe ?? noSubscription, projects?.getState ?? (() => noProjects));
  const [renaming, setRenaming] = useState(false);
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
  const [debuggerWidth, setDebuggerWidth] = useState(300);
  const [consoleHeight, setConsoleHeight] = useState(220);
  const [panel, setPanel] = useState<{ tab: "console" | "problems"; open: boolean }>({ tab: "console", open: true });
  const allProblems = useSyncExternalStore(problems.subscribe, problems.getState);
  const problemList = useMemo(() => allProblems.filter((p) => project.has(p.path)), [allProblems, files, project]);

  const stop = run.status === "paused" ? run.stop : undefined;
  const frame = picked && picked.stop === stop ? picked.frame : 0;
  const location = stop?.frames[frame];
  const [projectMenu, setProjectMenu] = useState<{ x: number; y: number } | null>(null);
  const [targetMenu, setTargetMenu] = useState<{ x: number; y: number } | null>(null);
  const [shortcuts, setShortcuts] = useState(false);

  // What Run runs: the file picked, else the current file when it is an Ant file.
  const targets = useMemo(() => new RunTargets(targetsKey(project.workspace)), [project]);
  const picks = useSyncExternalStore(targets.subscribe, targets.getState);
  const current = active && isAnt(active) ? active : null;
  const entry = targets.target(current);
  const canStart = runner !== null && run.status === "idle" && entry !== null;
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

  // A file that is not in the tree is not one to run, but stays on the list in case it comes back.
  // Where the tree is cut short, a file it leaves out may well be there.
  useEffect(() => {
    const paths = new Set(workspaceFiles(files.tree));
    targets.showOnly((path) => files.truncated || paths.has(path));
  }, [files.tree, files.truncated, targets]);

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

  /** start runs or debugs the target, or another file given, which joins the files that can be picked. */
  const start = (debug: boolean, path = entry) => {
    if (runner === null || run.status !== "idle" || path === null) return;
    const program = { files: project.sources(), path };
    targets.ran(path);
    output.clear();
    if (debug) runner.debug(program, breakpoints.all());
    else runner.run(program);
    // The run goes ahead with the errors the checker found, but the console says what they are.
    for (const note of runNotes(problemList)) output.write("warning", note);
    setPanel({ tab: "console", open: true });
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
    targets.rename(moved);
    for (const [before, after] of moved) breakpoints.move(before, after);
  };

  /** download saves the folder, as the editor shows it, as a zip archive. */
  const download = async () => {
    try {
      const encoder = new TextEncoder();
      const entries = await Promise.all(
        (await project.snapshot()).map(async ({ path, data }) => ({
          path: files.name + "/" + path,
          data: typeof data === "string" ? encoder.encode(data) : new Uint8Array(await data.arrayBuffer()),
        })),
      );
      const link = document.createElement("a");
      link.href = URL.createObjectURL(zip(entries));
      link.download = files.name + ".zip";
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    } catch (err) {
      output.write("stderr", `Downloading: ${(err as Error)?.message ?? err}\n`);
    }
  };

  /** moveTab moves between the open files with the arrow keys. */
  const moveTab = (e: ReactKeyboardEvent<HTMLElement>) => {
    const i = active ? tabs.indexOf(active) : -1;
    const next =
      e.key === "ArrowLeft"
        ? tabs[i - 1]
        : e.key === "ArrowRight"
          ? tabs[i + 1]
          : e.key === "Home"
            ? tabs[0]
            : e.key === "End"
              ? tabs.at(-1)
              : undefined;
    if (!next) return;
    e.preventDefault();
    setActive(next);
    e.currentTarget.querySelector<HTMLElement>(`[data-path="${CSS.escape(next)}"]`)?.focus();
  };

  /** switchTab moves between the panel's tabs with the arrow keys. */
  const switchTab = (e: ReactKeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const tab = panel.tab === "console" ? "problems" : "console";
    setPanel({ tab, open: true });
    document.getElementById("panel-" + tab)?.focus();
    e.preventDefault();
  };

  const targetEntries: MenuEntry[] = [
    {
      label: "Current File",
      checked: picks.selected === null,
      shortcut: key("mod+shift+Enter"),
      onSelect: () => targets.select(null),
    },
    ...(picks.files.length > 0
      ? (["separator"] as MenuEntry[]).concat(
          picks.files.map((path) => ({
            label: path,
            checked: picks.selected === path,
            onSelect: () => targets.select(path),
            onRemove: () => targets.remove(path),
          })),
        )
      : [{ caption: "Files you run show here" }]),
  ];

  const inBrowser = project.workspace.inBrowser;
  const projectEntries: MenuEntry[] = [
    { label: "New project", onSelect: () => void onNewProject() },
    ...(inBrowser ? [{ label: "Rename…", onSelect: () => setRenaming(true) }] : []),
    ...(browser.projects.length > 0
      ? (["separator", { caption: "In this browser" }] as MenuEntry[]).concat(
          browser.projects.map((p) => ({
            label: p.name,
            checked: inBrowser && p.id === project.workspace.id,
            onSelect: () => void onOpenProject(p.id),
            onRemove: () => void onDeleteProject(p.id),
          })),
        )
      : []),
    ...(folders.length > 0
      ? ([{ caption: "Recent folders" }] as MenuEntry[]).concat(
          folders.map((f) => ({
            label: f.name,
            checked: !inBrowser && f.id === project.workspace.id,
            onSelect: () => void onOpenRecent(f.id),
            onRemove: () => void recent?.forget(f.id),
          })),
        )
      : []),
    "separator",
    ...(onSaveToFolder ? [{ label: "Save to folder…", onSelect: onSaveToFolder }] : []),
    ...(onOpenFolder ? [{ label: "Open folder…", onSelect: onOpenFolder }] : []),
    { label: "Download as .zip", onSelect: () => void download() },
    "separator",
    { label: "Save all", shortcut: key("mod+shift+S"), disabled: !unsaved, onSelect: () => void project.saveAll() },
  ];

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
    } else if (mod && e.key === "Enter" && e.shiftKey) start(false, current);
    else if (mod && e.key === "Enter") start(false);
    else if (mod && e.key.toLowerCase() === "b" && !e.shiftKey) setSidebar((s) => !s);
    else if (mod && e.key.toLowerCase() === "j" && !e.shiftKey) setPanel((p) => ({ ...p, open: !p.open }));
    else if (e.key === "F5" && e.shiftKey) runner?.stop();
    else if (e.key === "F5" && run.status === "paused") step("continue");
    else if (e.key === "F5") start(true);
    else if (e.key === "F10") step("next");
    else if (e.key === "F11") step(e.shiftKey ? "stepOut" : "stepIn");
    else if (e.key === "?" && !mod && !e.altKey && !e.repeat && !typesText(e.target) && !inMenu(e.target))
      setShortcuts((open) => !open);
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
        <div className="toolbar-start">
          <button
            className="icon-button"
            title={`Toggle the file tree (${key("mod+B")})`}
            aria-label="Toggle file tree"
            aria-pressed={sidebar}
            onClick={() => setSidebar(!sidebar)}
          >
            <SidebarIcon />
          </button>
          <img className="toolbar-logo" src={logo} alt="" width="20" height="20" />
          {renaming ? (
            <NameInput name={files.name} onSubmit={onRenameProject} onDone={() => setRenaming(false)} />
          ) : (
            <button
              className="project-button"
              aria-haspopup="menu"
              aria-expanded={projectMenu !== null}
              title={inBrowser ? `${files.name}, kept in this browser` : files.name}
              onClick={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                setProjectMenu(projectMenu ? null : { x: box.left, y: box.bottom + 4 });
                void recent?.refresh().catch(() => {}); // another tab may have opened a folder
              }}
              onDoubleClick={() => inBrowser && setRenaming(true)}
            >
              <span className="project-name">{files.name}</span>
              <ChevronDownIcon />
            </button>
          )}
        </div>

        <div className="toolbar-end">
          {problemList.length > 0 && (
            <button
              className="problem-count"
              title="Show the problems"
              onClick={() => setPanel({ tab: "problems", open: true })}
            >
              <Count problems={problemList} />
            </button>
          )}
          {/* only what shows nowhere else: Stop, the console and the debugger say a program runs */}
          <span className={"status " + run.status} role="status">
            {failure
              ? `Ant did not load: ${failure}`
              : run.status === "unavailable"
                ? `Ant did not load: ${run.error}`
                : run.status === "starting"
                  ? "Loading Ant…"
                  : ""}
          </span>
          <div className="toolbar-actions">
            <button
              className="target-button"
              aria-haspopup="menu"
              aria-expanded={targetMenu !== null}
              title={picks.selected ? `Run and debug ${picks.selected}` : "Run and debug the file open in the editor"}
              onClick={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                setTargetMenu(targetMenu ? null : { x: box.left, y: box.bottom + 4 });
              }}
            >
              <span className="target-name">{picks.selected ? basename(picks.selected) : "Current File"}</span>
              <ChevronDownIcon />
            </button>
            {/* Stop takes Run's place while a program runs, so that nothing else moves */}
            {running ? (
              <button
                className="icon-button stop"
                title={`Stop the program (${key("shift+F5")})`}
                aria-label="Stop"
                onClick={() => runner?.stop()}
              >
                <StopIcon />
              </button>
            ) : (
              <button
                className="icon-button run"
                disabled={!canStart}
                title={entry ? `Run ${entry} (${key("mod+Enter")})` : "Open an Ant file to run it"}
                aria-label={entry ? `Run ${entry}` : "Run"}
                onClick={() => start(false)}
              >
                <RunIcon />
              </button>
            )}
            <button
              className="icon-button debug"
              disabled={!canStart}
              title={entry ? `Debug ${entry} (F5)` : "Open an Ant file to debug it"}
              aria-label={entry ? `Debug ${entry}` : "Debug"}
              onClick={() => start(true)}
            >
              <BugIcon />
            </button>
          </div>
          <ShortcutsButton open={shortcuts} onOpenChange={setShortcuts} />
          <SettingsButton />
        </div>
        {targetMenu && (
          <Menu
            label="Run target"
            x={targetMenu.x}
            y={targetMenu.y}
            entries={targetEntries}
            onClose={() => setTargetMenu(null)}
          />
        )}
        {projectMenu && (
          <Menu
            label={files.name}
            x={projectMenu.x}
            y={projectMenu.y}
            entries={projectEntries}
            onClose={() => setProjectMenu(null)}
          />
        )}
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
              />
            </div>
            <Resizer
              direction="column"
              label="Resize the file tree"
              value={sidebarWidth}
              min={160}
              max={480}
              onResize={(d) => setSidebarWidth((w) => clamp(w + d, 160, 480))}
            />
          </>
        )}

        <div className="center">
          <div className="tabs" role="tablist" aria-label="Open files" onKeyDown={moveTab}>
            {tabs.map((path) => (
              <div
                key={path}
                className={"tab" + (path === active ? " active" : "")}
                title={path}
                onAuxClick={(e) => e.button === 1 && close(path)}
              >
                <button
                  className="tab-name"
                  role="tab"
                  data-path={path}
                  aria-selected={path === active}
                  tabIndex={path === active ? 0 : -1}
                  onClick={() => setActive(path)}
                >
                  {basename(path)}
                  {/* files of the same name tell themselves apart by their directory */}
                  {tabs.some((t) => t !== path && basename(t) === basename(path)) && (
                    <span className="tab-dir">{dirname(path) || "./"}</span>
                  )}
                </button>
                {files.dirty.has(path) && <span className="dirty-dot" aria-label="unsaved changes" />}
                <button
                  className="tab-close"
                  tabIndex={-1}
                  aria-label={`Close ${basename(path)}`}
                  onClick={() => close(path)}
                >
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
              onShowShortcuts={() => setShortcuts(true)}
            />
            {!model && (
              <div className="editor-empty">
                <p>Open a file from the tree.</p>
                <KeyList shortcuts={brief} />
              </div>
            )}
          </div>
          {panel.open && (
            <Resizer
              direction="row"
              label="Resize the panel"
              value={consoleHeight}
              min={80}
              max={640}
              onResize={(d) => setConsoleHeight((h) => clamp(h - d, 80, 640))}
            />
          )}
          <section
            className={"bottom" + (panel.open ? "" : " closed")}
            style={panel.open ? { height: consoleHeight } : undefined}
            aria-label="Panel"
          >
            <header className="panel-header bottom-header">
              <div className="panel-tabs" role="tablist" aria-label="Panel" onKeyDown={switchTab}>
                {(["console", "problems"] as const).map((tab) => (
                  <button
                    key={tab}
                    id={"panel-" + tab}
                    className="panel-tab"
                    role="tab"
                    aria-selected={panel.tab === tab}
                    aria-controls="panel-body"
                    tabIndex={panel.tab === tab ? 0 : -1}
                    onClick={() => setPanel({ tab, open: true })}
                  >
                    {tab === "console" ? "Console" : "Problems"}
                    {tab === "problems" && problemList.length > 0 && (
                      <span className="badge">{problemList.length}</span>
                    )}
                  </button>
                ))}
              </div>
              {panel.open && panel.tab === "console" && (
                <button
                  className="icon-button"
                  title="Clear the console"
                  aria-label="Clear console"
                  onClick={() => output.clear()}
                >
                  <ClearIcon />
                </button>
              )}
              <button
                className="icon-button"
                title={`${panel.open ? "Hide" : "Show"} the panel (${key("mod+J")})`}
                aria-label={panel.open ? "Hide the panel" : "Show the panel"}
                aria-expanded={panel.open}
                onClick={() => setPanel({ ...panel, open: !panel.open })}
              >
                {panel.open ? <ChevronDownIcon /> : <ChevronUpIcon />}
              </button>
            </header>
            {panel.open && (
              <div id="panel-body" className="bottom-body" role="tabpanel" aria-labelledby={"panel-" + panel.tab}>
                {panel.tab === "console" ? (
                  <Console
                    segments={segments}
                    isFile={(path) => project.has(path)}
                    onOpen={(path, line, column) => void open(path, { line, column })}
                  />
                ) : (
                  <Problems problems={problemList} onOpen={(path, line, column) => void open(path, { line, column })} />
                )}
              </div>
            )}
          </section>
        </div>

        {run.debugging && runner && (
          <>
            <Resizer
              direction="column"
              label="Resize the debugger"
              value={debuggerWidth}
              min={220}
              max={640}
              onResize={(d) => setDebuggerWidth((w) => clamp(w - d, 220, 640))}
            />
            <Variables
              width={debuggerWidth}
              stop={stop}
              frame={frame}
              inspector={runner}
              onStep={step}
              onSelectFrame={(frame) => setPicked({ stop, frame })}
            />
          </>
        )}
      </div>
    </div>
  );
}

const none: readonly number[] = [];

/** NameInput edits a project's name in place: Enter or leaving it keeps the name, Escape does not. */
function NameInput(props: { name: string; onSubmit(name: string): string | undefined; onDone(): void }) {
  const { name, onSubmit, onDone } = props;
  const [value, setValue] = useState(name);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false); // Escape: no blur that follows keeps the name typed
  useEffect(() => input.current?.select(), []);
  const submit = () => {
    if (cancelled.current) return;
    if (value.trim() === name) return onDone();
    const problem = onSubmit(value);
    if (problem) setError(problem);
    else onDone();
  };
  return (
    <>
      <input
        ref={input}
        className={"project-rename" + (error ? " invalid" : "")}
        value={value}
        spellCheck={false}
        aria-label="Project name"
        aria-invalid={error !== ""}
        aria-describedby={error ? "project-rename-error" : undefined}
        onChange={(e) => {
          setValue(e.target.value);
          setError("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            cancelled.current = true;
            onDone();
          }
        }}
        onBlur={() => (error ? onDone() : submit())}
      />
      {error && (
        <span id="project-rename-error" className="project-rename-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

interface ResizerProps {
  direction: "row" | "column";
  label: string;
  /** The size of the pane it resizes, and the bounds of it. */
  value: number;
  min: number;
  max: number;
  onResize(delta: number): void;
}

/**
 * Resizer is the edge between two panes: dragging it, or the arrow keys while it has the focus,
 * report how far it moves, in pixels.
 */
function Resizer({ direction, label, value, min, max, onResize }: ResizerProps) {
  const last = useRef<number | null>(null);
  const at = (e: PointerEvent) => (direction === "column" ? e.clientX : e.clientY);
  return (
    <div
      className={"resizer " + direction}
      role="separator"
      aria-orientation={direction === "column" ? "vertical" : "horizontal"}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16;
        const keys = direction === "column" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
        const i = keys.indexOf(e.key);
        if (i < 0) return;
        e.preventDefault();
        onResize(i === 0 ? -step : step);
      }}
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

// The projects kept in the browser: a list of names, each with its own folder, and the one used
// last, which the editor opens at the start. The list is in localStorage; the folders are where
// Folders keeps them.
import { firstProject, starter, Workspace, type Folders } from "./workspace";

export interface BrowserProject {
  id: string;
  name: string;
}

export interface ProjectsState {
  /** The projects, in the order they were made. */
  projects: readonly BrowserProject[];
  /** The id of the project opened last. */
  last: string | null;
}

/** The part of localStorage the list uses. */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const key = "ant-editor-projects";

/** The name a new project gets, numbered after the first. */
const untitled = "Untitled";

export class BrowserProjects {
  private state: ProjectsState;
  private listeners = new Set<() => void>();

  /**
   * The list starts with the project the editor kept before it kept several, whose folder may
   * hold files already.
   */
  constructor(
    private folders: Folders,
    private storage: KeyValue | undefined = browserStorage(),
    private ids: () => string = newId,
  ) {
    this.state = load(storage) ?? { projects: [{ id: firstProject, name: untitled }], last: firstProject };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): ProjectsState => this.state;

  private update(state: ProjectsState) {
    this.state = state;
    try {
      this.storage?.setItem(key, JSON.stringify(state));
    } catch {}
    for (const listener of this.listeners) listener();
  }

  /** open opens a project's folder, with the starter program in it when it is empty. */
  async open(id: string): Promise<Workspace> {
    const project = this.state.projects.find((p) => p.id === id);
    if (!project) throw new Error(`There is no project ${id} in this browser`);
    const workspace = new Workspace(await this.folders.open(id), true, project.name, id);
    if ((await workspace.tree()).nodes.length === 0) await workspace.write("main.ant", starter);
    if (this.state.last !== id) this.update({ ...this.state, last: id });
    return workspace;
  }

  /** openLast opens the project used last, or a new one when there is none. */
  openLast(): Promise<Workspace> {
    const { projects, last } = this.state;
    const id = projects.some((p) => p.id === last) ? last : projects.at(-1)?.id;
    return id ? this.open(id) : this.create();
  }

  /** create makes a project with a name no other has, and opens it. */
  create(): Promise<Workspace> {
    const names = new Set(this.state.projects.map((p) => p.name));
    let name = untitled;
    for (let n = 2; names.has(name); n++) name = `${untitled} ${n}`;
    const id = this.ids();
    this.update({ ...this.state, projects: [...this.state.projects, { id, name }] });
    return this.open(id);
  }

  /** rename names a project, refusing an empty name and one another project has. */
  rename(id: string, name: string) {
    const trimmed = name.trim();
    if (trimmed === "") throw new Error("A project needs a name");
    if (this.state.projects.some((p) => p.id !== id && p.name === trimmed)) {
      throw new Error(`There is a project ${trimmed} already`);
    }
    this.update({
      ...this.state,
      projects: this.state.projects.map((p) => (p.id === id ? { ...p, name: trimmed } : p)),
    });
  }

  /** remove deletes a project and its files. */
  async remove(id: string): Promise<void> {
    await this.folders.remove(id);
    const projects = this.state.projects.filter((p) => p.id !== id);
    this.update({ projects, last: this.state.last === id ? null : this.state.last });
  }
}

function load(storage: KeyValue | undefined): ProjectsState | undefined {
  try {
    const saved = JSON.parse(storage?.getItem(key) ?? "null");
    if (!saved || !Array.isArray(saved.projects)) return undefined;
    const projects = saved.projects.filter(
      (p: unknown): p is BrowserProject =>
        typeof p === "object" &&
        p !== null &&
        typeof (p as BrowserProject).id === "string" &&
        typeof (p as BrowserProject).name === "string",
    );
    return { projects, last: typeof saved.last === "string" ? saved.last : null };
  } catch {
    return undefined;
  }
}

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function browserStorage(): KeyValue | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

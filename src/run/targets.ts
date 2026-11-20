// What Run and Debug start: the current file, which is whichever Ant file is open, or a file
// picked from the ones that ran before, which runs whatever tab is in front. The browser keeps
// the pick and the list for each project.
//
// A file the project does not have now is left out of view but stays in storage: a folder
// renamed a moment ago, another folder of the same name, or a tree cut short may show it again.

export interface TargetsState {
  /** The file picked to run, or null to run the current file. */
  selected: string | null;
  /** The files that ran, which can be picked, by path. */
  files: readonly string[];
}

/** The part of localStorage the targets use. */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const none: TargetsState = { selected: null, files: [] };

export class RunTargets {
  private saved: TargetsState = none; // as in storage
  private state: TargetsState = none; // as shown: the files the project has
  private exists: (path: string) => boolean = () => true;
  private listeners = new Set<() => void>();

  /** key names the project in storage; without storage, the targets last as long as the page. */
  constructor(
    private key: string,
    private storage: KeyValue | undefined = browserStorage(),
  ) {
    this.saved = load(storage, key);
    this.state = this.view();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): TargetsState => this.state;

  private view(): TargetsState {
    const files = this.saved.files.filter(this.exists);
    const selected = this.saved.selected !== null && files.includes(this.saved.selected) ? this.saved.selected : null;
    return { selected, files };
  }

  private show() {
    const next = this.view();
    if (next.selected === this.state.selected && same(next.files, this.state.files)) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  private save(selected: string | null, files: string[]) {
    this.saved = { selected, files: files.filter(isAnt).sort(compare) };
    if (selected !== null && !this.saved.files.includes(selected)) this.saved.selected = null;
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.saved));
    } catch {}
    this.show();
  }

  /** ran adds a file that ran to the ones that can be picked; the pick stays as it is. */
  ran(path: string) {
    if (isAnt(path) && !this.saved.files.includes(path)) this.save(this.saved.selected, [...this.saved.files, path]);
  }

  /** select picks a file to run, or with null the current file. */
  select(path: string | null) {
    if (path === null || this.state.files.includes(path)) this.save(path, [...this.saved.files]);
  }

  /** remove takes a file off the list, and the current file is picked if it was picked. */
  remove(path: string) {
    const selected = this.saved.selected === path ? null : this.saved.selected;
    this.save(
      selected,
      this.saved.files.filter((f) => f !== path),
    );
  }

  /** rename follows files that moved, given the new path of each by the old; one that is no longer an Ant file drops out. */
  rename(moved: ReadonlyMap<string, string>) {
    const to = (path: string) => moved.get(path) ?? path;
    if (!this.saved.files.some((f) => moved.has(f))) return;
    const selected = this.saved.selected === null ? null : to(this.saved.selected);
    this.save(selected, [...new Set(this.saved.files.map(to))]);
  }

  /** showOnly shows the files for which exists holds, and keeps the others in storage. */
  showOnly(exists: (path: string) => boolean) {
    this.exists = exists;
    this.show();
  }

  /** target is the file Run starts: the one picked, else the current file. */
  target(current: string | null): string | null {
    return this.state.selected ?? current;
  }
}

/** moveTargets gives the targets kept under one key to another, as when a project moves to a folder. */
export function moveTargets(from: string, to: string, storage: KeyValue | undefined = browserStorage()) {
  try {
    const saved = storage?.getItem(from);
    if (saved !== null && saved !== undefined) storage!.setItem(to, saved);
    storage?.removeItem(from);
  } catch {}
}

/** targetsKey is where the browser keeps the targets of a project. */
export function targetsKey(workspace: { inBrowser: boolean; name: string }): string {
  return "ant-editor-run:" + (workspace.inBrowser ? "(browser)" : workspace.name);
}

function load(storage: KeyValue | undefined, key: string): TargetsState {
  try {
    const saved = JSON.parse(storage?.getItem(key) ?? "null");
    if (!saved || !Array.isArray(saved.files)) return none;
    const files = saved.files.filter((f: unknown): f is string => typeof f === "string" && isAnt(f));
    return { selected: files.includes(saved.selected) ? saved.selected : null, files };
  } catch {
    return none;
  }
}

function browserStorage(): KeyValue | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function isAnt(path: string): boolean {
  return path.endsWith(".ant");
}

function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

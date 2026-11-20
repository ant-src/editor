// What Run and Debug start: the current file, which is whichever Ant file is open, or a file
// picked from the ones that ran before, which runs whatever tab is in front. The browser keeps
// the pick and the list for each project.

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
}

export class RunTargets {
  private state: TargetsState = { selected: null, files: [] };
  private listeners = new Set<() => void>();

  /** key names the project in storage; without storage, the targets last as long as the page. */
  constructor(
    private key: string,
    private storage: KeyValue | undefined = browserStorage(),
  ) {
    try {
      const saved = JSON.parse(this.storage?.getItem(key) ?? "null");
      if (saved && Array.isArray(saved.files)) {
        const files = saved.files.filter((f: unknown) => typeof f === "string");
        const selected = files.includes(saved.selected) ? saved.selected : null;
        this.state = { selected, files };
      }
    } catch {}
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): TargetsState => this.state;

  private update(selected: string | null, files: readonly string[]) {
    if (selected === this.state.selected && same(files, this.state.files)) return;
    this.state = { selected, files };
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.state));
    } catch {}
    for (const listener of this.listeners) listener();
  }

  /** ran adds a file that ran to the ones that can be picked; the pick stays as it is. */
  ran(path: string) {
    if (!this.state.files.includes(path)) this.update(this.state.selected, [...this.state.files, path].sort(compare));
  }

  /** select picks a file to run, or with null the current file. */
  select(path: string | null) {
    if (path !== null && !this.state.files.includes(path)) return;
    this.update(path, this.state.files);
  }

  /** remove takes a file off the list, and the current file is picked if it was picked. */
  remove(path: string) {
    const files = this.state.files.filter((f) => f !== path);
    this.update(this.state.selected === path ? null : this.state.selected, files);
  }

  /** rename follows files that moved, given the new path of each by the old. */
  rename(moved: ReadonlyMap<string, string>) {
    const to = (path: string) => moved.get(path) ?? path;
    const selected = this.state.selected === null ? null : to(this.state.selected);
    this.update(selected, [...new Set(this.state.files.map(to))].sort(compare));
  }

  /** keep drops the files that are gone from the project. */
  keep(exists: (path: string) => boolean) {
    const files = this.state.files.filter(exists);
    if (files.length === this.state.files.length) return;
    const selected = this.state.selected !== null && files.includes(this.state.selected) ? this.state.selected : null;
    this.update(selected, files);
  }

  /** target is the file Run starts: the one picked, else the current file when it is an Ant file. */
  target(current: string | null): string | null {
    return this.state.selected ?? current;
  }
}

function browserStorage(): KeyValue | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

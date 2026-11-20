// A project is an open folder and the buffers of its files: every Ant file has a buffer, so
// that imports resolve among them for the language server and for a run, and any other file gets
// one when it is opened. A buffer is dirty until it is saved to disk.
import { files, type Tree, type TreeNode, type Workspace } from "./fs/workspace";

/** TextBuffer is what the project needs of a Monaco text model. */
export interface TextBuffer {
  getValue(): string;
  setValue(text: string): void;
  /** A number that changes with the content and comes back when an edit is undone. */
  getAlternativeVersionId(): number;
  onDidChangeContent(listener: () => void): { dispose(): void };
  dispose(): void;
}

export type CreateBuffer = (path: string, text: string) => TextBuffer;

export interface ProjectState {
  name: string;
  tree: TreeNode[];
  truncated: boolean;
  /** The paths of buffers with changes that are not on disk. */
  dirty: ReadonlySet<string>;
}

interface Doc {
  buffer: TextBuffer;
  saved: number; // the buffer's version that is on disk
  modified: number; // the file's time of last change when it was read or written
  subscription: { dispose(): void };
}

export function isAnt(path: string): boolean {
  return path.endsWith(".ant");
}

export class Project {
  private docs = new Map<string, Doc>();
  private state: ProjectState;
  private listeners = new Set<() => void>();
  private refreshing: Promise<void> = Promise.resolve();
  /** Called when a file is gone from disk and its unchanged buffer is dropped. */
  onRemoved: (path: string) => void = () => {};

  constructor(
    readonly workspace: Workspace,
    private createBuffer: CreateBuffer,
  ) {
    this.state = { name: workspace.name, tree: [], truncated: false, dirty: new Set() };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): ProjectState => this.state;

  private update(patch: Partial<ProjectState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  /**
   * refresh reads the folder again: the tree, a buffer for each Ant file, and the content of
   * every buffer whose file changed on disk, unless the buffer has changes of its own.
   */
  refresh(): Promise<void> {
    const run = this.refreshing.then(() => this.sync());
    this.refreshing = run.catch(() => {});
    return run;
  }

  private async sync(): Promise<void> {
    const tree: Tree = await this.workspace.tree();
    const onDisk = new Set(files(tree.nodes));
    for (const path of onDisk) {
      const doc = this.docs.get(path);
      if (!doc && !isAnt(path)) continue;
      try {
        const file = await this.workspace.file(path);
        if (!doc) {
          this.add(path, await this.workspace.read(path), file.lastModified);
        } else if (file.lastModified !== doc.modified && !this.isDirty(path)) {
          const text = await this.workspace.read(path);
          if (text !== doc.buffer.getValue()) doc.buffer.setValue(text);
          doc.saved = doc.buffer.getAlternativeVersionId();
          doc.modified = file.lastModified;
        }
      } catch {
        // a file that cannot be read stays out of the buffers, or keeps the buffer it has
      }
    }
    for (const [path, doc] of this.docs) {
      if (!onDisk.has(path) && !this.isDirty(path)) {
        doc.subscription.dispose();
        doc.buffer.dispose();
        this.docs.delete(path);
        this.onRemoved(path);
      }
    }
    this.update({ tree: tree.nodes, truncated: tree.truncated, dirty: this.dirtySet() });
  }

  private add(path: string, text: string, modified: number): Doc {
    const buffer = this.createBuffer(path, text);
    const doc: Doc = {
      buffer,
      saved: buffer.getAlternativeVersionId(),
      modified,
      subscription: buffer.onDidChangeContent(() => {
        if (this.isDirty(path) !== this.state.dirty.has(path)) this.update({ dirty: this.dirtySet() });
      }),
    };
    this.docs.set(path, doc);
    return doc;
  }

  private dirtySet(): Set<string> {
    return new Set([...this.docs.keys()].filter((path) => this.isDirty(path)));
  }

  /** open returns the buffer of the file at path, reading the file when it has none yet. */
  async open(path: string): Promise<TextBuffer> {
    const doc = this.docs.get(path);
    if (doc) return doc.buffer;
    const file = await this.workspace.file(path);
    const text = await this.workspace.read(path);
    // another open may have read the file meanwhile
    return (this.docs.get(path) ?? this.add(path, text, file.lastModified)).buffer;
  }

  buffer(path: string): TextBuffer | undefined {
    return this.docs.get(path)?.buffer;
  }

  has(path: string): boolean {
    return this.docs.has(path);
  }

  isDirty(path: string): boolean {
    const doc = this.docs.get(path);
    return doc !== undefined && doc.buffer.getAlternativeVersionId() !== doc.saved;
  }

  /** save writes the buffer of path to disk. */
  async save(path: string): Promise<void> {
    const doc = this.docs.get(path);
    if (!doc) return;
    const version = doc.buffer.getAlternativeVersionId();
    await this.workspace.write(path, doc.buffer.getValue());
    doc.saved = version;
    doc.modified = (await this.workspace.file(path)).lastModified;
    this.update({ dirty: this.dirtySet() });
  }

  async saveAll(): Promise<void> {
    for (const path of this.state.dirty) await this.save(path);
  }

  async createFile(path: string): Promise<void> {
    await this.workspace.createFile(path);
    await this.refresh();
  }

  async createDirectory(path: string): Promise<void> {
    await this.workspace.createDirectory(path);
    await this.refresh();
  }

  /** sources are the program's modules as the editor shows them: every Ant buffer, by path. */
  sources(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [path, doc] of this.docs) {
      if (isAnt(path)) out[path] = doc.buffer.getValue();
    }
    return out;
  }

  dispose() {
    for (const doc of this.docs.values()) {
      doc.subscription.dispose();
      doc.buffer.dispose();
    }
    this.docs.clear();
    this.listeners.clear();
  }
}

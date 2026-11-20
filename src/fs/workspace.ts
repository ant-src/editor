// A workspace is the folder the editor works in, through the File System Access API: its tree,
// and reading, writing and creating the files in it. It is a folder on disk the user opened, or
// the folder the browser keeps for the page, where work starts before there is one on disk.
// Paths are slash-separated and relative to the folder, such as "main.ant" or "lib/util.ant".
import { handle, stored } from "./memory";

export interface TreeNode {
  name: string;
  path: string;
  kind: "file" | "directory";
  /** A directory's entries, directories first, each kind by name. */
  children?: TreeNode[];
}

export interface Tree {
  nodes: TreeNode[];
  /** Whether the folder holds more entries than maxEntries, so that some are left out. */
  truncated: boolean;
}

/** Directories the tree leaves out: they hold nothing to edit and may hold very much. */
const ignored = new Set([".git", "node_modules", ".DS_Store"]);

/** How many entries a tree lists before it stops. */
export const maxEntries = 5000;

/** The largest file the editor opens, in bytes. */
export const maxFileSize = 2 << 20;

export class Workspace {
  /**
   * inBrowser says that the folder is the one the browser keeps for the page, not one on disk;
   * label names it then.
   */
  constructor(
    readonly root: FileSystemDirectoryHandle,
    readonly inBrowser = false,
    private label?: string,
  ) {}

  get name(): string {
    return this.label ?? this.root.name;
  }

  /** tree lists the folder, recursively. */
  async tree(): Promise<Tree> {
    let left = maxEntries;
    const list = async (dir: FileSystemDirectoryHandle, prefix: string): Promise<TreeNode[]> => {
      const nodes: TreeNode[] = [];
      for await (const [name, handle] of dir.entries()) {
        if (ignored.has(name) || name.endsWith(".crswap")) continue; // Chrome's file of a write under way
        if (left-- <= 0) break;
        const path = prefix + name;
        if (handle.kind === "directory") {
          nodes.push({
            name,
            path,
            kind: "directory",
            children: await list(handle as FileSystemDirectoryHandle, path + "/"),
          });
        } else {
          nodes.push({ name, path, kind: "file" });
        }
      }
      return nodes.sort((a, b) => (a.kind === b.kind ? compareNames(a.name, b.name) : a.kind === "directory" ? -1 : 1));
    };
    const nodes = await list(this.root, "");
    return { nodes, truncated: left < 0 };
  }

  /** file returns the file at path as it is on disk now. */
  async file(path: string): Promise<File> {
    return (await this.fileHandle(path)).getFile();
  }

  async read(path: string): Promise<string> {
    const file = await this.file(path);
    if (file.size > maxFileSize) {
      throw new Error(`${path} is ${Math.round(file.size / 1024)} KB, more than the editor opens`);
    }
    return file.text();
  }

  /** write replaces the file's content on disk, creating the file when there is none. */
  async write(path: string, data: string | Blob): Promise<void> {
    const handle = await this.fileHandle(path, true);
    const writable = await handle.createWritable();
    try {
      await writable.write(data);
    } finally {
      await writable.close();
    }
  }

  /**
   * copyTo copies every file and directory of the folder into another, replacing the files
   * that are there under the same paths. It returns the paths of the files copied.
   */
  async copyTo(target: Workspace): Promise<string[]> {
    const copied: string[] = [];
    const copy = async (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.kind === "directory") {
          await target.directory(split(node.path), true);
          await copy(node.children ?? []);
        } else {
          await target.write(node.path, await this.file(node.path));
          copied.push(node.path);
        }
      }
    };
    await copy((await this.tree()).nodes);
    return copied;
  }

  /** existing lists which of the paths are files or directories of the folder. */
  async existing(paths: string[]): Promise<string[]> {
    const out: string[] = [];
    for (const path of paths) {
      if (await this.exists(path)) out.push(path);
    }
    return out;
  }

  /** clear removes everything in the folder. */
  async clear(): Promise<void> {
    const names: string[] = [];
    for await (const [name] of this.root.entries()) names.push(name);
    for (const name of names) await this.root.removeEntry(name, { recursive: true });
  }

  /** createFile makes an empty file, and the directories on the way to it. */
  async createFile(path: string): Promise<void> {
    if (await this.exists(path)) {
      throw new Error(`${path} already exists`);
    }
    await this.write(path, "");
  }

  /** createDirectory makes a directory, and the directories on the way to it. */
  async createDirectory(path: string): Promise<void> {
    if (await this.exists(path)) {
      throw new Error(`${path} already exists`);
    }
    await this.directory(split(path), true);
  }

  /** kind says whether path is a file or a directory of the folder, or undefined when it is neither. */
  async kind(path: string): Promise<"file" | "directory" | undefined> {
    const names = split(path);
    const name = names.pop()!;
    try {
      const dir = await this.directory(names, false);
      try {
        await dir.getFileHandle(name);
        return "file";
      } catch (err) {
        if (!isTypeMismatch(err)) throw err;
        return "directory";
      }
    } catch (err) {
      if (isNotFound(err) || isTypeMismatch(err)) return undefined;
      throw err;
    }
  }

  /**
   * rename moves the file or directory at from to the path to, making the directories on the way.
   * It refuses a path that exists, and a directory moved into itself.
   */
  async rename(from: string, to: string): Promise<void> {
    split(to);
    if (from === to) return;
    if (to.startsWith(from + "/")) throw new Error(`${from} cannot move into itself`);
    const kind = await this.kind(from);
    if (!kind) throw new Error(`${from} does not exist`);
    if (await this.exists(to)) throw new Error(`${to} already exists`);
    const copy = async (from: string, to: string, kind: "file" | "directory") => {
      if (kind === "file") return this.write(to, await this.file(from));
      await this.directory(split(to), true);
      for await (const [name, handle] of (await this.directory(split(from), false)).entries()) {
        await copy(from + "/" + name, to + "/" + name, handle.kind);
      }
    };
    await copy(from, to, kind);
    await this.remove(from);
  }

  /** remove deletes the file or the directory, with everything in it, at path. */
  async remove(path: string): Promise<void> {
    const names = split(path);
    const name = names.pop()!;
    await (await this.directory(names, false)).removeEntry(name, { recursive: true });
  }

  async exists(path: string): Promise<boolean> {
    const names = split(path);
    const name = names.pop()!;
    try {
      const dir = await this.directory(names, false);
      try {
        await dir.getFileHandle(name);
      } catch (err) {
        if (!isTypeMismatch(err)) throw err;
      }
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      if (isTypeMismatch(err)) return true; // a file where the path needs a directory
      throw err;
    }
  }

  private async fileHandle(path: string, create = false): Promise<FileSystemFileHandle> {
    const names = split(path);
    const name = names.pop()!;
    const dir = await this.directory(names, create);
    return dir.getFileHandle(name, { create });
  }

  private async directory(names: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
    let dir = this.root;
    for (const name of names) {
      dir = await dir.getDirectoryHandle(name, { create });
    }
    return dir;
  }
}

/** split returns the names of a path, or throws when it is not a path inside the folder. */
export function split(path: string): string[] {
  const names = path.split("/");
  if (path === "" || names.some((n) => n === "" || n === "." || n === ".." || n.includes("\\"))) {
    throw new Error(`"${path}" is not a path in the folder`);
  }
  return names;
}

/** dirname is the directory of a path, "" for a file at the top. */
export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** files lists the paths of a tree's files, in the tree's order. */
export function files(nodes: TreeNode[]): string[] {
  return nodes.flatMap((n) => (n.kind === "directory" ? files(n.children ?? []) : [n.path]));
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compareNames(a: string, b: string): number {
  return collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

function isNotFound(err: unknown): boolean {
  return (err as { name?: string })?.name === "NotFoundError";
}

function isTypeMismatch(err: unknown): boolean {
  return (err as { name?: string })?.name === "TypeMismatchError";
}

declare global {
  interface Window {
    showDirectoryPicker?(options?: { id?: string; mode?: "read" | "readwrite" }): Promise<FileSystemDirectoryHandle>;
  }
}

/** supported says whether the browser lets a page open a local folder. */
export function supported(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

/** pickFolder asks the user for a folder to work in, or returns undefined when they cancel. */
export async function pickFolder(): Promise<Workspace | undefined> {
  try {
    return new Workspace(await window.showDirectoryPicker!({ id: "ant-editor", mode: "readwrite" }));
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return undefined;
    throw err;
  }
}

/** The program a new workspace starts with. */
export const starter = `// Welcome to Ant. Press Run, or set a breakpoint in the gutter and press Debug.
func greet(name: string): string {
  "Hello, \${name}!"
}

for name in ["world", "ant"] {
  println(greet(name))
}
`;

/**
 * browserWorkspace opens the folder the browser keeps for the page, which outlives the page, and
 * puts the starter program there when it is empty. It is in the origin private file system, or,
 * where a page cannot write there (Safari before 26, a private window), in localStorage.
 */
export async function browserWorkspace(): Promise<Workspace> {
  const start = async (root: FileSystemDirectoryHandle) => {
    const workspace = new Workspace(root, true, "Untitled");
    if ((await workspace.tree()).nodes.length === 0) await workspace.write("main.ant", starter);
    return workspace;
  };
  try {
    if (typeof FileSystemFileHandle.prototype.createWritable !== "function") throw new Error("no createWritable");
    return await start(
      await (await navigator.storage.getDirectory()).getDirectoryHandle("workspace", { create: true }),
    );
  } catch {
    return start(handle(stored("ant-editor-workspace")));
  }
}

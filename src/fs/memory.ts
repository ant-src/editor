// An in-memory folder with the part of the File System Access API the editor uses. It is the
// folder kept for the page where the browser has no origin private file system that a page can
// write to, and the folder of the tests.

function error(name: string, message: string): Error {
  return Object.assign(new Error(message), { name });
}

export class MemoryFile {
  readonly kind = "file";
  lastModified = 1;

  constructor(
    readonly name: string,
    public text = "",
    private changed?: () => void,
  ) {}

  /** set changes the file as another program would. */
  set(text: string) {
    this.text = text;
    this.lastModified++;
    this.changed?.();
  }

  async getFile(): Promise<File> {
    return new File([this.text], this.name, { lastModified: this.lastModified });
  }

  async createWritable() {
    let written = "";
    return {
      write: async (data: string | Blob) => void (written += typeof data === "string" ? data : await data.text()),
      close: async () => this.set(written),
    };
  }
}

export class MemoryDirectory {
  readonly kind = "directory";
  readonly items = new Map<string, MemoryDirectory | MemoryFile>();

  /** changed is called after every change to the folder, at any depth. */
  constructor(
    readonly name: string,
    private changed?: () => void,
  ) {}

  async *entries(): AsyncGenerator<[string, MemoryDirectory | MemoryFile]> {
    yield* this.items.entries();
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MemoryFile> {
    const item = this.items.get(name);
    if (item instanceof MemoryFile) return item;
    if (item) throw error("TypeMismatchError", `${name} is a directory`);
    if (!options?.create) throw error("NotFoundError", `${name} is not found`);
    const file = new MemoryFile(name, "", this.changed);
    this.items.set(name, file);
    this.changed?.();
    return file;
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MemoryDirectory> {
    const item = this.items.get(name);
    if (item instanceof MemoryDirectory) return item;
    if (item) throw error("TypeMismatchError", `${name} is a file`);
    if (!options?.create) throw error("NotFoundError", `${name} is not found`);
    const dir = new MemoryDirectory(name, this.changed);
    this.items.set(name, dir);
    this.changed?.();
    return dir;
  }

  async removeEntry(name: string, _options?: { recursive?: boolean }) {
    if (!this.items.delete(name)) throw error("NotFoundError", `${name} is not found`);
    this.changed?.();
  }

  /** at returns the file at a path, which must exist. */
  at(path: string): MemoryFile {
    const names = path.split("/");
    return this.parent(names).items.get(names.at(-1)!) as MemoryFile;
  }

  remove(path: string) {
    const names = path.split("/");
    this.parent(names).items.delete(names.at(-1)!);
    this.changed?.();
  }

  /** add puts a file, or a directory for a path that ends in "/", and the directories on the way. */
  add(path: string, text = "") {
    const names = path.split("/");
    const last = names.pop()!;
    const dir = names.reduce<MemoryDirectory>((dir, n) => {
      let next = dir.items.get(n);
      if (!next) dir.items.set(n, (next = new MemoryDirectory(n, this.changed)));
      return next as MemoryDirectory;
    }, this);
    if (last !== "") dir.items.set(last, new MemoryFile(last, text, this.changed));
  }

  /** dump lists the folder's files by path, and its empty directories as paths that end in "/". */
  dump(prefix = ""): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [name, item] of this.items) {
      if (item instanceof MemoryFile) out[prefix + name] = item.text;
      else if (item.items.size === 0) out[prefix + name + "/"] = "";
      else Object.assign(out, item.dump(prefix + name + "/"));
    }
    return out;
  }

  private parent(names: string[]): MemoryDirectory {
    return names.slice(0, -1).reduce<MemoryDirectory>((dir, name) => dir.items.get(name) as MemoryDirectory, this);
  }
}

/** folder makes a folder from files by path, such as { "lib/util.ant": "..." }. */
export function folder(name: string, files: Record<string, string>, changed?: () => void): MemoryDirectory {
  const root = new MemoryDirectory(name, changed);
  for (const [path, text] of Object.entries(files)) root.add(path, text);
  return root;
}

/** handle is the folder as the handle a directory picker returns. */
export function handle(dir: MemoryDirectory): FileSystemDirectoryHandle {
  return dir as unknown as FileSystemDirectoryHandle;
}

/**
 * stored is a folder kept in localStorage under key, as it was when the page last changed it.
 * Where localStorage is unavailable or full, the folder lasts as long as the page.
 */
export function stored(key: string): MemoryDirectory {
  let files: Record<string, string> = {};
  try {
    files = JSON.parse(localStorage.getItem(key) ?? "{}");
  } catch {}
  const root: MemoryDirectory = folder("workspace", files, () => {
    try {
      localStorage.setItem(key, JSON.stringify(root.dump()));
    } catch {}
  });
  return root;
}

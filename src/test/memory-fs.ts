// An in-memory folder with the part of the File System Access API the editor uses, for tests.

function error(name: string, message: string): Error {
  return Object.assign(new Error(message), { name });
}

export class MemoryFile {
  readonly kind = "file";
  lastModified = 1;

  constructor(
    readonly name: string,
    public text = "",
  ) {}

  /** set changes the file as another program would. */
  set(text: string) {
    this.text = text;
    this.lastModified++;
  }

  async getFile() {
    const { text, lastModified, name } = this;
    return { name, lastModified, size: new TextEncoder().encode(text).length, text: async () => text };
  }

  async createWritable() {
    let written = "";
    return {
      write: async (data: string | { text(): Promise<string> }) =>
        void (written += typeof data === "string" ? data : await data.text()),
      close: async () => this.set(written),
    };
  }
}

export class MemoryDirectory {
  readonly kind = "directory";
  readonly items = new Map<string, MemoryDirectory | MemoryFile>();

  constructor(readonly name: string) {}

  async *entries(): AsyncGenerator<[string, MemoryDirectory | MemoryFile]> {
    yield* this.items.entries();
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<MemoryFile> {
    const item = this.items.get(name);
    if (item instanceof MemoryFile) return item;
    if (item) throw error("TypeMismatchError", `${name} is a directory`);
    if (!options?.create) throw error("NotFoundError", `${name} is not found`);
    const file = new MemoryFile(name);
    this.items.set(name, file);
    return file;
  }

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MemoryDirectory> {
    const item = this.items.get(name);
    if (item instanceof MemoryDirectory) return item;
    if (item) throw error("TypeMismatchError", `${name} is a file`);
    if (!options?.create) throw error("NotFoundError", `${name} is not found`);
    const dir = new MemoryDirectory(name);
    this.items.set(name, dir);
    return dir;
  }

  async removeEntry(name: string) {
    if (!this.items.delete(name)) throw error("NotFoundError", `${name} is not found`);
  }

  /** at returns the file at a path, which must exist. */
  at(path: string): MemoryFile {
    const names = path.split("/");
    return this.parent(names).items.get(names.at(-1)!) as MemoryFile;
  }

  remove(path: string) {
    const names = path.split("/");
    this.parent(names).items.delete(names.at(-1)!);
  }

  private parent(names: string[]): MemoryDirectory {
    return names.slice(0, -1).reduce<MemoryDirectory>((dir, name) => dir.items.get(name) as MemoryDirectory, this);
  }
}

/** folder makes a folder from files by path, such as { "lib/util.ant": "..." }. */
export function folder(name: string, files: Record<string, string>): MemoryDirectory {
  const root = new MemoryDirectory(name);
  for (const [path, text] of Object.entries(files)) {
    const names = path.split("/");
    let dir = root;
    for (const n of names.slice(0, -1)) {
      let next = dir.items.get(n);
      if (!next) dir.items.set(n, (next = new MemoryDirectory(n)));
      dir = next as MemoryDirectory;
    }
    dir.items.set(names.at(-1)!, new MemoryFile(names.at(-1)!, text));
  }
  return root;
}

/** handle is the folder as the handle a directory picker returns. */
export function handle(dir: MemoryDirectory): FileSystemDirectoryHandle {
  return dir as unknown as FileSystemDirectoryHandle;
}

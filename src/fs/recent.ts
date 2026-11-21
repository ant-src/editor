// The folders on disk opened lately, newest first, for opening again with a click. The browser
// keeps each folder's handle in IndexedDB; opening one asks the user to allow access again
// unless they allowed it on every visit.
import { Workspace } from "./workspace";

/** How many folders the list keeps. */
export const maxRecent = 8;

export interface RecentFolder {
  id: string;
  name: string;
}

/** A folder as the browser keeps it: its handle, and when it was opened last. */
export interface FolderEntry extends RecentFolder {
  handle: FileSystemDirectoryHandle;
  opened: number;
}

/** Where the entries are kept: IndexedDB in the browser. */
export interface FolderStore {
  all(): Promise<FolderEntry[]>;
  put(entry: FolderEntry): Promise<void>;
  delete(id: string): Promise<void>;
}

export class RecentFolders {
  private state: readonly RecentFolder[] = [];
  private listeners = new Set<() => void>();

  constructor(
    private store: FolderStore = indexedStore(),
    private ids: () => string = newId,
    private now: () => number = Date.now,
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): readonly RecentFolder[] => this.state;

  private async entries(): Promise<FolderEntry[]> {
    return (await this.store.all()).sort((a, b) => b.opened - a.opened);
  }

  /** refresh reads the list again, which another tab may have changed. */
  async refresh(): Promise<void> {
    const entries = await this.entries();
    this.state = entries.map(({ id, name }) => ({ id, name }));
    for (const listener of this.listeners) listener();
  }

  /**
   * add puts a folder at the top of the list, in place of its entry when it has one, and drops
   * the oldest past maxRecent. It returns the folder's id.
   */
  async add(handle: FileSystemDirectoryHandle): Promise<string> {
    const entries = await this.entries();
    let id: string | undefined;
    for (const entry of entries) {
      if (await same(entry.handle, handle)) id = entry.id;
    }
    id ??= this.ids();
    await this.store.put({ id, name: handle.name, handle, opened: this.now() });
    for (const old of entries.filter((e) => e.id !== id).slice(maxRecent - 1)) await this.store.delete(old.id);
    await this.refresh();
    return id;
  }

  /**
   * open opens a folder of the list, asking for access when the browser needs to. It returns
   * undefined when the user does not allow it, and throws when the folder is gone.
   */
  async open(id: string): Promise<Workspace | undefined> {
    const entry = (await this.store.all()).find((e) => e.id === id);
    if (!entry) throw new Error("The folder is no longer on the list");
    const { handle } = entry;
    if ((await handle.queryPermission?.({ mode: "readwrite" })) !== "granted") {
      if ((await handle.requestPermission?.({ mode: "readwrite" })) !== "granted") return undefined;
    }
    try {
      await handle.values().next(); // a folder moved or deleted fails here
    } catch {
      throw new Error(`${entry.name} was moved or deleted`);
    }
    await this.store.put({ ...entry, opened: this.now() });
    await this.refresh();
    return new Workspace(handle, false, undefined, id);
  }

  /** forget takes a folder off the list; the folder itself stays as it is. */
  async forget(id: string): Promise<void> {
    await this.store.delete(id);
    await this.refresh();
  }
}

async function same(a: FileSystemDirectoryHandle, b: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    return await a.isSameEntry(b);
  } catch {
    return false;
  }
}

declare global {
  interface FileSystemHandle {
    queryPermission?(descriptor: { mode: "read" | "readwrite" }): Promise<PermissionState>;
    requestPermission?(descriptor: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  }
}

/** indexedStore keeps the entries in the browser's IndexedDB, which can hold folder handles. */
export function indexedStore(): FolderStore {
  let opened: Promise<IDBDatabase> | undefined;
  const db = () =>
    (opened ??= new Promise((resolve, reject) => {
      const request = indexedDB.open("ant-editor", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("folders", { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }));
  const run = async <T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest): Promise<T> => {
    const store = (await db()).transaction("folders", mode).objectStore("folders");
    return new Promise((resolve, reject) => {
      const request = work(store);
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  };
  return {
    all: () => run<FolderEntry[]>("readonly", (s) => s.getAll()),
    put: (entry) => run<void>("readwrite", (s) => s.put(entry)),
    delete: (id) => run<void>("readwrite", (s) => s.delete(id)),
  };
}

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

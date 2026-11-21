import { expect, test } from "vitest";
import { maxRecent, RecentFolders, type FolderEntry, type FolderStore } from "./recent";

/** A folder handle as a picker returns it: one object per pick, the same folder for the same path. */
function folder(path: string, opts: { permission?: PermissionState; allow?: boolean; gone?: boolean } = {}) {
  const state = { permission: opts.permission ?? "granted", asked: 0, gone: opts.gone ?? false };
  const handle = {
    kind: "directory",
    name: path.split("/").at(-1)!,
    path,
    state,
    isSameEntry: async (other: { path?: string }) => other.path === path,
    queryPermission: async () => state.permission,
    requestPermission: async () => {
      state.asked++;
      if (opts.allow) state.permission = "granted";
      return state.permission;
    },
    values: () => ({
      next: async () => {
        if (state.gone) throw Object.assign(new Error("gone"), { name: "NotFoundError" });
        return { done: true, value: undefined };
      },
    }),
  };
  return handle as unknown as FileSystemDirectoryHandle & { state: typeof state };
}

function setup() {
  const data = new Map<string, FolderEntry>();
  const store: FolderStore = {
    all: async () => [...data.values()],
    put: async (e) => void data.set(e.id, e),
    delete: async (id) => void data.delete(id),
  };
  let n = 0;
  let clock = 0;
  return {
    data,
    recent: new RecentFolders(
      store,
      () => `f${++n}`,
      () => ++clock,
    ),
  };
}

test("folders opened join the list, newest first, once each", async () => {
  const { recent } = setup();
  expect(await recent.add(folder("/a/app"))).toBe("f1");
  expect(await recent.add(folder("/b/app"))).toBe("f2");
  expect(await recent.add(folder("/a/app"))).toBe("f1"); // picked again: the same entry
  expect(recent.getState()).toEqual([
    { id: "f1", name: "app" },
    { id: "f2", name: "app" },
  ]);
});

test("the list keeps the newest folders", async () => {
  const { recent } = setup();
  for (let i = 0; i < maxRecent + 2; i++) await recent.add(folder(`/f${i}`));
  expect(recent.getState().map((f) => f.name)).toEqual(
    Array.from({ length: maxRecent }, (_, i) => `f${maxRecent + 1 - i}`),
  );
});

test("opening a folder asks for access only when the browser needs to", async () => {
  const { data, recent } = setup();
  const allowed = folder("/allowed");
  const asked = folder("/asked", { permission: "prompt", allow: true });
  const refused = folder("/refused", { permission: "prompt" });
  for (const f of [allowed, asked, refused]) await recent.add(f);
  const workspace = await recent.open("f1");
  expect([workspace?.name, workspace?.id, workspace?.inBrowser, allowed.state.asked]).toEqual([
    "allowed",
    "f1",
    false,
    0,
  ]);
  expect((await recent.open("f2"))?.name).toBe("asked");
  expect(asked.state.asked).toBe(1);
  expect(await recent.open("f3")).toBeUndefined();
  expect(recent.getState()[0].name).toBe("asked"); // opened last
  expect(data.size).toBe(3);
});

test("a folder that is gone says so, and forgetting it leaves the folder alone", async () => {
  const { recent } = setup();
  await recent.add(folder("/gone", { gone: true }));
  await expect(recent.open("f1")).rejects.toThrow("gone was moved or deleted");
  await recent.forget("f1");
  expect(recent.getState()).toEqual([]);
  await expect(recent.open("f1")).rejects.toThrow("no longer on the list");
});

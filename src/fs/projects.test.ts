import { expect, test } from "vitest";
import { folder, handle, type MemoryDirectory } from "./memory";
import { BrowserProjects, type KeyValue } from "./projects";
import type { Folders } from "./workspace";

function setup(saved: Record<string, string> = {}) {
  const data = new Map(Object.entries(saved));
  const storage: KeyValue = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  const dirs = new Map<string, MemoryDirectory>();
  const folders: Folders = {
    open: async (id) => {
      if (!dirs.has(id)) dirs.set(id, folder(id, {}));
      return handle(dirs.get(id)!);
    },
    remove: async (id) => void dirs.delete(id),
  };
  let n = 0;
  const projects = () => new BrowserProjects(folders, storage, () => `p${++n}`);
  return { data, dirs, projects };
}

test("the first start opens the project kept before there were several, with its files", async () => {
  const { dirs, projects } = setup();
  dirs.set("workspace", folder("workspace", { "app.ant": "x" }));
  const list = projects();
  expect(list.getState()).toEqual({ projects: [{ id: "workspace", name: "Untitled" }], last: "workspace" });
  const workspace = await list.openLast();
  expect([workspace.id, workspace.name, workspace.inBrowser]).toEqual(["workspace", "Untitled", true]);
  expect(dirs.get("workspace")!.dump()).toEqual({ "app.ant": "x" });
});

test("a new project has a name of its own and the starter program, and opens next time", async () => {
  const { dirs, projects } = setup();
  const list = projects();
  await list.openLast();
  const second = await list.create();
  const third = await list.create();
  expect([second.name, third.name]).toEqual(["Untitled 2", "Untitled 3"]);
  expect(Object.keys(dirs.get("p1")!.dump())).toEqual(["main.ant"]);
  expect((await projects().openLast()).id).toBe("p2");
});

test("a project renames to a name no other has", async () => {
  const { projects } = setup();
  const list = projects();
  await list.create();
  list.rename("p1", "  parser ");
  expect(list.getState().projects.map((p) => p.name)).toEqual(["Untitled", "parser"]);
  expect(() => list.rename("workspace", "parser")).toThrow("There is a project parser already");
  expect(() => list.rename("workspace", " ")).toThrow("A project needs a name");
  expect(
    projects()
      .getState()
      .projects.map((p) => p.name),
  ).toEqual(["Untitled", "parser"]);
});

test("removing a project deletes its files, and the last one gone leaves a new one to make", async () => {
  const { dirs, projects } = setup();
  const list = projects();
  await list.openLast();
  await list.create();
  await list.remove("p1");
  expect(dirs.has("p1")).toBe(false);
  expect(list.getState()).toEqual({ projects: [{ id: "workspace", name: "Untitled" }], last: null });
  expect((await list.openLast()).id).toBe("workspace");
  await list.remove("workspace");
  const next = await list.openLast();
  expect([next.id, next.name]).toEqual(["p2", "Untitled"]);
});

test("a list that does not parse starts over", () => {
  const { projects } = setup({ "ant-editor-projects": "{" });
  expect(
    projects()
      .getState()
      .projects.map((p) => p.id),
  ).toEqual(["workspace"]);
});

import { expect, test } from "vitest";
import { Workspace } from "./fs/workspace";
import { Project, type TextBuffer } from "./project";
import { folder, handle } from "./fs/memory";

// A buffer as Monaco's model behaves: a version for each content, which undo returns to.
class Buffer implements TextBuffer {
  private version = 1;
  private next = 2;
  private listeners = new Set<() => void>();
  private history: [string, number][] = [];
  disposed = false;
  constructor(private text: string) {}
  getValue = () => this.text;
  getAlternativeVersionId = () => this.version;
  setValue(text: string) {
    this.history.push([this.text, this.version]);
    this.text = text;
    this.version = this.next++;
    for (const l of this.listeners) l();
  }
  undo() {
    [this.text, this.version] = this.history.pop()!;
    for (const l of this.listeners) l();
  }
  onDidChangeContent(listener: () => void) {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }
  dispose() {
    this.disposed = true;
  }
}

async function open(tree: Record<string, string>) {
  const dir = folder("project", tree);
  const buffers = new Map<string, Buffer>();
  const project = new Project(new Workspace(handle(dir)), (path, text) => {
    const buffer = new Buffer(text);
    buffers.set(path, buffer);
    return buffer;
  });
  await project.refresh();
  return { dir, project, buffers };
}

test("opening a folder gives every Ant file a buffer, and other files one when opened", async () => {
  const { project } = await open({ "main.ant": "a", "lib/util.ant": "b", "notes.md": "c" });
  expect(project.getState().name).toBe("project");
  expect(project.getState().tree.map((n) => n.path)).toEqual(["lib", "main.ant", "notes.md"]);
  expect(project.sources()).toEqual({ "main.ant": "a", "lib/util.ant": "b" });
  expect(project.has("notes.md")).toBe(false);
  expect((await project.open("notes.md")).getValue()).toBe("c");
  expect(project.sources()).toEqual({ "main.ant": "a", "lib/util.ant": "b" });
});

test("an edit makes a buffer dirty until it is saved to disk", async () => {
  const { dir, project, buffers } = await open({ "main.ant": "one" });
  let changes = 0;
  project.subscribe(() => changes++);
  const buffer = await project.open("main.ant");
  buffer.setValue("two");
  expect(project.isDirty("main.ant")).toBe(true);
  expect(project.getState().dirty).toEqual(new Set(["main.ant"]));
  expect(changes).toBe(1);
  expect(dir.at("main.ant").text).toBe("one");
  expect(project.sources()).toEqual({ "main.ant": "two" }); // a run takes what the editor shows

  await project.save("main.ant");
  expect(dir.at("main.ant").text).toBe("two");
  expect(project.getState().dirty.size).toBe(0);

  buffer.setValue("three");
  expect(project.isDirty("main.ant")).toBe(true);
  buffers.get("main.ant")!.undo();
  expect(project.getState().dirty.size).toBe(0); // undone back to what is on disk
});

test("saveAll saves every dirty buffer", async () => {
  const { dir, project } = await open({ "a.ant": "", "b.ant": "", "c.ant": "c" });
  (await project.open("a.ant")).setValue("A");
  (await project.open("b.ant")).setValue("B");
  await project.saveAll();
  expect([dir.at("a.ant").text, dir.at("b.ant").text, dir.at("c.ant").text]).toEqual(["A", "B", "c"]);
  expect(project.getState().dirty.size).toBe(0);
});

test("createFile adds the file to the tree and to the buffers", async () => {
  const { dir, project } = await open({ "main.ant": "" });
  await project.createFile("lib/new.ant");
  expect(dir.at("lib/new.ant").text).toBe("");
  expect(project.getState().tree.map((n) => n.path)).toEqual(["lib", "main.ant"]);
  expect(project.has("lib/new.ant")).toBe(true);
  await project.createDirectory("data");
  expect(project.getState().tree.map((n) => n.path)).toEqual(["data", "lib", "main.ant"]);
  await expect(project.createFile("main.ant")).rejects.toThrow("already exists");
});

test("refresh takes changes made on disk, and keeps the buffers with changes of their own", async () => {
  const { dir, project, buffers } = await open({ "main.ant": "one", "lib.ant": "lib", "old.ant": "old" });
  const removed: string[] = [];
  project.onRemoved = (path) => removed.push(path);

  (await project.open("lib.ant")).setValue("mine");
  dir.at("main.ant").set("changed outside");
  dir.at("lib.ant").set("changed outside too");
  dir.remove("old.ant");
  await (await dir.getFileHandle("added.ant", { create: true })).createWritable().then(async (w) => {
    await w.write("added");
    await w.close();
  });
  await project.refresh();

  expect(project.sources()).toEqual({ "main.ant": "changed outside", "lib.ant": "mine", "added.ant": "added" });
  expect(project.getState().dirty).toEqual(new Set(["lib.ant"]));
  expect(removed).toEqual(["old.ant"]);
  expect(buffers.get("old.ant")!.disposed).toBe(true);

  await project.save("lib.ant");
  expect(dir.at("lib.ant").text).toBe("mine");
  await project.refresh();
  expect(project.getState().dirty.size).toBe(0);
});

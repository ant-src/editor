import { expect, test } from "vitest";
import { folder, handle } from "./memory";
import { files, maxEntries, split, Workspace } from "./workspace";

function open(tree: Record<string, string>) {
  const dir = folder("project", tree);
  return { dir, workspace: new Workspace(handle(dir)) };
}

test("the tree lists directories first, by name, and leaves out .git and node_modules", async () => {
  const { workspace } = open({
    "main.ant": "",
    "README.md": "",
    "lib/util.ant": "",
    "lib/deep/x10.ant": "",
    "lib/deep/x9.ant": "",
    ".git/HEAD": "",
    "node_modules/pkg/index.js": "",
    ".gitignore": "",
  });
  const { nodes, truncated } = await workspace.tree();
  expect(truncated).toBe(false);
  expect(workspace.name).toBe("project");
  expect(nodes.map((n) => [n.kind, n.path])).toEqual([
    ["directory", "lib"],
    ["file", ".gitignore"],
    ["file", "main.ant"],
    ["file", "README.md"],
  ]);
  expect(files(nodes)).toEqual([
    "lib/deep/x9.ant",
    "lib/deep/x10.ant",
    "lib/util.ant",
    ".gitignore",
    "main.ant",
    "README.md",
  ]);
});

test("a tree stops at the most entries it lists", async () => {
  const many = Object.fromEntries(Array.from({ length: maxEntries + 5 }, (_, i) => [`f${i}.txt`, ""]));
  const { nodes, truncated } = await open(many).workspace.tree();
  expect(truncated).toBe(true);
  expect(nodes.length).toBe(maxEntries);
});

test("read and write go to the files on disk", async () => {
  const { dir, workspace } = open({ "lib/util.ant": "one" });
  expect(await workspace.read("lib/util.ant")).toBe("one");
  await workspace.write("lib/util.ant", "two");
  expect(dir.at("lib/util.ant").text).toBe("two");
  await expect(workspace.read("lib/none.ant")).rejects.toThrow();
});

test("createFile and createDirectory make what is missing and refuse what exists", async () => {
  const { dir, workspace } = open({ "main.ant": "x" });
  await workspace.createFile("src/app/new.ant");
  expect(dir.at("src/app/new.ant").text).toBe("");
  await workspace.createDirectory("assets/img");
  expect(await workspace.exists("assets/img")).toBe(true);
  expect(await workspace.exists("assets/none")).toBe(false);
  await expect(workspace.createFile("main.ant")).rejects.toThrow("already exists");
  await expect(workspace.createFile("src")).rejects.toThrow("already exists");
  await expect(workspace.createDirectory("main.ant")).rejects.toThrow("already exists");
  expect(dir.at("main.ant").text).toBe("x");
});

test("a path stays inside the folder", async () => {
  const { workspace } = open({});
  for (const path of ["", "../x.ant", "a//b", "./a", "a/", "/a", "a\\b"]) {
    expect(() => split(path), path).toThrow("not a path");
    await expect(workspace.createFile(path)).rejects.toThrow();
  }
});

test("copyTo copies the folder into another, and existing says what it would replace", async () => {
  const { workspace } = open({ "main.ant": "main", "lib/util.ant": "util", "notes.md": "notes" });
  await workspace.createDirectory("empty");
  const { dir, workspace: target } = open({ "main.ant": "old", "keep.txt": "keep" });
  expect(await target.existing(["main.ant", "lib/util.ant", "lib"])).toEqual(["main.ant"]);
  expect(await workspace.copyTo(target)).toEqual(["lib/util.ant", "main.ant", "notes.md"]);
  expect(["main.ant", "lib/util.ant", "notes.md", "keep.txt"].map((p) => dir.at(p).text)).toEqual([
    "main",
    "util",
    "notes",
    "keep",
  ]);
  expect(await target.exists("empty")).toBe(true);
});

test("clear empties the folder", async () => {
  const { workspace } = open({ "main.ant": "", "lib/util.ant": "" });
  await workspace.clear();
  expect((await workspace.tree()).nodes).toEqual([]);
});

test("a workspace in the browser has the name it is given", () => {
  const { dir } = open({});
  const workspace = new Workspace(handle(dir), true, "Untitled");
  expect([workspace.name, workspace.inBrowser]).toEqual(["Untitled", true]);
});

test("rename moves a file or a directory with everything in it, and refuses what exists", async () => {
  const { dir, workspace } = open({ "main.ant": "m", "lib/util.ant": "u", "lib/deep/x.ant": "x", "lib/empty/": "" });
  await workspace.rename("main.ant", "app/main.ant");
  expect(dir.dump()).toEqual({ "app/main.ant": "m", "lib/util.ant": "u", "lib/deep/x.ant": "x", "lib/empty/": "" });
  await workspace.rename("lib", "src/lib");
  expect(dir.dump()).toEqual({
    "app/main.ant": "m",
    "src/lib/util.ant": "u",
    "src/lib/deep/x.ant": "x",
    "src/lib/empty/": "",
  });
  await expect(workspace.rename("src/lib", "app/main.ant")).rejects.toThrow("app/main.ant already exists");
  await expect(workspace.rename("src", "src/inner")).rejects.toThrow("src cannot move into itself");
  await expect(workspace.rename("none.ant", "x.ant")).rejects.toThrow("none.ant does not exist");
  await expect(workspace.rename("app/main.ant", "../x.ant")).rejects.toThrow();
  expect(await workspace.kind("src/lib")).toBe("directory");
  expect(await workspace.kind("app/main.ant")).toBe("file");
  expect(await workspace.kind("app/none")).toBeUndefined();
});

test("remove deletes a file, or a directory and what is in it", async () => {
  const { dir, workspace } = open({ "main.ant": "m", "lib/util.ant": "u", "lib/deep/x.ant": "x" });
  await workspace.remove("lib");
  await workspace.remove("main.ant");
  expect(dir.dump()).toEqual({});
  await expect(workspace.remove("main.ant")).rejects.toThrow();
});

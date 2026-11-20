import { expect, test } from "vitest";
import { moveTargets, RunTargets, targetsKey, type KeyValue } from "./targets";

function memory(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

test("the current file runs until a file that ran is picked", () => {
  const targets = new RunTargets("p", memory());
  expect(targets.target("main.ant")).toBe("main.ant");
  expect(targets.target(null)).toBeNull();
  targets.ran("main.ant");
  targets.ran("lib/gen.ant");
  targets.ran("main.ant");
  targets.ran("notes.md");
  expect(targets.getState()).toEqual({ selected: null, files: ["lib/gen.ant", "main.ant"] });
  expect(targets.target("lib/gen.ant")).toBe("lib/gen.ant");
  targets.select("main.ant");
  expect(targets.target("lib/gen.ant")).toBe("main.ant");
  expect(targets.target(null)).toBe("main.ant");
  targets.select("never-ran.ant");
  expect(targets.getState().selected).toBe("main.ant");
  targets.select(null);
  expect(targets.target("lib/gen.ant")).toBe("lib/gen.ant");
});

test("a rename carries the pick along, even after the tree showed the new path first", () => {
  const targets = new RunTargets("p", memory());
  targets.ran("a.ant");
  targets.ran("lib/b.ant");
  targets.select("lib/b.ant");
  // the tree updates before the rename reaches the targets
  targets.showOnly((path) => path === "a.ant" || path === "src/b.ant");
  expect(targets.getState()).toEqual({ selected: null, files: ["a.ant"] });
  targets.rename(new Map([["lib/b.ant", "src/b.ant"]]));
  expect(targets.getState()).toEqual({ selected: "src/b.ant", files: ["a.ant", "src/b.ant"] });
});

test("a file renamed to one that is not an Ant file drops out, and the pick with it", () => {
  const targets = new RunTargets("p", memory());
  targets.ran("a.ant");
  targets.select("a.ant");
  targets.rename(new Map([["a.ant", "a.txt"]]));
  expect(targets.getState()).toEqual({ selected: null, files: [] });
  expect(targets.target(null)).toBeNull();
});

test("a file the project does not have is hidden, not forgotten", () => {
  const storage = memory();
  const targets = new RunTargets("p", storage);
  targets.ran("a.ant");
  targets.ran("gen.ant");
  targets.select("gen.ant");
  targets.showOnly((path) => path !== "gen.ant");
  expect(targets.getState()).toEqual({ selected: null, files: ["a.ant"] });
  targets.ran("b.ant"); // a change while gen.ant is hidden keeps it in storage
  targets.showOnly(() => true);
  expect(targets.getState()).toEqual({ selected: "gen.ant", files: ["a.ant", "b.ant", "gen.ant"] });
  targets.remove("gen.ant");
  expect(targets.getState()).toEqual({ selected: null, files: ["a.ant", "b.ant"] });
});

test("the browser keeps the targets for each project, and moves them with it", () => {
  const storage = memory();
  const first = new RunTargets("project", storage);
  first.ran("main.ant");
  first.select("main.ant");
  expect(new RunTargets("project", storage).getState()).toEqual({ selected: "main.ant", files: ["main.ant"] });
  expect(new RunTargets("other", storage).getState()).toEqual({ selected: null, files: [] });
  storage.data.set("broken", "{");
  expect(new RunTargets("broken", storage).getState()).toEqual({ selected: null, files: [] });

  moveTargets("project", "folder", storage);
  expect(new RunTargets("folder", storage).getState()).toEqual({ selected: "main.ant", files: ["main.ant"] });
  expect(new RunTargets("project", storage).getState()).toEqual({ selected: null, files: [] });
  expect(targetsKey({ inBrowser: true, name: "Untitled" })).toBe("ant-editor-run:(browser)");
  expect(targetsKey({ inBrowser: false, name: "app" })).toBe("ant-editor-run:app");
});

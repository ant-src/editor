import { expect, test } from "vitest";
import { RunTargets, type KeyValue } from "./targets";

function memory(): KeyValue & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

test("the current file runs until a file that ran is picked", () => {
  const targets = new RunTargets("p", memory());
  expect(targets.target("main.ant")).toBe("main.ant");
  expect(targets.target(null)).toBeNull();
  targets.ran("main.ant");
  targets.ran("lib/gen.ant");
  targets.ran("main.ant");
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

test("removing, renaming and deleting a file keep the pick sound", () => {
  const targets = new RunTargets("p", memory());
  targets.ran("a.ant");
  targets.ran("lib/b.ant");
  targets.select("lib/b.ant");
  targets.rename(new Map([["lib/b.ant", "src/b.ant"]]));
  expect(targets.getState()).toEqual({ selected: "src/b.ant", files: ["a.ant", "src/b.ant"] });
  targets.keep((path) => path !== "src/b.ant");
  expect(targets.getState()).toEqual({ selected: null, files: ["a.ant"] });
  targets.select("a.ant");
  targets.remove("a.ant");
  expect(targets.getState()).toEqual({ selected: null, files: [] });
});

test("the browser keeps the targets for each project", () => {
  const storage = memory();
  const first = new RunTargets("project", storage);
  first.ran("main.ant");
  first.select("main.ant");
  expect(new RunTargets("project", storage).getState()).toEqual({ selected: "main.ant", files: ["main.ant"] });
  expect(new RunTargets("other", storage).getState()).toEqual({ selected: null, files: [] });
  storage.data.set("broken", "{");
  expect(new RunTargets("broken", storage).getState()).toEqual({ selected: null, files: [] });
});

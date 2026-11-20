import { afterEach, expect, test, vi } from "vitest";
import { stored, handle } from "./memory";
import { Workspace } from "./workspace";

afterEach(() => vi.unstubAllGlobals());

test("a stored folder keeps its files and empty directories across pages", async () => {
  const items = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
  });
  const before = new Workspace(handle(stored("key")), true);
  await before.write("lib/util.ant", "util");
  await before.createDirectory("empty");
  await before.write("main.ant", "one");
  await before.write("main.ant", "two");

  const after = new Workspace(handle(stored("key")), true);
  expect(await after.read("main.ant")).toBe("two");
  expect(await after.read("lib/util.ant")).toBe("util");
  expect(await after.exists("empty")).toBe(true);
  await after.clear();
  expect((await new Workspace(handle(stored("key")), true).tree()).nodes).toEqual([]);
});

test("a stored folder lasts as long as the page where localStorage fails", async () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("full");
    },
  });
  const workspace = new Workspace(handle(stored("key")), true);
  await workspace.write("main.ant", "x");
  expect(await workspace.read("main.ant")).toBe("x");
});

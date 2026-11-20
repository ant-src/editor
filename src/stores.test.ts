import { expect, test } from "vitest";
import { ConsoleStore, maxLength } from "./console";
import { BreakpointStore } from "./debug/breakpoints";

test("the console gathers writes into one update, by stream, in order", () => {
  let flush = () => {};
  const store = new ConsoleStore((f) => (flush = f));
  let updates = 0;
  store.subscribe(() => updates++);
  store.write("stdout", "a");
  store.write("stdout", "b\n");
  store.write("stderr", "oops\n");
  store.write("stdout", "c\n");
  expect(store.getState()).toEqual([]);
  flush();
  expect(updates).toBe(1);
  expect(store.getState().map((s) => [s.stream, s.text])).toEqual([
    ["stdout", "ab\n"],
    ["stderr", "oops\n"],
    ["stdout", "c\n"],
  ]);
  store.clear();
  expect(store.getState()).toEqual([]);
});

test("the console drops its oldest text past the limit", () => {
  const store = new ConsoleStore(() => {});
  for (let i = 0; i < 120; i++) {
    store.write("stdout", String(i % 10).repeat(5000));
    store.flush();
  }
  const length = store.getState().reduce((n, s) => n + s.text.length, 0);
  expect(length).toBeLessThanOrEqual(maxLength);
  expect(length).toBeGreaterThan(maxLength - 20000);
  expect(store.getState().at(-1)!.text.endsWith("9")).toBe(true);
});

test("breakpoints toggle by line and stay sorted", () => {
  const store = new BreakpointStore();
  store.toggle("main.ant", 7);
  store.toggle("main.ant", 3);
  store.toggle("lib/util.ant", 1);
  expect(store.all()).toEqual({ "main.ant": [3, 7], "lib/util.ant": [1] });
  store.toggle("main.ant", 3);
  store.toggle("lib/util.ant", 1);
  expect(store.all()).toEqual({ "main.ant": [7] });
});

test("the debugger moves a breakpoint to the statement it bound, and marks the ones it could not bind", () => {
  const store = new BreakpointStore();
  store.set("main.ant", [2, 9]);
  store.bind("main.ant", [
    { line: 2, verified: true, boundLine: 3 },
    { line: 9, verified: false, message: "no statement here" },
  ]);
  expect(store.getState()).toEqual({ lines: { "main.ant": [3, 9] }, unverified: { "main.ant": [9] } });
  store.endSession();
  expect(store.getState()).toEqual({ lines: { "main.ant": [3, 9] }, unverified: {} });
});

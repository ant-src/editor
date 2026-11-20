// The run and debug workflows, on the real ant.wasm: the worker's host runs on the test's thread.
import { afterEach, expect, test } from "vitest";
import { InProcessWorker } from "../test/in-process-worker";
import { Runner, type BoundBreakpoint, type RunnerState, type Stop, type Stream } from "./runner";

const lib = `export func double(n: int): int {
  var r = n * 2
  return r
}
`;

const main = `import "./lib/math.ant" { double }

var total = 0
for i in [1, 2, 3] {
  total = total + double(i)
}
println("total ${"$"}{total}")
`;

const files = { "main.ant": main, "lib/math.ant": lib };

interface Harness {
  runner: Runner;
  workers: InProcessWorker[];
  output: [Stream, string][];
  bound: Record<string, BoundBreakpoint[]>;
  text(stream: Stream): string;
  until(pred: (state: RunnerState) => boolean): Promise<RunnerState>;
  paused(): Promise<Stop>;
}

let current: Runner | undefined;
afterEach(() => current?.dispose());

async function start(): Promise<Harness> {
  const workers: InProcessWorker[] = [];
  const output: [Stream, string][] = [];
  const bound: Record<string, BoundBreakpoint[]> = {};
  const runner = new Runner(
    () => {
      const worker = new InProcessWorker();
      workers.push(worker);
      return worker;
    },
    { output: (stream, text) => output.push([stream, text]), bound: (path, bps) => (bound[path] = bps) },
  );
  current = runner;
  const until = (pred: (state: RunnerState) => boolean) =>
    new Promise<RunnerState>((resolve) => {
      const check = () => {
        if (!pred(runner.getState())) return false;
        unsubscribe();
        resolve(runner.getState());
        return true;
      };
      const unsubscribe = runner.subscribe(check);
      check();
    });
  const h: Harness = {
    runner,
    workers,
    output,
    bound,
    text: (stream) =>
      output
        .filter(([s]) => s === stream)
        .map(([, t]) => t)
        .join(""),
    until,
    paused: async () => (await until((s) => s.status === "paused")).stop!,
  };
  expect(runner.getState().status).toBe("starting");
  await until((s) => s.status === "idle");
  return h;
}

const vars = (stop: Stop, scope: string) =>
  Object.fromEntries((stop.scopes.find((s) => s.name === scope)?.variables ?? []).map((v) => [v.name, v.value]));

test("run runs the active file with its local imports and reports the output", async () => {
  const h = await start();
  expect(h.runner.run({ files, path: "main.ant" })).toBe(true);
  expect(h.runner.getState()).toMatchObject({ status: "running", debugging: false });
  expect(h.runner.run({ files, path: "main.ant" })).toBe(false); // one program at a time
  await h.until((s) => s.status === "idle");
  expect(h.text("stdout")).toBe("total 12\n");
  expect(h.text("stderr")).toBe("");
  expect(h.text("info")).toMatch(/^Running main\.ant\nFinished in \d+ ms\n$/);
});

test("run starts from a module in a directory, importing up and down", async () => {
  const h = await start();
  h.runner.run({
    files: { ...files, "examples/demo.ant": 'import "../lib/math.ant" { double }\nprintln(double(21))\n' },
    path: "examples/demo.ant",
  });
  await h.until((s) => s.status === "idle");
  expect(h.text("stdout")).toBe("42\n");
});

test("a panic shows on stderr with where it happened, and the exit code", async () => {
  const h = await start();
  h.runner.run({ files: { "main.ant": 'println("before")\nvar xs = [1]\nprintln(xs[3])\n' }, path: "main.ant" });
  await h.until((s) => s.status === "idle");
  expect(h.text("stdout")).toBe("before\n");
  expect(h.text("stderr")).toContain("panic: ");
  expect(h.text("stderr")).toContain("main.ant:3:");
  expect(h.text("warning")).toMatch(/Exited with code 1 in /);
});

test("a program that does not load reports its errors by position", async () => {
  const h = await start();
  h.runner.run({ files: { "main.ant": 'import "./missing.ant" { f }\nf()\n' }, path: "main.ant" });
  await h.until((s) => s.status === "idle");
  expect(h.text("stderr")).toMatch(/^main\.ant:1:\d+: /);
  expect(h.text("warning")).toContain("Exited with code 2");
});

test("stop ends a running program by replacing its worker, and the next run works", async () => {
  const h = await start();
  h.runner.run({ files: { "main.ant": 'println("start")\nTime.sleep(60s)\nprintln("never")\n' }, path: "main.ant" });
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => h.text("stdout") && (clearInterval(timer), resolve()), 10);
  });
  h.runner.stop();
  expect(h.workers[0].terminated).toBe(true);
  expect(h.workers.length).toBe(2);
  expect(h.runner.getState().status).toBe("starting");
  await h.until((s) => s.status === "idle");
  expect(h.text("stdout")).toBe("start\n");
  expect(h.text("info")).toBe("Running main.ant\nStopped\n");

  h.runner.run({ files, path: "main.ant" });
  await h.until((s) => s.status === "idle");
  expect(h.text("stdout")).toBe("start\ntotal 12\n");
});

test("debug stops at a breakpoint in an imported module and shows the variables in scope", async () => {
  const h = await start();
  expect(h.runner.debug({ files, path: "main.ant" }, { "lib/math.ant": [2], "main.ant": [] })).toBe(true);
  expect(h.runner.getState()).toMatchObject({ status: "running", debugging: true });
  const stop = await h.paused();
  expect(h.bound["lib/math.ant"]).toEqual([{ line: 2, verified: true, boundLine: 2 }]);
  expect(stop.reason).toBe("breakpoint");
  expect(stop.frames.map((f) => [f.name, f.path, f.line])).toEqual([
    ["double", "lib/math.ant", 2],
    [expect.any(String), "main.ant", 5],
  ]);
  expect(vars(stop, "Locals")).toEqual({ n: "1" });

  // the caller's frame: the loop variable, and the module's variables
  const caller = await h.runner.scopes(stop.frames[1].id);
  expect(Object.fromEntries(caller.flatMap((s) => s.variables).map((v) => [v.name, v.value]))).toMatchObject({
    i: "1",
    total: "0",
  });
});

test("stepping over shows a variable appear and change, and stepping out and in follow calls", async () => {
  const h = await start();
  h.runner.debug({ files, path: "main.ant" }, { "main.ant": [5] });
  let stop = await h.paused();
  expect([stop.frames[0].path, stop.frames[0].line]).toEqual(["main.ant", 5]);
  expect(vars(stop, "Module")).toEqual({ total: "0" });
  expect(vars(stop, "Locals")).toEqual({ i: "1" });

  h.runner.resume("stepIn");
  expect(h.runner.getState()).toMatchObject({ status: "running", stop: undefined });
  stop = await h.paused();
  expect(stop.reason).toBe("step");
  expect([stop.frames[0].name, stop.frames[0].path, stop.frames[0].line]).toEqual(["double", "lib/math.ant", 2]);
  expect(vars(stop, "Locals")).toEqual({ n: "1" });

  h.runner.resume("next");
  stop = await h.paused();
  expect(stop.frames[0].line).toBe(3);
  expect(vars(stop, "Locals")).toEqual({ n: "1", r: "2" });

  // out of the call, at the next turn of the loop: total has changed, and is marked so
  h.runner.resume("stepOut");
  stop = await h.paused();
  expect(stop.frames.map((f) => [f.path, f.line])).toEqual([["main.ant", 5]]);
  expect(vars(stop, "Locals")).toEqual({ i: "2" });
  expect(stop.scopes.find((s) => s.name === "Module")!.variables).toMatchObject([
    { name: "total", value: "2", changed: true },
  ]);

  h.runner.resume("next");
  stop = await h.paused();
  expect(vars(stop, "Module")).toEqual({ total: "6" });
  expect(vars(stop, "Locals")).toEqual({ i: "3" });

  // without the breakpoint the program runs to its end
  await h.runner.setBreakpoints("main.ant", []);
  h.runner.resume("continue");
  await h.until((s) => s.status === "idle");
  expect(h.runner.getState()).toEqual({ status: "idle", debugging: false, stop: undefined });
  expect(h.text("stdout")).toBe("total 12\n");
  expect(h.text("info")).toMatch(/^Debugging main\.ant\nFinished in \d+ ms\n$/);
});

test("a breakpoint binds to the next statement, or says why it cannot", async () => {
  const h = await start();
  h.runner.debug(
    { files: { ...files, "other.ant": "println(1)\n" }, path: "main.ant" },
    {
      "main.ant": [2, 7],
      "lib/math.ant": [5],
      "other.ant": [1],
    },
  );
  const stop = await h.paused();
  expect(stop.frames[0].line).toBe(3);
  expect(h.bound["main.ant"]).toEqual([
    { line: 2, verified: true, boundLine: 3 },
    { line: 7, verified: true, boundLine: 7 },
  ]);
  expect(h.bound["lib/math.ant"]).toMatchObject([{ line: 5, verified: false }]);
  expect(h.bound["other.ant"]).toMatchObject([
    { line: 1, verified: false, message: "the file is not a module of the program" },
  ]);
});

test("the parts of a record and an array open on demand", async () => {
  const h = await start();
  const program = `type Point = { x: int, y: int }
var p = Point { x: 1, y: 2 }
var xs = [10, 20, 30]
println(p.x)
`;
  h.runner.debug({ files: { "main.ant": program }, path: "main.ant" }, { "main.ant": [4] });
  const stop = await h.paused();
  const [p, xs] = stop.scopes.find((s) => s.name === "Module")!.variables;
  expect(p).toMatchObject({ name: "p", namedVariables: 2 });
  expect(xs).toMatchObject({ name: "xs", indexedVariables: 3 });
  expect((await h.runner.variables(p.variablesReference)).map((v) => [v.name, v.value])).toEqual([
    ["x", "1"],
    ["y", "2"],
  ]);
  expect((await h.runner.variables(xs.variablesReference, 1, 2)).map((v) => [v.name, v.value])).toEqual([
    ["[1]", "20"],
    ["[2]", "30"],
  ]);
});

test("debug pauses at an uncaught panic, with its message, and then reports it", async () => {
  const h = await start();
  h.runner.debug({ files: { "main.ant": "var xs = [1]\nprintln(xs[3])\n" }, path: "main.ant" });
  const stop = await h.paused();
  expect(stop.reason).toBe("exception");
  expect(stop.text).toMatch(/index/);
  expect(stop.frames[0].line).toBe(2);
  h.runner.resume("continue");
  await h.until((s) => s.status === "idle");
  expect(h.text("stderr")).toContain("panic: ");
  expect(h.text("warning")).toContain("Exited with code 1");
});

test("stop ends a paused session, and a program that does not load never starts", async () => {
  const h = await start();
  h.runner.debug({ files, path: "main.ant" }, { "main.ant": [3] });
  await h.paused();
  h.runner.stop();
  expect(h.runner.getState()).toMatchObject({ status: "starting", debugging: false, stop: undefined });
  await h.until((s) => s.status === "idle");
  expect(h.text("stdout")).toBe("");

  h.runner.debug({ files: { "main.ant": "var x = \n" }, path: "main.ant" });
  await h.until((s) => s.status === "idle");
  expect(h.text("stderr")).toMatch(/^main\.ant:\d+:\d+: /);
  expect(h.text("warning")).toContain("Exited with code 2");
});

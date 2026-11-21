// The runner runs and debugs programs in a worker, so that the page stays responsive, and stops
// one by replacing the worker. Debugging speaks the Debug Adapter Protocol to the adapter in
// ant.wasm, which stops and steps the program with the interpreter's own debugger.
import { isTestFile, type DapMessage, type FromWorker, type Program, type ToWorker, type WorkerLike } from "./protocol";

export type Status =
  /** The worker is loading ant.wasm. */
  | "starting"
  | "idle"
  | "running"
  /** A debugged program is stopped: at a breakpoint, after a step, or at a panic. */
  | "paused"
  /** ant.wasm did not load. */
  | "unavailable";

/** What the program wrote, and what the editor says about the run: info in passing, warning to heed. */
export type Stream = "stdout" | "stderr" | "info" | "warning";

export interface Frame {
  id: number;
  name: string;
  /** The module the frame is in, a path of the program. */
  path?: string;
  line: number;
  column: number;
}

export interface Variable {
  name: string;
  value: string;
  type?: string;
  /** Not zero when the value has parts, which variables() lists. */
  variablesReference: number;
  namedVariables?: number;
  indexedVariables?: number;
  /** The value differs from the one at the stop before, in the same function. */
  changed?: boolean;
}

export interface Scope {
  name: string;
  variables: Variable[];
}

export interface Stop {
  /** breakpoint, step, exception, and so on. */
  reason: string;
  /** The message of the panic the program stopped at. */
  text?: string;
  threadId: number;
  /** The call stack, innermost first. */
  frames: Frame[];
  /** The variables in scope in the innermost frame. */
  scopes: Scope[];
}

export interface RunnerState {
  status: Status;
  /** Whether the program that runs or is paused runs under the debugger. */
  debugging: boolean;
  stop?: Stop;
  /** Why nothing can run, when status is unavailable. */
  error?: string;
}

/** A breakpoint as the debugger bound it. */
export interface BoundBreakpoint {
  /** The line asked for. */
  line: number;
  verified: boolean;
  /** The line of the statement the breakpoint stops at, when verified. */
  boundLine?: number;
  message?: string;
}

export interface RunnerHandlers {
  /** What the program writes, and under info what the editor says about the run. */
  output(stream: Stream, text: string): void;
  /** How the debugger bound the breakpoints of a module. */
  bound?(path: string, breakpoints: BoundBreakpoint[]): void;
}

export type StepCommand = "continue" | "next" | "stepIn" | "stepOut";

export type Breakpoints = Record<string, number[]>;

export class Runner {
  private worker!: WorkerLike;
  private state: RunnerState = { status: "starting", debugging: false };
  private listeners = new Set<() => void>();
  private seq = 0;
  private pending = new Map<number, { resolve(body: any): void; reject(err: Error): void }>();
  private waiting = new Map<string, () => void>();
  private session = 0; // counts runs, so that what is left of an earlier one is ignored
  private started = 0;
  private exitCode: number | undefined;
  private seen = new Map<string, Map<string, string>>(); // the values at the last stop in each call

  constructor(
    private spawn: () => WorkerLike,
    private handlers: RunnerHandlers,
    private module?: WebAssembly.Module,
  ) {
    this.start();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): RunnerState => this.state;

  private update(patch: Partial<RunnerState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private start() {
    const worker = this.spawn();
    this.worker = worker;
    worker.onmessage = ({ data }) => {
      if (worker === this.worker) this.receive(data);
    };
    this.post({ type: "init", module: this.module });
  }

  private post(message: ToWorker) {
    this.worker.postMessage(message);
  }

  private get active(): boolean {
    return this.state.status === "running" || this.state.status === "paused";
  }

  private receive(data: FromWorker) {
    switch (data.type) {
      case "ready":
        if (this.state.status === "starting") this.update({ status: "idle" });
        return;
      case "unavailable":
        this.update({ status: "unavailable", debugging: false, stop: undefined, error: data.message });
        return;
      case "output":
        this.handlers.output(data.stream, data.text);
        return;
      case "done":
        this.finish(data.exitCode);
        return;
      case "failed":
        this.handlers.output("stderr", data.message + "\n");
        this.finish(1);
        return;
      case "dap":
        this.receiveDap(data.message);
        return;
    }
  }

  // ---- running

  /** run runs a program to its end, or the tests of a test file. It reports whether the run started. */
  run(program: Program): boolean {
    if (this.state.status !== "idle") return false;
    this.begin(false);
    const tests = isTestFile(program.path);
    this.handlers.output("info", `${tests ? "Testing" : "Running"} ${program.path}\n`);
    this.post({ type: tests ? "test" : "run", program });
    return true;
  }

  /**
   * debug runs a program, or the tests of a test file, under the debugger, with breakpoints on
   * the lines given for each module. It reports whether the session started.
   */
  debug(program: Program, breakpoints: Breakpoints = {}): boolean {
    if (this.state.status !== "idle") return false;
    this.begin(true);
    this.handlers.output("info", `Debugging ${program.path}\n`);
    this.post({ type: "debug", files: program.files });
    void this.launch(program, breakpoints);
    return true;
  }

  private begin(debugging: boolean) {
    this.session++;
    this.started = performance.now();
    this.exitCode = undefined;
    this.seen.clear();
    this.update({ status: "running", debugging, stop: undefined });
  }

  private async launch(program: Program, breakpoints: Breakpoints) {
    const session = this.session;
    try {
      await this.request("initialize", { adapterID: "ant", linesStartAt1: true, columnsStartAt1: true });
      const initialized = this.event("initialized");
      await this.request("launch", { program: program.path, test: program.test });
      await initialized;
      for (const [path, lines] of Object.entries(breakpoints)) {
        if (lines.length > 0) await this.setBreakpoints(path, lines);
      }
      await this.request("setExceptionBreakpoints", { filters: ["uncaught"] });
      await this.request("configurationDone");
    } catch (err) {
      if (session !== this.session) return;
      // a program that does not load: the message lists why, as ant run does
      this.handlers.output("stderr", (err as Error).message + "\n");
      this.finish(2);
    }
  }

  /** stop ends the program that runs or is paused, whatever it is doing. */
  stop() {
    if (!this.active) return;
    this.reset();
    this.handlers.output("info", "Stopped\n");
    this.worker.terminate();
    this.update({ status: "starting", debugging: false, stop: undefined });
    this.start();
  }

  private finish(exitCode: number) {
    if (!this.active) return;
    this.reset();
    const time = ` in ${duration(performance.now() - this.started)}`;
    if (exitCode === 0) this.handlers.output("info", `Finished${time}\n`);
    else this.handlers.output("warning", `Exited with code ${exitCode}${time}\n`);
    this.update({ status: "idle", debugging: false, stop: undefined });
  }

  private reset() {
    this.session++;
    for (const { reject } of this.pending.values()) reject(new Error("the program ended"));
    this.pending.clear();
    this.waiting.clear();
  }

  dispose() {
    this.reset();
    this.worker.terminate();
    this.listeners.clear();
  }

  // ---- debugging

  private request<T = any>(command: string, args?: unknown): Promise<T> {
    const seq = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(seq, { resolve, reject });
      this.post({ type: "dap", message: { seq, type: "request", command, arguments: args } });
    });
  }

  /** event settles at the next event of the name. */
  private event(name: string): Promise<void> {
    return new Promise((resolve) => this.waiting.set(name, resolve));
  }

  private receiveDap(message: DapMessage) {
    if (message.type === "response") {
      const request = this.pending.get(message.request_seq!);
      if (!request) return;
      this.pending.delete(message.request_seq!);
      if (message.success) request.resolve(message.body);
      else request.reject(new Error(message.message ?? `${message.command} failed`));
      return;
    }
    if (message.type !== "event" || !this.state.debugging) return;
    const body = message.body ?? {};
    switch (message.event) {
      case "output":
        this.handlers.output(
          body.category === "stdout" || body.category === "stderr" ? body.category : "info",
          body.output,
        );
        break;
      case "stopped":
        void this.stopped(body);
        break;
      case "exited":
        this.exitCode = body.exitCode;
        break;
      case "terminated":
        this.request("disconnect").catch(() => {});
        this.finish(this.exitCode ?? 0);
        break;
    }
    const waiting = this.waiting.get(message.event!);
    if (waiting) {
      this.waiting.delete(message.event!);
      waiting();
    }
  }

  private async stopped(body: { reason: string; text?: string; threadId: number }) {
    const session = this.session;
    try {
      const { stackFrames } = await this.request("stackTrace", { threadId: body.threadId });
      const frames: Frame[] = stackFrames.map((f: any) => ({
        id: f.id,
        name: f.name,
        path: f.source?.path,
        line: f.line,
        column: f.column,
      }));
      const scopes = frames.length > 0 ? await this.scopes(frames[0].id) : [];
      if (session !== this.session) return;
      // What changed since the last stop in the same call: the one before, or the one before
      // the calls stepped into since.
      const key = frames.map((f) => f.name).join("<");
      const before = this.seen.get(key);
      const values = new Map<string, string>();
      for (const scope of scopes) {
        for (const v of scope.variables) {
          const name = scope.name + "/" + v.name;
          values.set(name, v.value);
          const was = before?.get(name);
          if (was !== undefined && was !== v.value) v.changed = true;
        }
      }
      this.seen.set(key, values);
      this.update({
        status: "paused",
        stop: { reason: body.reason, text: body.text, threadId: body.threadId, frames, scopes },
      });
    } catch {
      // the program resumed or ended meanwhile
    }
  }

  /** resume continues a paused program, or steps it. */
  resume(command: StepCommand) {
    const stop = this.state.stop;
    if (this.state.status !== "paused" || !stop) return;
    this.update({ status: "running", stop: undefined });
    this.request(command, { threadId: stop.threadId }).catch(() => {});
  }

  /**
   * setBreakpoints replaces the breakpoints of a module in the session under way. It takes
   * effect once the program waits or stops, since the adapter hears nothing while it computes.
   */
  async setBreakpoints(path: string, lines: number[]): Promise<void> {
    if (!this.state.debugging) return;
    const body = await this.request("setBreakpoints", {
      source: { path },
      breakpoints: lines.map((line) => ({ line })),
    });
    this.handlers.bound?.(
      path,
      (body.breakpoints as any[]).map((b, i) => ({
        line: lines[i],
        verified: b.verified,
        boundLine: b.verified ? b.line : undefined,
        message: b.message,
      })),
    );
  }

  /** scopes lists the variables in scope in a frame of the stop. */
  async scopes(frameId: number): Promise<Scope[]> {
    const { scopes } = await this.request("scopes", { frameId });
    const out: Scope[] = [];
    for (const scope of scopes) {
      out.push({ name: scope.name, variables: await this.variables(scope.variablesReference) });
    }
    return out;
  }

  /** variables lists the parts of a value: all of them, or count of the indexed ones from start. */
  async variables(variablesReference: number, start?: number, count?: number): Promise<Variable[]> {
    const { variables } = await this.request("variables", { variablesReference, start, count });
    return variables.map((v: any) => ({
      name: v.name,
      value: v.value,
      type: v.type,
      variablesReference: v.variablesReference,
      namedVariables: v.namedVariables,
      indexedVariables: v.indexedVariables,
    }));
  }
}

function duration(ms: number): string {
  return ms < 1000 ? `${Math.max(1, Math.round(ms))} ms` : `${(ms / 1000).toFixed(2)} s`;
}

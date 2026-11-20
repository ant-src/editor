// The messages between the page and the worker that runs programs.

/** A program: its modules by path, and the module it starts from. */
export interface Program {
  files: Record<string, string>;
  path: string;
}

export type ToWorker =
  /** Loads ant.wasm: from a module compiled already, or the one of @ant-lang/wasm. */
  | { type: "init"; module?: WebAssembly.Module }
  | { type: "run"; program: Program }
  /** Starts a debug adapter for a session on the modules; dap messages drive it. */
  | { type: "debug"; files: Record<string, string> }
  | { type: "dap"; message: DapMessage };

export type FromWorker =
  | { type: "ready" }
  /** ant.wasm did not start in the worker, so nothing can run. */
  | { type: "unavailable"; message: string }
  | { type: "output"; stream: "stdout" | "stderr"; text: string }
  | { type: "done"; exitCode: number }
  /** A run that could not finish. */
  | { type: "failed"; message: string }
  | { type: "dap"; message: DapMessage };

/** A message of the Debug Adapter Protocol. */
export interface DapMessage {
  seq: number;
  type: "request" | "response" | "event";
  command?: string;
  arguments?: unknown;
  request_seq?: number;
  success?: boolean;
  message?: string;
  event?: string;
  body?: any;
}

/** WorkerLike is what the runner needs of a Worker. */
export interface WorkerLike {
  postMessage(message: ToWorker): void;
  onmessage: ((event: { data: FromWorker }) => void) | null;
  terminate(): void;
}

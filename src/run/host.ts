// The worker's side of running programs: it loads ant.wasm, runs a program or a test file's
// tests at a time and serves debug sessions, one at a time. It is apart from the worker's entry so that tests can
// run it in their own thread.
import type { Ant, DebugAdapterConnection } from "@ant-lang/wasm";
import type { FromWorker, ToWorker } from "./protocol";
import { report } from "./report";

export type LoadAnt = (wasm?: WebAssembly.Module) => Promise<Ant>;

export function createHost(post: (message: FromWorker) => void, load: LoadAnt): (message: ToWorker) => void {
  let ant: Promise<Ant> | undefined;
  let adapter: Promise<DebugAdapterConnection> | undefined;

  const run = async ({ type, program }: Extract<ToWorker, { type: "run" | "test" }>) => {
    const decoders = { stdout: new TextDecoder(), stderr: new TextDecoder() };
    const write = (stream: "stdout" | "stderr" | "info", text: string) =>
      text && post({ type: "output", stream, text });
    const sink = (stream: "stdout" | "stderr") => (chunk: Uint8Array) =>
      write(stream, decoders[stream].decode(chunk, { stream: true }));
    const io = { files: program.files, stdout: sink("stdout"), stderr: sink("stderr") };
    try {
      const loaded = await ant!;
      const result =
        type === "run"
          ? await loaded.run({ ...io, path: program.path })
          : await loaded.test({ ...io, paths: [program.path], run: program.test, onEvent: (e) => write(...report(e)) });
      write("stdout", decoders.stdout.decode());
      write("stderr", decoders.stderr.decode());
      for (const d of result.diagnostics) write("stderr", `${d.path}:${d.line}:${d.column}: ${d.message}\n`);
      post({ type: "done", exitCode: result.exitCode });
    } catch (err) {
      post({ type: "failed", message: String((err as Error)?.message ?? err) });
    }
  };

  return (data) => {
    switch (data.type) {
      case "init":
        ant = load(data.module);
        ant.then(
          () => post({ type: "ready" }),
          (err) => post({ type: "unavailable", message: String(err?.message ?? err) }),
        );
        return;
      case "run":
      case "test":
        void run(data);
        return;
      case "debug": {
        const previous = adapter;
        previous?.then(
          (a) => a.close(),
          () => {},
        );
        adapter = ant!.then((ant) =>
          ant.debugAdapter({ files: data.files }, (message) => post({ type: "dap", message })),
        );
        adapter.catch((err) => post({ type: "failed", message: String(err?.message ?? err) }));
        return;
      }
      case "dap":
        adapter?.then(
          (a) => a.send(data.message),
          () => {},
        );
        return;
    }
  };
}

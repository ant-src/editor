// The worker's side of running programs: it loads ant.wasm, runs a program at a time and
// serves debug sessions, one at a time. It is apart from the worker's entry so that tests can
// run it in their own thread.
import type { Ant, DebugAdapterConnection } from "@ant-lang/wasm";
import type { FromWorker, ToWorker } from "./protocol";

export type LoadAnt = (wasm?: WebAssembly.Module) => Promise<Ant>;

export function createHost(post: (message: FromWorker) => void, load: LoadAnt): (message: ToWorker) => void {
  let ant: Promise<Ant> | undefined;
  let adapter: Promise<DebugAdapterConnection> | undefined;

  const run = async (data: Extract<ToWorker, { type: "run" }>) => {
    const decoders = { stdout: new TextDecoder(), stderr: new TextDecoder() };
    const write = (stream: "stdout" | "stderr", text: string) => text && post({ type: "output", stream, text });
    const sink = (stream: "stdout" | "stderr") => (chunk: Uint8Array) =>
      write(stream, decoders[stream].decode(chunk, { stream: true }));
    try {
      const result = await (
        await ant!
      ).run({
        files: data.program.files,
        path: data.program.path,
        stdout: sink("stdout"),
        stderr: sink("stderr"),
      });
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

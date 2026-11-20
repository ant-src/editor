// A worker for tests: the worker's host on the test's own thread, with the real ant.wasm.
// Messages cross as they do between threads, copied and later. Terminating it only cuts it off,
// since a thread cannot end itself, so tests stop programs that wait, not ones that compute.
import { loadAnt } from "@ant-lang/wasm";
import { createHost } from "../run/host";
import type { FromWorker, ToWorker, WorkerLike } from "../run/protocol";

export class InProcessWorker implements WorkerLike {
  onmessage: ((event: { data: FromWorker }) => void) | null = null;
  terminated = false;
  /** Everything the page posted. */
  readonly posted: ToWorker[] = [];
  private host = createHost(
    (message) => setTimeout(() => !this.terminated && this.onmessage?.({ data: structuredClone(message) })),
    () => loadAnt(),
  );

  postMessage(message: ToWorker) {
    this.posted.push(message);
    const copy = structuredClone(message);
    setTimeout(() => !this.terminated && this.host(copy));
  }

  terminate() {
    this.terminated = true;
  }
}

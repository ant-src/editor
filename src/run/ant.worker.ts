// The worker that runs and debugs programs. The page ends a program that will not stop by
// terminating the worker.
import { loadAnt } from "@ant-lang/wasm";
import { createHost } from "./host";
import type { ToWorker } from "./protocol";

const host = createHost(
  (message) => self.postMessage(message),
  (wasm) => loadAnt({ wasm }),
);

self.onmessage = ({ data }: MessageEvent<ToWorker>) => host(data);

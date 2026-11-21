// Monaco without its bundled languages, Ant's language server in a worker, and ant.wasm compiled
// once for the language server and the runner alike. Loaded only in the browser.
import * as monaco from "monaco-editor/editor";
import "monaco-editor/features/register.all";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import { setupAnt, type AntLanguageServer } from "@ant-lang/monaco";
import LanguageServerWorker from "@ant-lang/monaco/worker?worker";
import wasmUrl from "@ant-lang/wasm/ant.wasm?url";
import { isDark, subscribe } from "../settings";
import { defineThemes } from "./themes";

export { monaco };

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
defineThemes(monaco);

let compiled: Promise<WebAssembly.Module> | undefined;

/** compileAnt downloads and compiles ant.wasm once. */
export function compileAnt(): Promise<WebAssembly.Module> {
  compiled ??= (async () => {
    const response = await fetch(wasmUrl);
    if (!response.ok) throw new Error(`ant.wasm: ${response.status} ${response.statusText}`);
    if (response.headers.get("Content-Type")?.startsWith("application/wasm")) {
      return WebAssembly.compileStreaming(response);
    }
    return WebAssembly.compile(await response.arrayBuffer());
  })();
  compiled.catch(() => (compiled = undefined));
  return compiled;
}

export function startLanguageServer(module: WebAssembly.Module): AntLanguageServer {
  return setupAnt(monaco, { wasm: module, worker: () => new LanguageServerWorker() });
}

/** uriOf is the URI of the model of a file of the project: file:///lib/util.ant for lib/util.ant. */
export function uriOf(path: string): monaco.Uri {
  return monaco.Uri.file("/" + path);
}

/** pathOf is the project's path of a model's URI. */
export function pathOf(uri: monaco.Uri): string {
  return uri.path.replace(/^\//, "");
}

/** createModel makes the buffer of a file, replacing a model left at its URI. */
export function createModel(path: string, text: string): monaco.editor.ITextModel {
  const uri = uriOf(path);
  monaco.editor.getModel(uri)?.dispose();
  return monaco.editor.createModel(text, path.endsWith(".ant") ? "ant" : undefined, uri);
}

const applyTheme = () => monaco.editor.setTheme(isDark() ? "ant-dark" : "ant-light");
subscribe(applyTheme);
applyTheme();

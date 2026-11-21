// Monaco without its bundled languages, Ant's language server in a worker, and ant.wasm compiled
// once for the language server and the runner alike. Loaded only in the browser.
import * as monaco from "monaco-editor/editor";
import "monaco-editor/features/register.all";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import { setupAnt, type AntLanguageServer } from "@ant-lang/monaco";
import LanguageServerWorker from "@ant-lang/monaco/worker?worker";
import wasmUrl from "@ant-lang/wasm/ant.wasm?url";
import { isTestFile } from "../run/protocol";
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
  const server = setupAnt(monaco, { wasm: module, worker: () => new LanguageServerWorker() });
  // The server's lenses above each test of a test file: "run test" and "debug test".
  monaco.languages.registerCodeLensProvider("ant", {
    async provideCodeLenses(model) {
      if (!isTestFile(model.uri.path)) return null;
      await server.ready;
      const lenses = await server.request<Lens[] | null>("textDocument/codeLens", {
        textDocument: { uri: model.uri.toString() },
      });
      return {
        lenses: (lenses ?? []).map(({ range: { start, end }, command }) => ({
          range: new monaco.Range(start.line + 1, start.character + 1, end.line + 1, end.character + 1),
          command: command && { id: command.command, title: command.title, arguments: command.arguments },
        })),
        dispose() {},
      };
    },
  });
  return server;
}

/** A code lens as the language server gives it (spec/lsp.md section 4). */
interface Lens {
  range: Record<"start" | "end", { line: number; character: number }>;
  command?: { title: string; command: string; arguments?: unknown[] };
}

/** A test of a test file to run or debug: the pattern selects it, as the -run flag of ant test does. */
export interface TestCommand {
  debug: boolean;
  path: string;
  pattern: string;
}

let testHandler: ((command: TestCommand) => void) | undefined;

/** onTestCommand sets what a click on a test's lens does. The function it returns unsets it. */
export function onTestCommand(handler: (command: TestCommand) => void): () => void {
  testHandler = handler;
  return () => {
    if (testHandler === handler) testHandler = undefined;
  };
}

// The commands the lenses name take the file's URI and the test's pattern.
for (const [id, debug] of [
  ["ant.test.run", false],
  ["ant.test.debug", true],
] as const) {
  monaco.editor.registerCommand(id, (_accessor, uri: string, pattern: string) =>
    testHandler?.({ debug, path: pathOf(monaco.Uri.parse(uri)), pattern }),
  );
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

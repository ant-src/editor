# Ant Editor

An editor for [Ant](https://ant-lang.org) that runs in the browser, for
[editor.ant-lang.org](https://editor.ant-lang.org): edit, run and debug Ant programs with nothing
installed. It targets desktop Chrome.

- **Files.** Work starts at once, in a folder the browser keeps for the page. _Save to folder_
  copies it to a folder on disk and goes on there; _Open folder_ opens one that exists. Files are
  read and written in place through the File System Access API.
- **Run.** The active Ant file runs in WebAssembly, in a worker, with its imports resolved among
  the folder's files as the editor shows them. _Stop_ ends a program whatever it is doing.
- **Debug.** A click in the gutter sets a breakpoint. A paused program shows its line, its call
  stack and the variables in scope; continue, step over, step into and step out move it on.

| Key            | Action               |
| -------------- | -------------------- |
| ⌘S, ⇧⌘S        | Save, save all       |
| ⌘Enter         | Run                  |
| F5             | Debug, continue      |
| ⇧F5            | Stop                 |
| F10, F11, ⇧F11 | Step over, into, out |
| ⌘B             | Toggle the file tree |

## How it works

The interpreter, the language server and the debugger are Ant's own, compiled to WebAssembly in
[@ant-lang/wasm](https://github.com/ant-src/ant-web). Programs run in a worker (`src/run`): a run
calls `run`, and a debug session speaks the Debug Adapter Protocol to `debugAdapter`, the adapter
that `ant dap` serves, so breakpoints and stepping are the interpreter's. The page ends a program
by ending its worker, since a program that never waits hears nothing else.

`src/fs` wraps the File System Access API, `src/project.ts` keeps a buffer for every Ant file so
that imports resolve, and `src/components` is the interface, with Monaco and
[@ant-lang/monaco](https://github.com/ant-src/ant-web) for the language.

## Development

The Ant packages come from a checkout of [ant-web](https://github.com/ant-src/ant-web) next to
this repository, until a release of them has `debugAdapter`. Build them first:

```sh
(cd ../ant-web && npm install && npm run build)
npm install
npm run dev
```

```sh
npm test          # Vitest: files, run and debug on the real ant.wasm, and the components
npm run build     # type-check and bundle into dist/
npm run fmt && npm run lint
```

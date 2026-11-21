# Ant Editor

Edit, run and debug [Ant](https://ant-lang.org) programs in the browser, with nothing installed:
[editor.ant-lang.org](https://editor.ant-lang.org).

- **Projects.** Work starts in a project the browser keeps for the page. The project's menu makes
  new ones, renames them, and switches between them; switching saves the one left. It downloads a
  project as a .zip in any browser; in Chrome and Edge on a desktop, _Save to folder_ moves it to a
  folder on disk and _Open folder_ opens one that exists; the folders opened lately are on the menu
  to open again with a click.
- **Files.** A right click in the file tree makes, renames and deletes files; a drag moves them.
- **Run.** Run starts the file named beside it, in WebAssembly, in a worker. _Current File_ is the
  Ant file open in the editor; pick a file that ran before to run it from any tab. _Stop_ ends it.
- **Problems.** The checker's errors and warnings list under _Problems_, and a run names them in
  the console.
- **Debug.** Click the gutter to set a breakpoint. A paused program shows its line, call stack and
  variables.

| Key            | Action               |
| -------------- | -------------------- |
| ⌘S, ⇧⌘S        | Save, save all       |
| ⌘Enter         | Run                  |
| ⇧⌘Enter        | Run the current file |
| F5             | Debug, continue      |
| ⇧F5            | Stop                 |
| F10, F11, ⇧F11 | Step over, into, out |
| ⌘B             | Toggle the file tree |
| ⌘J             | Toggle the panel     |
| F2, ⌘⌫         | Rename, delete       |

## Development

The Ant packages, [@ant-lang/wasm](https://www.npmjs.com/package/@ant-lang/wasm) and
[@ant-lang/monaco](https://www.npmjs.com/package/@ant-lang/monaco), come from npm:

```sh
npm install
npm run dev
```

```sh
npm test         # Vitest, on the real ant.wasm
npm run build    # type-check and bundle into dist/
npm run fmt && npm run lint
```

## License

[MIT](LICENSE)

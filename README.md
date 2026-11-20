# Ant Editor

Edit, run and debug [Ant](https://ant-lang.org) programs in the browser, with nothing installed:
[editor.ant-lang.org](https://editor.ant-lang.org).

- **Files.** Work starts in a folder the browser keeps for the page. In Chrome and Edge on a
  desktop, _Save to folder_ moves it to a folder on disk and _Open folder_ opens one that exists.
- **Run.** The active file runs in WebAssembly, in a worker. _Stop_ ends it.
- **Debug.** Click the gutter to set a breakpoint. A paused program shows its line, call stack and
  variables.

| Key            | Action               |
| -------------- | -------------------- |
| ⌘S, ⇧⌘S        | Save, save all       |
| ⌘Enter         | Run                  |
| F5             | Debug, continue      |
| ⇧F5            | Stop                 |
| F10, F11, ⇧F11 | Step over, into, out |
| ⌘B             | Toggle the file tree |

## Development

The Ant packages come from a checkout of [ant-web](https://github.com/ant-src/ant-web) next to
this repository, which builds `ant.wasm` from a checkout of [ant](https://github.com/ant-src/ant)
next to it:

```sh
(cd ../ant-web && npm install && npm run build)
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

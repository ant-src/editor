// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { Scope, Stop, Variable } from "../run/runner";
import { Console } from "./Console";
import { FileTree } from "./FileTree";
import { getSettings, set } from "../settings";
import { Menu } from "./Menu";
import { SettingsButton } from "./Settings";
import { Variables } from "./Variables";

afterEach(cleanup);

const tree = [
  {
    name: "lib",
    path: "lib",
    kind: "directory" as const,
    children: [{ name: "util.ant", path: "lib/util.ant", kind: "file" as const }],
  },
  { name: "main.ant", path: "main.ant", kind: "file" as const },
];

test("the file tree folds directories, opens files and marks unsaved ones", () => {
  const onOpen = vi.fn();
  render(
    <FileTree
      tree={tree}
      active="main.ant"
      dirty={new Set(["main.ant"])}
      onOpen={onOpen}
      onCreate={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  expect(screen.queryByText("util.ant")).toBeNull();
  expect(screen.getByLabelText("unsaved changes")).toBeTruthy();
  fireEvent.click(screen.getByText("lib"));
  fireEvent.click(screen.getByText("util.ant"));
  expect(onOpen).toHaveBeenCalledWith("lib/util.ant");
  fireEvent.click(screen.getByText("lib"));
  expect(screen.queryByText("util.ant")).toBeNull();
});

test("a new file goes to the directory last clicked, and an error shows under its name", async () => {
  const onCreate = vi.fn().mockRejectedValueOnce(new Error("lib/util.ant already exists")).mockResolvedValue(undefined);
  render(
    <FileTree
      tree={tree}
      active={null}
      dirty={new Set()}
      onOpen={vi.fn()}
      onCreate={onCreate}
      onRename={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByText("lib"));
  fireEvent.click(screen.getByLabelText("New file"));
  const input = screen.getByLabelText("File name");
  fireEvent.change(input, { target: { value: "util.ant" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect((await screen.findByRole("alert")).textContent).toBe("lib/util.ant already exists");
  fireEvent.change(input, { target: { value: "new.ant" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(screen.queryByLabelText("File name")).toBeNull());
  expect(onCreate.mock.calls).toEqual([
    ["file", "lib/util.ant"],
    ["file", "lib/new.ant"],
  ]);
});

test("a row renames from its menu or F2, and deletes from its menu or Delete", async () => {
  const onRename = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn();
  render(
    <FileTree
      tree={tree}
      active="main.ant"
      dirty={new Set()}
      onOpen={vi.fn()}
      onCreate={vi.fn()}
      onRename={onRename}
      onDelete={onDelete}
    />,
  );
  fireEvent.contextMenu(screen.getByText("main.ant"));
  fireEvent.click(screen.getByRole("menuitem", { name: /Rename/ }));
  const input = screen.getByLabelText("New name") as HTMLInputElement;
  expect([input.value, input.selectionStart, input.selectionEnd]).toEqual(["main.ant", 0, 4]);
  fireEvent.change(input, { target: { value: "app.ant" } });
  fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(screen.queryByLabelText("New name")).toBeNull());
  expect(onRename).toHaveBeenCalledWith("main.ant", "app.ant");

  fireEvent.keyDown(screen.getByText("lib"), { key: "F2" });
  fireEvent.change(screen.getByLabelText("New name"), { target: { value: "src" } });
  fireEvent.keyDown(screen.getByLabelText("New name"), { key: "Enter" });
  await waitFor(() => expect(onRename).toHaveBeenCalledWith("lib", "src"));

  fireEvent.keyDown(screen.getByText("lib"), { key: "Delete" });
  expect(onDelete).toHaveBeenCalledWith(tree[0]);
  fireEvent.contextMenu(screen.getByText("main.ant"));
  fireEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
  expect(onDelete).toHaveBeenLastCalledWith(tree[1]);
});

test("the arrow keys move between rows and fold directories", () => {
  render(
    <FileTree
      tree={tree}
      active={null}
      dirty={new Set()}
      onOpen={vi.fn()}
      onCreate={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  const lib = screen.getByText("lib").closest("button")!;
  lib.focus();
  fireEvent.keyDown(lib, { key: "ArrowRight" });
  expect(screen.getByText("util.ant")).toBeTruthy();
  fireEvent.keyDown(lib, { key: "ArrowDown" });
  expect(document.activeElement).toBe(screen.getByText("util.ant").closest("button"));
  fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
  expect(document.activeElement).toBe(lib);
  fireEvent.keyDown(lib, { key: "ArrowLeft" });
  expect(screen.queryByText("util.ant")).toBeNull();
});

test("a row dragged onto a directory moves into it", async () => {
  const onRename = vi.fn().mockResolvedValue(undefined);
  render(
    <FileTree
      tree={tree}
      active={null}
      dirty={new Set()}
      onOpen={vi.fn()}
      onCreate={vi.fn()}
      onRename={onRename}
      onDelete={vi.fn()}
    />,
  );
  const data = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
  fireEvent.dragStart(screen.getByText("main.ant"), { dataTransfer: data });
  fireEvent.dragOver(screen.getByText("lib"), { dataTransfer: data });
  fireEvent.drop(screen.getByText("lib"), { dataTransfer: data });
  expect(onRename).toHaveBeenCalledWith("main.ant", "lib/main.ant");
});

test("the console links the positions of the project's files", () => {
  const onOpen = vi.fn();
  render(
    <Console
      segments={[
        { id: 1, stream: "stdout", text: "hello\n" },
        { id: 2, stream: "stderr", text: "panic: boom\n  at f (lib/util.ant:3:7)\n  at other.ant:1:1\n" },
      ]}
      isFile={(path) => path === "lib/util.ant"}
      onOpen={onOpen}
    />,
  );
  expect(screen.getByRole("log").textContent).toContain("hello\npanic: boom");
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["lib/util.ant:3:7"]);
  fireEvent.click(screen.getByText("lib/util.ant:3:7"));
  expect(onOpen).toHaveBeenCalledWith("lib/util.ant", 3, 7);
});

const variable = (name: string, value: string, more: Partial<Variable> = {}): Variable => ({
  name,
  value,
  variablesReference: 0,
  ...more,
});

function stopAt(scopes: Scope[]): Stop {
  return {
    reason: "breakpoint",
    threadId: 1,
    frames: [
      { id: 1, name: "double", path: "lib/math.ant", line: 2, column: 3 },
      { id: 2, name: "module main.ant", path: "main.ant", line: 5, column: 3 },
    ],
    scopes,
  };
}

test("the debugger panel shows the stack and the variables, marks changes, and opens a value's parts", async () => {
  const inspector = {
    scopes: vi.fn(async () => [{ name: "Module", variables: [variable("total", "0")] }]),
    variables: vi.fn(async () => [variable("x", "1"), variable("y", "2")]),
  };
  const onSelectFrame = vi.fn();
  const first = stopAt([
    { name: "Locals", variables: [variable("n", "1"), variable("p", "Point{x: 1, y: 2}", { variablesReference: 7 })] },
  ]);
  const view = render(<Variables stop={first} frame={0} inspector={inspector} onSelectFrame={onSelectFrame} />);
  expect(screen.getByText("Paused on breakpoint")).toBeTruthy();
  expect(screen.getByText("lib/math.ant:2")).toBeTruthy();
  expect(screen.getByText("n").closest(".var")!.textContent).toBe("n1");

  fireEvent.click(screen.getByText("p"));
  expect(await screen.findByText("y")).toBeTruthy();
  expect(inspector.variables).toHaveBeenCalledWith(7, undefined, undefined);

  // the next stop: n has changed, and p stays open with its parts read again
  const second = stopAt([
    {
      name: "Locals",
      variables: [variable("n", "2", { changed: true }), variable("p", "Point{x: 1, y: 2}", { variablesReference: 9 })],
    },
  ]);
  view.rerender(<Variables stop={second} frame={0} inspector={inspector} onSelectFrame={onSelectFrame} />);
  expect(screen.getByText("n").closest(".var")!.classList.contains("changed")).toBe(true);
  await waitFor(() => expect(inspector.variables).toHaveBeenCalledWith(9, undefined, undefined));

  // a caller's frame: its variables are asked for
  fireEvent.click(screen.getByText("module main.ant"));
  expect(onSelectFrame).toHaveBeenCalledWith(1);
  view.rerender(<Variables stop={second} frame={1} inspector={inspector} onSelectFrame={onSelectFrame} />);
  expect(await screen.findByText("total")).toBeTruthy();
  expect(inspector.scopes).toHaveBeenCalledWith(2);
});

test("while the program runs the panel says so, after a moment", async () => {
  vi.useFakeTimers();
  const inspector = { scopes: vi.fn(), variables: vi.fn() };
  const view = render(<Variables stop={stopAt([])} frame={0} inspector={inspector} onSelectFrame={vi.fn()} />);
  view.rerender(<Variables stop={undefined} frame={0} inspector={inspector} onSelectFrame={vi.fn()} />);
  expect(screen.getByText("Paused on breakpoint")).toBeTruthy(); // a step does not blink
  act(() => void vi.advanceTimersByTime(250));
  expect(screen.getByText("Running…")).toBeTruthy();
  vi.useRealTimers();
});

test("a menu item comes off by its button or Delete, and the menu stays open with the focus in it", async () => {
  const onClose = vi.fn();
  const removed: string[] = [];
  const entries = (names: string[]) =>
    names.map((name) => ({ label: name, checked: false, onSelect: vi.fn(), onRemove: () => removed.push(name) }));
  const { rerender } = render(<Menu label="Run" x={0} y={0} entries={entries(["a", "b", "c"])} onClose={onClose} />);
  expect(screen.getAllByRole("menuitemradio").map((b) => b.textContent)).toEqual(["a", "b", "c"]);
  fireEvent.click(screen.getByTitle("Remove a"));
  rerender(<Menu label="Run" x={0} y={0} entries={entries(["b", "c"])} onClose={onClose} />);
  const c = screen.getByText("c").closest("button")!;
  c.focus();
  fireEvent.keyDown(c, { key: "Delete" });
  expect(removed).toEqual(["a", "c"]);
  expect(onClose).not.toHaveBeenCalled();
  rerender(<Menu label="Run" x={0} y={0} entries={entries(["b"])} onClose={onClose} />);
  await waitFor(() => expect(document.activeElement?.textContent).toBe("b"));
});

test("the settings panel switches the theme, steps and types the font size, and toggles wrapping", () => {
  render(<SettingsButton />);
  fireEvent.click(screen.getByLabelText("Settings"));
  const dialog = screen.getByRole("dialog", { name: "Settings" });
  expect(document.activeElement).toBe(screen.getByRole("radio", { name: "System" }));

  fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
  expect(getSettings().theme).toBe("dark");
  fireEvent.keyDown(screen.getByRole("radio", { name: "Dark" }), { key: "ArrowRight" });
  expect(getSettings().theme).toBe("system");

  const size = screen.getByRole("spinbutton");
  fireEvent.click(screen.getByLabelText("Larger"));
  expect(getSettings().fontSize).toBe(14);
  fireEvent.keyDown(size, { key: "ArrowDown" });
  expect(getSettings().fontSize).toBe(13);
  fireEvent.change(size, { target: { value: "20" } });
  expect(getSettings().fontSize).toBe(13); // not until Enter
  fireEvent.keyDown(size, { key: "Enter" });
  expect(getSettings().fontSize).toBe(20);
  fireEvent.change(size, { target: { value: "99" } });
  fireEvent.blur(size);
  expect(getSettings().fontSize).toBe(24);
  expect((screen.getByLabelText("Larger") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(size, { target: { value: "abc" } });
  fireEvent.keyDown(size, { key: "Enter" });
  expect(getSettings().fontSize).toBe(24);

  fireEvent.click(screen.getByRole("switch", { name: "Word wrap" }));
  expect(getSettings().wordWrap).toBe(true);

  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  set("fontSize", 13);
  set("wordWrap", false);
});

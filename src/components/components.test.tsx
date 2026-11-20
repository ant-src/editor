// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { Scope, Stop, Variable } from "../run/runner";
import { Console } from "./Console";
import { FileTree } from "./FileTree";
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
      name="demo"
      tree={tree}
      active="main.ant"
      dirty={new Set(["main.ant"])}
      onOpen={onOpen}
      onCreate={vi.fn()}
      onRefresh={vi.fn()}
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
      name="demo"
      tree={tree}
      active={null}
      dirty={new Set()}
      onOpen={vi.fn()}
      onCreate={onCreate}
      onRefresh={vi.fn()}
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
      onClear={vi.fn()}
    />,
  );
  expect(screen.getByRole("log").textContent).toContain("hello\npanic: boom");
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["", "lib/util.ant:3:7"]);
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

import { expect, test } from "vitest";
import { collect, describe, runNotes, type Problem } from "./problems";

test("problems are errors and warnings, by file and position", () => {
  const problems = collect([
    { path: "main.ant", line: 4, column: 1, message: "b", severity: 8 },
    { path: "lib/util.ant", line: 2, column: 5, message: "a", severity: 4 },
    { path: "main.ant", line: 1, column: 9, message: "hint", severity: 1 },
    { path: "main.ant", line: 1, column: 3, message: "c", severity: 8 },
  ]);
  expect(problems.map((p) => [p.path, p.line, p.severity])).toEqual([
    ["lib/util.ant", 2, "warning"],
    ["main.ant", 1, "error"],
    ["main.ant", 4, "error"],
  ]);
  expect(describe(problems[1])).toBe("main.ant:1:3: c\n");
});

test("a run names the checker's errors, unless the program will not load", () => {
  const error = (line: number, code: string, path = "main.ant"): Problem => ({
    path,
    line,
    column: 1,
    message: code,
    severity: "error",
    code,
  });
  expect(runNotes([error(1, "type-mismatch"), error(2, "undefined", "notes.txt")])).toEqual([
    "main.ant:1:1: type-mismatch\n",
  ]);
  expect(runNotes([error(1, "type-mismatch"), error(2, "syntax")])).toEqual([]);
  expect(runNotes([error(1, "missing-module")])).toEqual([]);
  expect(runNotes([error(1, "import")])).toEqual([]);
  const many = [1, 2, 3, 4].map((line) => error(line, "type-mismatch"));
  expect(runNotes(many, 2)).toEqual([
    "main.ant:1:1: type-mismatch\n",
    "main.ant:2:1: type-mismatch\n",
    "and 2 more errors, in Problems\n",
  ]);
});

import { expect, test } from "vitest";
import { collect, describe } from "./problems";

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

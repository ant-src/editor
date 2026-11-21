// @vitest-environment jsdom
// The parts of keys.ts that need a page; keys.test.ts runs in Node, which says it is a Mac when it is.
import { expect, test } from "vitest";
import { typesText } from "./keys";

test("keys go into text in fields and the code, nowhere else", () => {
  const field = document.createElement("input");
  const code = document.createElement("div");
  code.className = "monaco-editor";
  code.append(document.createElement("textarea"));
  expect(typesText(field)).toBe(true);
  expect(typesText(code.firstChild)).toBe(true);
  expect(typesText(document.createElement("button"))).toBe(false);
  expect(typesText(null)).toBe(false);
});

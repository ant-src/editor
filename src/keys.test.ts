import { expect, test } from "vitest";
import { key, mac } from "./keys";

test("keys are written the platform's way", () => {
  if (mac) {
    expect(key("mod+shift+S")).toBe("⇧⌘S");
    expect(key("mod+Enter")).toBe("⌘↵");
  } else {
    expect(key("mod+shift+S")).toBe("Ctrl+Shift+S");
    expect(key("mod+Enter")).toBe("Ctrl+Enter");
  }
  expect(key("F5")).toBe("F5");
});

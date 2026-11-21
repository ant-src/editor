// The report of a test run in the console, as ant test -v prints it (spec/test.md section 2):
// each test as it starts and ends, with its output and its failures, and the counts last.
import type { TestEvent } from "@ant-lang/wasm";

/** report is the text an event adds to the console, and the stream it shows on. */
export function report(e: TestEvent): ["stdout" | "stderr" | "info", string] {
  if (e.action === "done") {
    const counts = [
      e.failed > 0 ? `${e.failed} failed` : "",
      `${e.passed} passed`,
      e.skipped > 0 ? `${e.skipped} skipped` : "",
    ];
    const summary = e.passed + e.failed + e.skipped === 0 ? "no tests" : counts.filter(Boolean).join(", ");
    return e.failed > 0
      ? ["stderr", `FAIL  ${summary} (${seconds(e.elapsed)})\n`]
      : ["info", `ok    ${summary} (${seconds(e.elapsed)})\n`];
  }
  const name = `${e.file}: ${e.test}`;
  switch (e.action) {
    case "run":
      return ["info", `=== RUN   ${name}\n`];
    case "output":
      return ["stdout", indent(e.output)];
    case "pass":
      return ["info", `--- PASS: ${name} (${seconds(e.elapsed)})\n`];
    case "skip":
      return ["info", `--- SKIP: ${name} (${seconds(e.elapsed)})\n` + indent(e.reason ?? "")];
    case "fail":
      return ["stderr", `--- FAIL: ${name} (${seconds(e.elapsed)})\n` + indent(e.message ?? "")];
  }
}

const seconds = (s: number) => s.toFixed(2) + "s";

/** indent indents every line by four spaces, and ends the last with a newline. */
function indent(text: string): string {
  return text === "" ? "" : "    " + text.replace(/\n$/, "").replaceAll("\n", "\n    ") + "\n";
}

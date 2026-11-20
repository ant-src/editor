import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { crc32, zip } from "./zip";

const text = (s: string) => new TextEncoder().encode(s);

test("crc32 is the one zip uses", () => {
  expect(crc32(text("hello"))).toBe(0x3610a686);
  expect(crc32(new Uint8Array())).toBe(0);
});

test("unzip reads the archive back", async () => {
  const archive = zip([
    { path: "main.ant", data: text('println("hi")\n') },
    { path: "lib/ünï.ant", data: text("x") },
    { path: "assets/", data: new Uint8Array() },
  ]);
  const dir = mkdtempSync(join(tmpdir(), "zip-"));
  writeFileSync(join(dir, "a.zip"), new Uint8Array(await archive.arrayBuffer()));
  execFileSync("unzip", ["-q", "a.zip", "-d", "out"], { cwd: dir });
  expect(readFileSync(join(dir, "out/main.ant"), "utf8")).toBe('println("hi")\n');
  expect(readFileSync(join(dir, "out/lib/ünï.ant"), "utf8")).toBe("x");
  expect(execFileSync("unzip", ["-t", "a.zip"], { cwd: dir, encoding: "utf8" })).toContain("No errors");
});

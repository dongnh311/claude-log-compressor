import { describe, expect, it } from "vitest";
import { execCommand, stripAnsi } from "../src/log-side/executor.js";

describe("stripAnsi", () => {
  it("removes common color codes", () => {
    expect(stripAnsi("\u001b[31mred\u001b[0m")).toBe("red");
    expect(stripAnsi("plain")).toBe("plain");
  });
});

describe("execCommand", () => {
  it("captures stdout and exit code", async () => {
    const r = await execCommand({ command: "echo hello" });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("hello");
    expect(r.timedOut).toBe(false);
  });

  it("captures non-zero exit codes", async () => {
    const r = await execCommand({ command: "exit 3" });
    expect(r.exitCode).toBe(3);
  });

  it("honors timeout", async () => {
    const r = await execCommand({ command: "sleep 5", timeoutMs: 200 });
    expect(r.timedOut).toBe(true);
  });
});

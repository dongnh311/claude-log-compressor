import { describe, expect, it } from "vitest";
import { newLogId, readLog, writeLog } from "../../src/log-side/log-cache.js";

describe("cache", () => {
  it("round-trips content via log id", async () => {
    const id = newLogId("test");
    const body = "hello\nworld\n";
    await writeLog(id, body);
    expect(await readLog(id)).toBe(body);
  });

  it("prefixes log ids by kind", () => {
    expect(newLogId("gradle")).toMatch(/^gradle_[a-f0-9]{12}$/);
    expect(newLogId("grd")).toMatch(/^grd_[a-f0-9]{12}$/);
  });

  it("returns null on cache miss", async () => {
    expect(await readLog("nonexistent_deadbeef0000")).toBeNull();
  });
});

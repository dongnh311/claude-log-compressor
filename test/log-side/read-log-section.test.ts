import { describe, expect, it } from "vitest";
import { newLogId, writeLog } from "../../src/log-side/log-cache.js";
import { readLogSection } from "../../src/log-side/tools/read-log-section.js";

async function stageLog(body: string): Promise<string> {
  const id = newLogId("rls");
  await writeLog(id, body);
  return id;
}

describe("readLogSection", () => {
  it("returns error for missing log_id", async () => {
    const out = await readLogSection({ log_id: "nonexistent_000000000000" });
    expect(out).toMatch(/not found/);
  });

  it("returns first 200 lines by default", async () => {
    const body = Array.from({ length: 500 }, (_, i) => `line-${i + 1}`).join("\n");
    const id = await stageLog(body);
    const out = await readLogSection({ log_id: id });
    expect(out).toContain("1: line-1");
    expect(out).toContain("200: line-200");
    expect(out).not.toContain("201: line-201");
  });

  it("honors start_line and end_line", async () => {
    const body = Array.from({ length: 100 }, (_, i) => `L${i + 1}`).join("\n");
    const id = await stageLog(body);
    const out = await readLogSection({ log_id: id, start_line: 10, end_line: 12 });
    expect(out).toContain("10: L10");
    expect(out).toContain("11: L11");
    expect(out).toContain("12: L12");
    expect(out).not.toContain("13: L13");
    expect(out).not.toContain("9: L9");
  });

  it("grep returns context around matches", async () => {
    const body = [
      "setup line 1",
      "setup line 2",
      "ERROR: something failed",
      "stack frame 1",
      "stack frame 2",
      "unrelated line",
      "another ERROR: oops",
      "final line",
    ].join("\n");
    const id = await stageLog(body);
    const out = await readLogSection({ log_id: id, grep: "ERROR", lines_around: 1 });
    expect(out).toContain("ERROR: something failed");
    expect(out).toContain("stack frame 1");
    expect(out).toContain("setup line 2");
    expect(out).toContain("another ERROR: oops");
    expect(out).not.toContain("setup line 1");
  });

  it("separates non-contiguous grep matches with ---", async () => {
    const body = Array.from({ length: 20 }, (_, i) =>
      i === 5 || i === 15 ? `MATCH line ${i}` : `line ${i}`,
    ).join("\n");
    const id = await stageLog(body);
    const out = await readLogSection({ log_id: id, grep: "MATCH", lines_around: 0 });
    expect(out).toContain("6: MATCH line 5");
    expect(out).toContain("16: MATCH line 15");
    expect(out).toMatch(/---/);
  });

  it("caps returned tokens", async () => {
    const body = Array.from({ length: 5000 }, (_, i) => `line-${i} with extra padding text`).join(
      "\n",
    );
    const id = await stageLog(body);
    const out = await readLogSection({ log_id: id, max_tokens: 100 });
    expect(out).toMatch(/truncated at 100 tokens/);
  });

  it("reports invalid regex gracefully", async () => {
    const id = await stageLog("hello\nworld\n");
    const out = await readLogSection({ log_id: id, grep: "(" });
    expect(out).toMatch(/invalid regex/);
  });
});

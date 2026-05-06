import { describe, it, expect } from "vitest";
import { syncMeta } from "./syncMeta";

describe("syncMeta", () => {
  it("exports a function", () => {
    expect(typeof syncMeta).toBe("function");
  });
});

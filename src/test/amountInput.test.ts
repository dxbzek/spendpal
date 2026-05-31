import { describe, it, expect } from "vitest";
import { normalizeAmount } from "@/components/ui/AmountInput";

describe("normalizeAmount", () => {
  it("converts a comma decimal to a dot", () => {
    expect(normalizeAmount("1,50")).toBe("1.50");
  });

  it("leaves a dot decimal unchanged", () => {
    expect(normalizeAmount("1234.50")).toBe("1234.50");
  });

  it("strips non-numeric characters (typed letters produce nothing)", () => {
    expect(normalizeAmount("abc")).toBe("");
    expect(normalizeAmount("12a3")).toBe("123");
  });

  it("removes extra dots, keeping the first as the decimal separator", () => {
    expect(normalizeAmount("1.2.3")).toBe("1.23");
    expect(normalizeAmount("12..50")).toBe("12.50");
  });

  it("preserves a leading zero", () => {
    expect(normalizeAmount("0.5")).toBe("0.5");
  });

  it("allows an in-progress trailing dot", () => {
    expect(normalizeAmount("12.")).toBe("12.");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeAmount("")).toBe("");
  });
});

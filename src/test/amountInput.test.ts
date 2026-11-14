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
    expect(normalizeAmount("1.2.3.4")).toBe("1.234");
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

// Regression: every comma became a decimal point, so "20,000" was saved as 20
// and "1,234.50" as 1.2345.
describe("normalizeAmount reads separators by position", () => {
  const value = (raw: string) => parseFloat(normalizeAmount(raw));

  it("reads a comma before three digits as a thousands separator", () => {
    expect(normalizeAmount("20,000")).toBe("20000");
    expect(value("20,000")).toBe(20000);
    expect(value("1,000")).toBe(1000);
    expect(value("100,000")).toBe(100000);
    expect(value("1,234,567")).toBe(1234567);
  });

  it("reads the last separator as the decimal when both kinds are present", () => {
    expect(value("1,234.50")).toBe(1234.5);
    expect(value("1.234,50")).toBe(1234.5);
    expect(value("1,234,567.89")).toBe(1234567.89);
    expect(value("1.234.567,89")).toBe(1234567.89);
  });

  it("keeps a comma before one or two digits as a decimal", () => {
    expect(value("1,50")).toBe(1.5);
    expect(value("1,5")).toBe(1.5);
    expect(value("0,75")).toBe(0.75);
  });

  it("keeps a comma decimal when the digits before it are not a thousands group", () => {
    // Nobody writes five hundred as "0,500", or a million as "1234,567".
    expect(value("0,500")).toBe(0.5);
    expect(value("1234,567")).toBe(1234.567);
  });

  it("keeps one dot as a decimal even before three digits", () => {
    expect(value("1.234")).toBe(1.234);
  });

  it("reads repeated dots in groups of three as thousands separators", () => {
    expect(value("1.234.567")).toBe(1234567);
  });

  it("drops a repeated comma that is not a thousands group", () => {
    expect(normalizeAmount("12,,50")).toBe("12.50");
    expect(normalizeAmount("1,2,3")).toBe("1.23");
  });

  it("reads pasted bank text with a currency code and spaces", () => {
    expect(value("AED 20,000.00")).toBe(20000);
    expect(value("1 234,50")).toBe(1234.5);
  });

  it("gives a usable number at every keystroke of a thousands entry", () => {
    expect(value("20,")).toBe(20);
    expect(value("20,0")).toBe(20);
    expect(value("20,00")).toBe(20);
    expect(value("1,234.")).toBe(1234);
  });

  it("drops a minus unless negatives are allowed", () => {
    expect(normalizeAmount("-150.25")).toBe("150.25");
    expect(normalizeAmount("-150.25", { allowNegative: true })).toBe("-150.25");
    expect(normalizeAmount("-1,234.50", { allowNegative: true })).toBe("-1234.50");
    expect(normalizeAmount("12-3", { allowNegative: true })).toBe("123");
    expect(normalizeAmount("-", { allowNegative: true })).toBe("-");
  });
});

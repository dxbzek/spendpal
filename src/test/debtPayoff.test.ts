import { describe, it, expect } from "vitest";
import {
  monthsToPayoff,
  totalInterest,
  minPayment,
  simulateStrategy,
  type StrategyDebt,
} from "@/lib/finance/debtPayoff";

describe("monthsToPayoff", () => {
  it("divides evenly when APR is zero", () => {
    expect(monthsToPayoff(1200, 0, 100)).toBe(12);
  });

  it("returns Infinity when the payment cannot cover monthly interest", () => {
    // 1000 at 24% APR accrues 20/mo interest; paying exactly 20 never amortizes.
    expect(monthsToPayoff(1000, 24, 20)).toBe(Infinity);
  });

  it("returns Infinity for non-positive payment or principal", () => {
    expect(monthsToPayoff(1000, 12, 0)).toBe(Infinity);
    expect(monthsToPayoff(0, 12, 100)).toBe(Infinity);
  });

  it("amortizes a normal balance to a finite number of months", () => {
    const m = monthsToPayoff(1000, 12, 100);
    expect(m).toBeGreaterThan(0);
    expect(m).toBeLessThan(12);
    expect(Number.isFinite(m)).toBe(true);
  });
});

describe("totalInterest", () => {
  it("is zero at 0% APR when payments divide evenly", () => {
    expect(totalInterest(1200, 0, 100)).toBe(0);
  });

  it("is positive when interest accrues", () => {
    expect(totalInterest(1000, 12, 100)).toBeGreaterThan(0);
  });

  it("is Infinity when the debt never amortizes", () => {
    expect(totalInterest(1000, 24, 20)).toBe(Infinity);
  });
});

describe("minPayment", () => {
  it("uses 2% of balance above the floor", () => {
    expect(minPayment(5000)).toBe(100);
  });

  it("applies a 25 floor for small balances", () => {
    expect(minPayment(1000)).toBe(25);
    expect(minPayment(0)).toBe(25);
  });
});

describe("simulateStrategy", () => {
  it("returns zeroes for no debts", () => {
    expect(simulateStrategy([], [], 0)).toEqual({ totalInterest: 0, months: 0, hitCap: false });
  });

  it("avalanche (highest APR first) costs no more interest than snowball", () => {
    const debts: StrategyDebt[] = [
      { id: "small", owed: 500, apr: 10, minPay: 25 },
      { id: "big", owed: 2000, apr: 30, minPay: 40 },
    ];
    const avalanche = simulateStrategy(debts, [debts[1], debts[0]], 200); // high APR first
    const snowball = simulateStrategy(debts, [debts[0], debts[1]], 200); // small balance first

    expect(Number.isFinite(avalanche.months)).toBe(true);
    expect(avalanche.hitCap).toBe(false);
    expect(avalanche.totalInterest).toBeLessThanOrEqual(snowball.totalInterest);
  });

  it("flags non-convergence when the budget cannot cover interest", () => {
    const debts: StrategyDebt[] = [{ id: "a", owed: 10000, apr: 30, minPay: 25 }];
    const result = simulateStrategy(debts, debts, 0);
    expect(result.months).toBe(Infinity);
    expect(result.hitCap).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import {
  monthsToPayoff,
  totalInterest,
  minPayment,
  simulateStrategy,
  allocateMonth,
  minimumMonthlyBudget,
  splitOwed,
  revolvingMinimum,
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

  it("reports exactly zero interest for interest-free (0% APR) debts", () => {
    // BNPL plans (Tabby/Tamara) carry apr 0 — no interest can accrue, so
    // totalInterest must be 0. The prior `totalBudget * month` estimate
    // over-counted the final month's unused surplus as phantom interest.
    const debts: StrategyDebt[] = [
      { id: "a", owed: 400, apr: 0, minPay: minPayment(400) },
      { id: "b", owed: 1000, apr: 0, minPay: minPayment(1000) },
    ];
    const order = [...debts].sort((x, y) => x.owed - y.owed); // snowball
    const result = simulateStrategy(debts, order, 100);
    expect(result.hitCap).toBe(false);
    expect(result.months).toBeGreaterThan(0);
    expect(result.totalInterest).toBe(0);
  });

  it("never reports negative interest even with a large surplus budget", () => {
    const debts: StrategyDebt[] = [{ id: "a", owed: 200, apr: 0, minPay: minPayment(200) }];
    expect(simulateStrategy(debts, debts, 5000).totalInterest).toBe(0);
  });

  it("estimates a 2% minimum when a card has no statement minimum", () => {
    // 12,159.90 at 39% accrues ~395/mo. With no statement minimums the budget
    // used to count minimums as 0, so a 700 budget looked like "can't cover
    // interest"; it is plenty.
    const debts: StrategyDebt[] = [
      { id: "enbd", owed: 12159.9, apr: 39, minPay: 0 },
      { id: "tabby", owed: 854.7, apr: 0, minPay: 0 },
      { id: "later", owed: 197.5, apr: 0, minPay: 0 },
    ];
    const result = simulateStrategy(debts, debts, 700);
    expect(result.hitCap).toBe(false);
    expect(minimumMonthlyBudget(debts)).toBeGreaterThan(400);
    expect(minimumMonthlyBudget(debts)).toBeLessThan(700);
  });
});

describe("allocateMonth", () => {
  it("pays minimums elsewhere and the rest on the focus card", () => {
    const debts = [
      { id: "a", balance: 5000, minPay: 150 },
      { id: "b", balance: 800, minPay: 0 },
    ];
    const pay = allocateMonth(debts, [{ id: "a" }, { id: "b" }], 1000);
    expect(pay.b).toBe(25);
    expect(pay.a).toBe(975);
  });
});

// Regression: the Debt page amortised a card's whole balance at the card APR,
// instalment plan principal included.
describe("splitOwed", () => {
  // A card that owes 12,400.00, of which 7,650.75 is plan principal.
  const plans = [
    { left: 3000, perMonth: 100 },
    { left: 4200.5, perMonth: 150 },
    { left: 450.25, perMonth: 150.25 },
  ];

  it("takes instalment plan principal out of the revolving amount", () => {
    const split = splitOwed(12400, plans);
    expect(split.inPlans).toBe(7650.75);
    expect(split.revolving).toBe(4749.25);
    expect(split.planMonthly).toBe(400.25);
  });

  it("leaves the whole balance revolving when the card has no plans", () => {
    expect(splitOwed(4000, [])).toEqual({ inPlans: 0, revolving: 4000, planMonthly: 0 });
  });

  it("never makes the revolving amount negative when plans add up to more than is owed", () => {
    expect(splitOwed(1000, [{ left: 1200, perMonth: 300 }])).toEqual({
      inPlans: 1000, revolving: 0, planMonthly: 300,
    });
  });

  it("ignores a finished plan and a card in credit", () => {
    expect(splitOwed(500, [{ left: 0, perMonth: 100 }])).toEqual({ inPlans: 0, revolving: 500, planMonthly: 0 });
    expect(splitOwed(-50, plans).revolving).toBe(0);
  });

  it("charges interest on the revolving part only", () => {
    // 1,200 a month at 36%: the whole balance against the part that really is
    // card debt. Plan interest is already inside the instalments.
    const { revolving } = splitOwed(12400, plans);
    expect(monthsToPayoff(12400, 36, 1200)).toBe(13);
    expect(monthsToPayoff(revolving, 36, 1200)).toBe(5);
    expect(totalInterest(revolving, 36, 1200)).toBeLessThan(totalInterest(12400, 36, 1200) / 2);
  });
});

describe("revolvingMinimum", () => {
  it("takes the plan instalments out of the statement minimum", () => {
    expect(revolvingMinimum(900, 400.25)).toBe(499.75);
  });

  it("is the statement minimum when the card has no plans", () => {
    expect(revolvingMinimum(900, 0)).toBe(900);
  });

  it("stops at zero when the instalments are more than the minimum", () => {
    expect(revolvingMinimum(200, 300)).toBe(0);
  });

  it("is null when no statement minimum was entered", () => {
    expect(revolvingMinimum(null, 300)).toBeNull();
    expect(revolvingMinimum(undefined, 0)).toBeNull();
  });
});

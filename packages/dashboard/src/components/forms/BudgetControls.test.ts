import { describe, expect, it } from "vitest";
import { budgetFromForm } from "./BudgetControls";

describe("budgetFromForm", () => {
  it("returns null when no limits are entered", () => {
    const form = new FormData();
    form.set("budget:onExceed", "block");
    expect(budgetFromForm(form)).toBeNull();
  });

  it("builds token and cost budgets", () => {
    const form = new FormData();
    form.set("budget:tokenLimit", "1000");
    form.set("budget:costLimitEur", "12.50");
    form.set("budget:period", "week");
    form.set("budget:onExceed", "warn");
    expect(budgetFromForm(form)).toEqual({
      tokenLimit: 1000,
      costLimitEur: 12.5,
      period: "week",
      onExceed: "warn"
    });
  });
});

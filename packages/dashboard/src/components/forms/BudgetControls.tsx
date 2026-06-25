import { FormField, FormGrid, FormNote, SelectControl } from "./FormControls";
import type { Budget } from "../../app/types";

const actions = [
  { id: "block", label: "Block when exceeded" },
  { id: "warn", label: "Warn only" }
];
const periods = [
  { id: "day", label: "Daily" },
  { id: "week", label: "Weekly" },
  { id: "month", label: "Monthly" },
  { id: "total", label: "Total" }
];

export function BudgetFields({ budget }: { budget?: Budget }) {
  return <fieldset className="choice-group">
    <legend>Budget</legend>
    <FormGrid>
      <FormField label="Token limit"><input name="budget:tokenLimit" type="number" min="1" step="1" defaultValue={budget?.tokenLimit ?? ""} placeholder="unlimited" /></FormField>
      <FormField label="Cost limit EUR"><input name="budget:costLimitEur" type="number" min="0.01" step="0.01" defaultValue={budget?.costLimitEur ?? ""} placeholder="unlimited" /></FormField>
      <FormField label="Period"><SelectControl name="budget:period" defaultValue={budget?.period || "month"} options={periods} /></FormField>
      <FormField label="Action"><SelectControl name="budget:onExceed" defaultValue={budget?.onExceed || "block"} options={actions} /></FormField>
    </FormGrid>
    <FormNote>Leave both limits empty for unlimited usage.</FormNote>
  </fieldset>;
}

export function budgetFromForm(form: FormData): Budget | null {
  const tokenLimit = positiveNumber(form.get("budget:tokenLimit"));
  const costLimitEur = positiveNumber(form.get("budget:costLimitEur"));
  if (tokenLimit === undefined && costLimitEur === undefined) return null;
  const onExceed = stringChoice(form.get("budget:onExceed"), ["block", "warn"], "block") as "block" | "warn";
  const period = stringChoice(form.get("budget:period"), ["day", "week", "month", "total"], "month");
  return { tokenLimit, costLimitEur, period, onExceed };
}

function positiveNumber(value: FormDataEntryValue | null): number | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return undefined;
  const numberValue = Number(text);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function stringChoice(value: FormDataEntryValue | null, allowed: string[], fallback: string): string {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

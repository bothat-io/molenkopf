import { useId } from "react";
import type { ReactNode } from "react";
import "./FormControls.css";

export type ChoiceOption = { id: string; label: string; meta?: string };
export const DEFAULT_TEXT_FILE_MAX_BYTES = 256 * 1024;

export function RadioButtonChoice({ label, name, value, options, onChange }: { label: string; name: string; value: string; options: ChoiceOption[]; onChange: (value: string) => void }) {
  return <fieldset className="choice-group"><legend>{label}</legend><div className="radio-row">
    {options.map((option) => <label key={option.id} className="radio-choice"><input type="radio" name={name} value={option.id} checked={value === option.id} onChange={() => onChange(option.id)} /> {option.label}</label>)}
  </div></fieldset>;
}

export function CheckboxGrid({ label, namePrefix, options, selectedIds }: { label: string; namePrefix: string; options: ChoiceOption[]; selectedIds?: string[] }) {
  const selected = new Set(selectedIds || []);
  return <fieldset className="choice-group"><legend>{label}</legend>{options.length ? <div className="checkbox-grid">
    {options.map((option) => <label key={option.id} className="check-card"><input name={`${namePrefix}:${option.id}`} type="checkbox" defaultChecked={selected.has(option.id)} /><span>{option.label}</span>{option.meta ? <small>{option.meta}</small> : null}</label>)}
  </div> : <p className="hint">No options available.</p>}</fieldset>;
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="form-grid">{children}</div>;
}

export function FormField({ label, children, full = false }: { label: string; children: ReactNode; full?: boolean }) {
  return <label className={`form-field${full ? " full" : ""}`}><span>{label}</span>{children}</label>;
}

export function SelectControl({ name, value, defaultValue, options, onChange }: { name?: string; value?: string; defaultValue?: string; options: ChoiceOption[]; onChange?: (value: string) => void }) {
  const props = { className: "select-control", name, onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onChange?.(event.currentTarget.value) };
  if (value !== undefined) return <select {...props} value={value}>
    {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
  </select>;
  return <select {...props} defaultValue={defaultValue}>
    {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
  </select>;
}

export function FilePicker({ name, label, fileName, maxBytes = DEFAULT_TEXT_FILE_MAX_BYTES, onTextChange, onError }: { name: string; label: string; fileName?: string; maxBytes?: number; onTextChange?: (text: string, fileName: string) => void; onError?: (message: string) => void }) {
  const id = useId();
  return <div className="form-field"><span>{label}</span><label className="file-picker" htmlFor={id}><input id={id} name={name} type="file" onChange={async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return onTextChange?.("", "");
    const error = textFileSizeError(file, maxBytes);
    if (error) {
      event.currentTarget.value = "";
      onTextChange?.("", "");
      onError?.(error);
      return;
    }
    onTextChange?.(await file.text(), file.name);
  }} /><span>{fileName || "Choose file"}</span></label></div>;
}

export function textFileSizeError(file: { size: number; name?: string }, maxBytes = DEFAULT_TEXT_FILE_MAX_BYTES): string {
  return file.size > maxBytes ? "file_too_large" : "";
}

export function FormActionBar({ primary, secondary, abort = "Abort", primaryDisabled, secondaryDisabled, onSecondary, onAbort }: { primary: string; secondary?: string; abort?: string; primaryDisabled?: boolean; secondaryDisabled?: boolean; onSecondary?: () => void; onAbort?: () => void }) {
  return <div className="form-actionbar">{secondary ? <button type="button" disabled={secondaryDisabled} onClick={onSecondary}>{secondary}</button> : null}<button className="primary" type="submit" disabled={primaryDisabled}>{primary}</button>{onAbort ? <button type="button" onClick={onAbort}>{abort}</button> : null}</div>;
}

export function FormNote({ children }: { children: ReactNode }) {
  return <p className="form-note">{children}</p>;
}

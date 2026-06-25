import type { HTMLAttributes, ReactNode } from "react";
import "./DataTable.css";

export type DataColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right";
  width?: string;
};

type DataTableProps<T> = {
  rows: T[];
  columns: DataColumn<T>[];
  rowKey: (row: T) => string;
  className?: string;
  wrapClassName?: string;
  empty?: ReactNode;
  rowProps?: (row: T) => HTMLAttributes<HTMLTableRowElement>;
};

export function DataTable<T>({ rows, columns, rowKey, className = "", wrapClassName = "dtable-wrap", empty, rowProps }: DataTableProps<T>) {
  if (!rows.length && empty) return <>{empty}</>;
  const table = <table className={`dtable data-table ${className}`.trim()}>
    <colgroup>{columns.map((column) => <col key={column.key} style={column.width ? { width: column.width } : undefined} />)}</colgroup>
    <thead><tr>{columns.map((column) => <th key={column.key} className={columnClass(column)}>{column.header}</th>)}</tr></thead>
    <tbody>{rows.map((row) => <tr key={rowKey(row)} {...rowProps?.(row)}>{columns.map((column) => <td key={column.key} className={columnClass(column)}>{column.cell(row)}</td>)}</tr>)}</tbody>
  </table>;
  return wrapClassName ? <div className={wrapClassName}>{table}</div> : table;
}

function columnClass<T>(column: DataColumn<T>) {
  return [column.className, column.align === "right" ? "is-right" : ""].filter(Boolean).join(" ") || undefined;
}

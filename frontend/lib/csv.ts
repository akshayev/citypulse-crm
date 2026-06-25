/**
 * Minimal, dependency-free CSV helpers (D3).
 * Handles quoting, array flattening, and spreadsheet formula-injection.
 */

export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = Array.isArray(value) ? value.join("; ") : String(value);
  // Neutralise CSV/formula injection: a leading =,+,-,@ (or control char) can be
  // executed as a formula by Excel/Sheets. Prefix with an apostrophe.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function rowsToCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) lines.push(row.map(escapeCsvCell).join(","));
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  // Prepend a BOM so Excel reads UTF-8 correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

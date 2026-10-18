/* csv.mjs — a spreadsheet file from rows. Every cell is quoted, and a cell that a spreadsheet would read as a formula (it starts with
   = + - @ or a tab or a return) gets a quote mark in front, so a donor's name can never run as a formula on a treasurer's computer.
   Money is written in whole cents turned into dollars with integer maths: never a floating-point number. */
const FORMULA = /^[=+\-@\t\r]/, PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;   /* a bare number, even a negative one, cannot run as a formula */
export const cell = (v) => { let t = v == null ? "" : String(v); if (FORMULA.test(t) && !PLAIN_NUMBER.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
export const toCsv = (header, rows) => [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
export const dollars = (cents) => { const n = BigInt(cents == null ? 0 : cents), neg = n < 0n, a = neg ? -n : n; return `${neg ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`; };

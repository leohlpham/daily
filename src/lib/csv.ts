import Papa from 'papaparse'

export type Row = string[]

export function parseCsv(text: string): Row[] {
  const res = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true })
  return res.data.map((r) => r.map((c) => (c ?? '').trim()))
}

/** Parse Australian-style dates: dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, "21 Nov 2026", dd/mm/yy. Returns yyyy-mm-dd or null. */
export function parseDate(s: string): string | null {
  s = s.trim().replace(/^"|"$/g, '')
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/)
  if (m) {
    const mi = months.indexOf(m[2].toLowerCase())
    if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  const d = new Date(s)
  if (!isNaN(d.getTime()) && /\d{4}/.test(s)) return d.toISOString().slice(0, 10)
  return null
}

export function parseAmount(s: string): number | null {
  if (s == null) return null
  let t = s.trim().replace(/["$\s,]/g, '').replace(/AUD/i, '')
  if (!t) return null
  let neg = false
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1) }
  if (/CR$/i.test(t)) t = t.slice(0, -2)
  if (/DR$/i.test(t)) { neg = true; t = t.slice(0, -2) }
  const n = Number(t)
  if (isNaN(n)) return null
  return neg ? -Math.abs(n) : n
}

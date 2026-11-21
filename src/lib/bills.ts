import type { Txn } from './types'

export interface Bill { key: string; name: string; category: string; cadence: 'Weekly' | 'Fortnightly' | 'Monthly' | 'Quarterly' | 'Yearly'; amount: number; monthly: number; last: string; next: string; count: number; variable: boolean }

const CADENCES = [
  { name: 'Weekly', days: 7, tol: 2, perMonth: 52 / 12 },
  { name: 'Fortnightly', days: 14, tol: 3, perMonth: 26 / 12 },
  { name: 'Monthly', days: 30.4, tol: 4, perMonth: 1 },
  { name: 'Quarterly', days: 91, tol: 10, perMonth: 1 / 3 },
  { name: 'Yearly', days: 365, tol: 20, perMonth: 1 / 12 },
] as const

/** Normalise a bank description to a merchant key: drop card numbers, refs, dates, locations noise. */
export function merchantKey(desc: string) {
  return desc.toLowerCase()
    .replace(/https?:\/\/|www\.|\.com(\.au)?/g, ' ')
    .replace(/\b(card|xx+\d*|ref|receipt|aus|au|nsw|vic|qld|sydney|melbourne|pty|ltd|direct debit|dd|payment|purchase|visa|eftpos)\b/g, ' ')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ')
}

const days = (a: string, b: string) => (new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 864e5
const addDays = (d: string, n: number) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + Math.round(n)); return x.toISOString().slice(0, 10) }
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

const SKIP = new Set(['Transfers', 'Income', 'Groceries', 'Eating out', 'Takeaway', 'Fuel', 'Betting'])

export function detectBills(txns: Txn[], dismissed: string[] = []): Bill[] {
  const groups = new Map<string, Txn[]>()
  for (const t of txns) {
    if (t.amount >= 0 || SKIP.has(t.category)) continue
    const k = merchantKey(t.description)
    if (!k || dismissed.includes(k)) continue
    groups.set(k, [...(groups.get(k) ?? []), t])
  }
  const bills: Bill[] = []
  for (const [key, list] of groups) {
    if (list.length < 2) continue
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date))
    // collapse same-day duplicates
    const uniq = sorted.filter((t, i) => i === 0 || t.date !== sorted[i - 1].date)
    if (uniq.length < 2) continue
    const gaps = uniq.slice(1).map((t, i) => days(uniq[i].date, t.date))
    const g = median(gaps)
    const cad = CADENCES.find((c) => Math.abs(g - c.days) <= c.tol)
    if (!cad) continue
    const regular = gaps.filter((x) => Math.abs(x - cad.days) <= cad.tol * 1.5).length / gaps.length
    if (regular < 0.6) continue
    if (cad.name === 'Weekly' && uniq.length < 4) continue
    if ((cad.name === 'Fortnightly' || cad.name === 'Monthly') && uniq.length < 2) continue
    const amts = uniq.map((t) => -t.amount)
    const med = median(amts)
    const spread = Math.max(...amts.map((a) => Math.abs(a - med) / med))
    if (spread > 0.35) continue // too variable to be a bill
    const last = uniq[uniq.length - 1]
    const recentEnough = days(last.date, new Date().toISOString().slice(0, 10)) <= cad.days * 1.8 + cad.tol
    if (!recentEnough) continue
    bills.push({
      key, name: prettify(last.description), category: last.category, cadence: cad.name, amount: -last.amount,
      monthly: med * cad.perMonth, last: last.date, next: addDays(last.date, cad.days), count: uniq.length, variable: spread > 0.05,
    })
  }
  return bills.sort((a, b) => a.next.localeCompare(b.next))
}

function prettify(desc: string) {
  const s = desc.replace(/\s{2,}.*/, '').replace(/\b\d{4,}\b/g, '').replace(/\*.*$/, '').trim()
  return s.length > 28 ? s.slice(0, 28) + '…' : s || desc
}

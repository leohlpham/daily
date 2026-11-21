import { parseCsv, parseDate, parseAmount } from './csv'
import { categorise } from './categories'
import type { CategoryRule, Txn } from './types'
import { uid } from './store'

export interface Mapping { header: boolean; date: number; desc: number; amount: number; debit: number; credit: number; upCategory: number; type: number; bank: string }

const find = (h: string[], ...names: string[]) => {
  for (const n of names) { const i = h.findIndex((c) => c.toLowerCase() === n); if (i >= 0) return i }
  for (const n of names) { const i = h.findIndex((c) => c.toLowerCase().includes(n)); if (i >= 0) return i }
  return -1
}

export function detectMapping(rows: string[][]): Mapping {
  const first = rows[0] ?? []
  const headerless = first.length > 0 && parseDate(first[0]) !== null
  if (headerless) {
    // CBA / ANZ style: date, amount, description[, balance]
    return { header: false, date: 0, amount: 1, desc: 2, debit: -1, credit: -1, upCategory: -1, type: -1, bank: 'CBA / ANZ style' }
  }
  const h = first.map((c) => c.toLowerCase())
  const isUp = h.some((c) => c.includes('subtotal (aud)')) || (h.includes('time') && h.some((c) => c.includes('payee')))
  if (isUp) {
    return {
      header: true, bank: 'Up Bank',
      date: find(h, 'time', 'settled date'),
      desc: find(h, 'description', 'payee'),
      amount: find(h, 'subtotal (aud)', 'total (aud)'),
      debit: -1, credit: -1,
      upCategory: find(h, 'category'),
      type: find(h, 'transaction type'),
    }
  }
  return {
    header: true, bank: 'Generic',
    date: find(h, 'date', 'transaction date', 'effective date', 'posted date', 'time'),
    desc: find(h, 'description', 'narrative', 'transaction details', 'details', 'merchant name', 'payee', 'memo'),
    amount: find(h, 'amount', 'value', 'total'),
    debit: find(h, 'debit amount', 'debit', 'withdrawal'),
    credit: find(h, 'credit amount', 'credit', 'deposit'),
    upCategory: -1, type: -1,
  }
}

// Up's own categories → ours
const UP_MAP: [string, string][] = [
  ['groceries', 'Groceries'], ['takeaway', 'Takeaway'], ['restaurants', 'Eating out'], ['pubs', 'Eating out'], ['booze', 'Eating out'],
  ['public transport', 'Transport'], ['taxis', 'Transport'], ['toll', 'Transport'], ['parking', 'Transport'], ['cycling', 'Transport'], ['car', 'Transport'], ['fuel', 'Fuel'],
  ['rent', 'Rent & bills'], ['utilities', 'Rent & bills'], ['internet', 'Rent & bills'], ['mobile', 'Rent & bills'], ['insurance', 'Rent & bills'], ['life admin', 'Rent & bills'],
  ['tv', 'Subscriptions'], ['news', 'Subscriptions'], ['games', 'Entertainment'], ['events', 'Entertainment'], ['hobbies', 'Entertainment'],
  ['lottery', 'Betting'], ['gambling', 'Betting'], ['fitness', 'Health & fitness'], ['health', 'Health & fitness'], ['hair', 'Shopping'],
  ['clothing', 'Shopping'], ['technology', 'Shopping'], ['homeware', 'Shopping'], ['home maintenance', 'Shopping'], ['gifts', 'Shopping'], ['pets', 'Shopping'],
  ['holidays', 'Travel'], ['travel', 'Travel'], ['investments', 'Transfers'],
]

export function rowsToTxns(rows: string[][], m: Mapping, rules: CategoryRule[]): { txns: Txn[]; skipped: number } {
  const body = m.header ? rows.slice(1) : rows
  const txns: Txn[] = []
  let skipped = 0
  for (const r of body) {
    const date = m.date >= 0 ? parseDate(r[m.date] ?? '') : null
    let amount: number | null = null
    if (m.amount >= 0) amount = parseAmount(r[m.amount] ?? '')
    if (amount === null && (m.debit >= 0 || m.credit >= 0)) {
      const d = m.debit >= 0 ? parseAmount(r[m.debit] ?? '') : null
      const c = m.credit >= 0 ? parseAmount(r[m.credit] ?? '') : null
      if (d !== null || c !== null) amount = (c ?? 0) - Math.abs(d ?? 0)
    }
    const description = (m.desc >= 0 ? r[m.desc] : '') || (m.type >= 0 ? r[m.type] : '') || '(no description)'
    if (!date || amount === null || amount === 0) { skipped++; continue }

    let category = ''
    const type = m.type >= 0 ? (r[m.type] ?? '').toLowerCase() : ''
    const userHit = rules.find((x) => x.match && description.toLowerCase().includes(x.match.toLowerCase()))
    if (userHit) category = userHit.category
    else if (/transfer|round up|quick save|cover|internal/.test(type)) category = 'Transfers'
    else if (/salary|direct credit|interest/.test(type) && amount > 0) category = 'Income'
    else if (m.upCategory >= 0 && r[m.upCategory]) {
      const uc = r[m.upCategory].toLowerCase()
      category = UP_MAP.find(([k]) => uc.includes(k))?.[1] ?? ''
    }
    if (!category) category = categorise(description, amount, rules)
    txns.push({ id: uid(), date, description, amount, category })
  }
  return { txns, skipped }
}

export const txnKey = (t: Pick<Txn, 'date' | 'amount' | 'description'>) => `${t.date}|${t.amount.toFixed(2)}|${t.description.toLowerCase()}`

export { parseCsv }

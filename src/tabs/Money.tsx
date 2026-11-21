import { useMemo, useRef, useState } from 'react'
import { usePersisted, money, uid, download } from '../lib/store'
import { parseCsv, detectMapping, rowsToTxns, txnKey, type Mapping } from '../lib/bank'
import { CATEGORIES } from '../lib/categories'
import type { CategoryRule, Txn } from '../lib/types'
import { detectBills } from '../lib/bills'

const monthOf = (d: string) => d.slice(0, 7)
const monthLabel = (m: string) => new Date(m + '-01T12:00:00').toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })

export default function Money() {
  const [txns, setTxns] = usePersisted<Txn[]>('transactions', [])
  const [rules, setRules] = usePersisted<CategoryRule[]>('categoryRules', [])
  const [budgets, setBudgets] = usePersisted<Record<string, number>>('budgets', {})
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ rows: string[][]; mapping: Mapping; name: string } | null>(null)
  const [msg, setMsg] = useState('')
  const [filter, setFilter] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [editing, setEditing] = useState<Txn | null>(null)
  const [showBudgets, setShowBudgets] = useState(false)
  const [dismissed, setDismissed] = usePersisted<string[]>('dismissedBills', [])
  const bills = useMemo(() => detectBills(txns, dismissed), [txns, dismissed])
  const billMonthly = bills.reduce((s, b) => s + b.monthly, 0)
  const todayS = new Date().toISOString().slice(0, 10)

  const months = useMemo(() => [...new Set(txns.map((t) => monthOf(t.date)))].sort().reverse(), [txns])
  const [month, setMonth] = useState('')
  const cur = month || months[0] || ''
  const monthTx = useMemo(() => txns.filter((t) => monthOf(t.date) === cur).sort((a, b) => b.date.localeCompare(a.date)), [txns, cur])
  const spendTx = monthTx.filter((t) => t.category !== 'Transfers')
  const income = spendTx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const spend = -spendTx.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0)
  const byCat = useMemo(() => {
    const m: Record<string, number> = {}
    for (const t of spendTx) if (t.amount < 0) m[t.category] = (m[t.category] ?? 0) - t.amount
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [spendTx])
  const maxCat = Math.max(1, ...byCat.map(([, v]) => v), ...Object.values(budgets))
  const shown = monthTx.filter((t) => (!catFilter || t.category === catFilter) && (!filter || t.description.toLowerCase().includes(filter.toLowerCase())))

  async function onFile(f: File) {
    const rows = parseCsv(await f.text())
    if (!rows.length) { setMsg('That file looks empty.'); return }
    setPending({ rows, mapping: detectMapping(rows), name: f.name })
  }

  function doImport() {
    if (!pending) return
    const { txns: incoming, skipped } = rowsToTxns(pending.rows, pending.mapping, rules)
    const seen = new Set(txns.map(txnKey))
    const fresh = incoming.filter((t) => { const k = txnKey(t); if (seen.has(k)) return false; seen.add(k); return true })
    setTxns([...txns, ...fresh])
    setMsg(`Imported ${fresh.length} new transactions` + (incoming.length - fresh.length ? `, ${incoming.length - fresh.length} duplicates skipped` : '') + (skipped ? `, ${skipped} rows unreadable` : '') + '.')
    setPending(null)
    if (fresh.length) setMonth(monthOf(fresh.map((t) => t.date).sort().reverse()[0]))
  }

  function saveEdit(t: Txn, alwaysMatch: string) {
    let next = txns.map((x) => (x.id === t.id ? t : x))
    if (alwaysMatch.trim()) {
      const rule = { id: uid(), match: alwaysMatch.trim(), category: t.category }
      setRules([rule, ...rules.filter((r) => r.match.toLowerCase() !== rule.match.toLowerCase())])
      next = next.map((x) => (x.description.toLowerCase().includes(rule.match.toLowerCase()) ? { ...x, category: rule.category } : x))
    }
    setTxns(next)
    setEditing(null)
  }

  const header = pending ? (pending.mapping.header ? pending.rows[0] : pending.rows[0].map((_, i) => `Column ${i + 1}`)) : []
  const colSel = (key: keyof Mapping, label: string) => pending && (
    <label className="field"><span>{label}</span>
      <select value={pending.mapping[key] as number} onChange={(e) => setPending({ ...pending, mapping: { ...pending.mapping, [key]: Number(e.target.value) } })}>
        <option value={-1}>—</option>
        {header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
      </select>
    </label>
  )

  return (
    <div className="page">
      <div className="row between"><h1>Money</h1>
        <button className="btn primary" onClick={() => fileRef.current?.click()}>Import CSV</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      </div>
      {msg && <div className="notice" onClick={() => setMsg('')}>{msg}</div>}

      {pending && (
        <div className="card">
          <h3>Import {pending.name}</h3>
          <p className="muted small">Format: <b>{pending.mapping.bank}</b></p>
          <div className="grid2">
            {colSel('date', 'Date')}{colSel('desc', 'Description')}{colSel('amount', 'Amount')}
            {colSel('debit', 'Debit (if separate)')}{colSel('credit', 'Credit (if separate)')}{colSel('upCategory', 'Bank category')}
          </div>
          <div className="preview">
            {rowsToTxns(pending.rows.slice(0, pending.mapping.header ? 6 : 5), pending.mapping, rules).txns.map((t) => (
              <div key={t.id} className="txn"><span>{t.date}</span><span className="grow ellipsis">{t.description}</span><span className="chip">{t.category}</span><span className={t.amount < 0 ? 'neg' : 'pos'}>{money(t.amount)}</span></div>
            ))}
          </div>
          <div className="row gap"><button className="btn primary" onClick={doImport}>Import</button><button className="btn" onClick={() => setPending(null)}>Cancel</button></div>
        </div>
      )}

      {!txns.length && !pending && (
        <div className="card empty">
          <h3>Import your Up Bank transactions</h3>
          <ol className="muted">
            <li>Open the Up app → tap your account (Spending)</li>
            <li>Tap the ⋯ / statement option → <b>Export transactions</b> → CSV, pick a date range</li>
            <li>Save to Files, then tap <b>Import CSV</b> here</li>
          </ol>
        </div>
      )}

      {!!txns.length && (
        <>
          <select className="month" value={cur} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <div className="stats3">
            <div className="stat"><span>In</span><b className="pos">{money(income)}</b></div>
            <div className="stat"><span>Out</span><b className="neg">{money(spend)}</b></div>
            <div className="stat"><span>Net</span><b className={income - spend >= 0 ? 'pos' : 'neg'}>{money(income - spend)}</b></div>
          </div>

          <div className="card">
            <div className="row between"><h3>Spending by category</h3><button className="link" onClick={() => setShowBudgets(!showBudgets)}>{showBudgets ? 'Done' : 'Budgets'}</button></div>
            {showBudgets ? CATEGORIES.filter((c) => c !== 'Income' && c !== 'Transfers').map((c) => (
              <label key={c} className="row between budget"><span>{c}</span>
                <input inputMode="decimal" placeholder="no budget" value={budgets[c] ?? ''} onChange={(e) => { const v = parseFloat(e.target.value); const b = { ...budgets }; if (isNaN(v)) delete b[c]; else b[c] = v; setBudgets(b) }} />
              </label>
            )) : byCat.map(([c, v]) => {
              const b = budgets[c]
              return (
                <button key={c} className={'bar-row' + (catFilter === c ? ' active' : '')} onClick={() => setCatFilter(catFilter === c ? '' : c)}>
                  <div className="row between"><span>{c}</span><span>{money(v)}{b ? <span className="muted"> / {money(b)}</span> : null}</span></div>
                  <div className="bar"><div className={'fill' + (b && v > b ? ' over' : '')} style={{ width: `${(v / maxCat) * 100}%` }} />{b ? <div className="budget-mark" style={{ left: `${(b / maxCat) * 100}%` }} /> : null}</div>
                </button>
              )
            })}
          </div>

          {bills.length > 0 && (
            <div className="card">
              <div className="row between"><h3>Bills &amp; subscriptions</h3><span className="small"><b>{money(billMonthly)}</b><span className="muted"> / month</span></span></div>
              {bills.map((b) => {
                const due = Math.round((new Date(b.next + 'T12:00:00').getTime() - new Date(todayS + 'T12:00:00').getTime()) / 864e5)
                return (
                  <div key={b.key} className="bill">
                    <div className="grow">
                      <div className="row gap"><b className="small ellipsis">{b.name}</b><span className="chip">{b.cadence}</span></div>
                      <div className="muted tiny">{b.variable ? '≈ ' : ''}{money(b.amount)} · last {b.last.slice(8)}/{b.last.slice(5, 7)} · seen {b.count}×</div>
                    </div>
                    <div className="right">
                      <span className={'due ' + (due < 0 ? 'late' : due <= 7 ? 'soon' : '')}>{due < 0 ? `${-due}d overdue?` : due === 0 ? 'Due today' : `in ${due}d`}</span>
                      <button className="x" title="Not a bill" onClick={() => setDismissed([...dismissed, b.key])}>✕</button>
                    </div>
                  </div>
                )
              })}
              {dismissed.length > 0 && <button className="link tiny" onClick={() => setDismissed([])}>Restore {dismissed.length} Hidden</button>}
            </div>
          )}

          <div className="card">
            <div className="row between"><h3>Transactions{catFilter && ` · ${catFilter}`}</h3>{catFilter && <button className="link" onClick={() => setCatFilter('')}>Show all</button>}</div>
            <input className="search" placeholder="Search" value={filter} onChange={(e) => setFilter(e.target.value)} />
            {shown.map((t) => (
              <button key={t.id} className="txn" onClick={() => setEditing(t)}>
                <span className="muted small">{t.date.slice(8)}/{t.date.slice(5, 7)}</span>
                <span className="grow ellipsis">{t.description}</span>
                <span className="chip">{t.category}</span>
                <span className={t.amount < 0 ? 'neg' : 'pos'}>{money(t.amount)}</span>
              </button>
            ))}
            {!shown.length && <p className="muted">No transactions.</p>}
          </div>
          <div className="row gap">
            <button className="btn" onClick={() => download(`spending-${cur}.csv`, 'Date,Description,Category,Amount\n' + monthTx.map((t) => `${t.date},"${t.description.replace(/"/g, '""')}",${t.category},${t.amount}`).join('\n'), 'text/csv')}>Export month</button>
            <button className="btn danger" onClick={() => { if (confirm(`Delete all ${monthTx.length} transactions in ${monthLabel(cur)}?`)) setTxns(txns.filter((t) => monthOf(t.date) !== cur)) }}>Clear month</button>
          </div>
        </>
      )}

      {editing && <EditTxn txn={editing} onSave={saveEdit} onClose={() => setEditing(null)} />}
    </div>
  )
}

function EditTxn({ txn, onSave, onClose }: { txn: Txn; onSave: (t: Txn, always: string) => void; onClose: () => void }) {
  const [cat, setCat] = useState(txn.category)
  const [always, setAlways] = useState(false)
  const [match, setMatch] = useState(txn.description.split(/\s{2,}| - |\*/)[0].slice(0, 30))
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3 className="ellipsis">{txn.description}</h3>
        <p className="muted">{txn.date} · {money(txn.amount)}</p>
        <div className="chips">{CATEGORIES.map((c) => <button key={c} className={'chip big' + (c === cat ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>)}</div>
        <label className="row gap check"><input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} /> Always use this category when description contains</label>
        {always && <input value={match} onChange={(e) => setMatch(e.target.value)} />}
        <div className="row gap"><button className="btn primary" onClick={() => onSave({ ...txn, category: cat }, always ? match : '')}>Save</button><button className="btn" onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  )
}

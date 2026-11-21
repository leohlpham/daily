import { useMemo, useState } from 'react'
import { usePersisted, money, uid, ymd, download } from '../lib/store'
import { actualProfit, clv, devig, evPct, expectedProfit, summarise } from '../lib/betting'
import type { Bet, Bookmaker, BetResult } from '../lib/types'

export const DEFAULT_BOOKIES: Bookmaker[] = [
  { id: 'sportsbet', name: 'Sportsbet', url: 'https://www.sportsbet.com.au', status: 'active' },
  { id: 'bet365', name: 'bet365', url: 'https://www.bet365.com.au', status: 'active' },
  { id: 'tab', name: 'TAB', url: 'https://www.tab.com.au', status: 'active' },
  { id: 'ladbrokes', name: 'Ladbrokes', url: 'https://www.ladbrokes.com.au', status: 'active' },
  { id: 'dabble', name: 'Dabble', url: 'https://dabble.com.au', status: 'active' },
  { id: 'ponybet', name: 'PonyBet', url: 'https://www.ponybet.com.au', status: 'active' },
]

const pct = (n: number | null) => (n === null ? '—' : (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%')
const sub = ['Overview', 'Bets', 'Bookies', 'Devig'] as const

export default function Betting() {
  const [bets, setBets] = usePersisted<Bet[]>('bets', [])
  const [bookies, setBookies] = usePersisted<Bookmaker[]>('bookmakers', DEFAULT_BOOKIES)
  const [view, setView] = useState<(typeof sub)[number]>('Overview')
  const [editing, setEditing] = useState<Bet | null>(null)
  const [period, setPeriod] = useState<'all' | '30' | '7'>('30')

  const inPeriod = useMemo(() => {
    if (period === 'all') return bets
    const cut = ymd(new Date(Date.now() - Number(period) * 864e5))
    return bets.filter((b) => b.date >= cut)
  }, [bets, period])
  const s = summarise(inPeriod)
  const perBookie = bookies.map((bk) => ({ bk, s: summarise(inPeriod.filter((b) => b.bookmaker === bk.name)) }))

  const newBet = (): Bet => ({ id: uid(), date: ymd(new Date()), bookmaker: bookies[0]?.name ?? '', event: '', selection: '', type: 'cash', stake: 0, odds: 0, result: 'pending' })
  const saveBet = (b: Bet) => { setBets(bets.some((x) => x.id === b.id) ? bets.map((x) => (x.id === b.id ? b : x)) : [b, ...bets]); setEditing(null) }

  return (
    <div className="page">
      <div className="row between"><h1>Betting</h1><button className="btn primary" onClick={() => setEditing(newBet())}>+ Bet</button></div>
      <div className="seg">{sub.map((v) => <button key={v} className={v === view ? 'on' : ''} onClick={() => setView(v)}>{v}</button>)}</div>

      {view === 'Overview' && (
        <>
          <div className="seg small">{(['7', '30', 'all'] as const).map((p) => <button key={p} className={p === period ? 'on' : ''} onClick={() => setPeriod(p)}>{p === 'all' ? 'All time' : `${p} days`}</button>)}</div>
          <div className="stats3">
            <div className="stat"><span>Profit</span><b className={s.profit >= 0 ? 'pos' : 'neg'}>{money(s.profit)}</b></div>
            <div className="stat"><span>Expected</span><b>{money(s.ev)}</b></div>
            <div className="stat"><span>Avg CLV</span><b className={(s.avgClv ?? 0) >= 0 ? 'pos' : 'neg'}>{pct(s.avgClv)}</b></div>
          </div>
          <div className="stats3">
            <div className="stat"><span>Cash ROI</span><b>{pct(s.roi)}</b></div>
            <div className="stat"><span>Bonus conv.</span><b>{s.bonusConversion === null ? '—' : (s.bonusConversion * 100).toFixed(0) + '%'}</b></div>
            <div className="stat"><span>Pending</span><b>{money(s.pendingStake)}</b></div>
          </div>
          <p className="muted small">Profit vs expected shows whether you're running hot or cold. CLV is your edge signal: consistently beating the closing line means your bets are genuinely +EV.</p>
          <div className="card">
            <h3>Quick open</h3>
            <div className="bookie-grid">{bookies.map((b) => <a key={b.id} className={'bookie ' + (b.status ?? '')} href={b.url} target="_blank" rel="noreferrer">{b.name}{b.balance !== undefined && <small>{money(b.balance)}</small>}</a>)}</div>
          </div>
          <div className="card">
            <h3>By bookmaker</h3>
            {perBookie.filter((x) => x.s.count).map(({ bk, s }) => (
              <div key={bk.id} className="row between line"><span>{bk.name} <span className="muted small">{s.count} bets</span></span><span><b className={s.profit >= 0 ? 'pos' : 'neg'}>{money(s.profit)}</b> <span className="muted small">EV {money(s.ev)}</span></span></div>
            ))}
            {!perBookie.some((x) => x.s.count) && <p className="muted">No bets logged in this period yet.</p>}
          </div>
        </>
      )}

      {view === 'Bets' && (
        <div className="card">
          {bets.map((b) => {
            const p = actualProfit(b), e = evPct(b), c = clv(b)
            return (
              <button key={b.id} className="bet" onClick={() => setEditing(b)}>
                <div className="row between"><b className="ellipsis">{b.selection || b.event || 'Bet'}</b><span className={'result ' + b.result}>{b.result}</span></div>
                <div className="row between muted small"><span>{b.date} · {b.bookmaker}{b.type === 'bonus' ? ' · bonus' : ''}</span><span>{money(b.stake)} @ {b.odds.toFixed(2)}</span></div>
                <div className="row between small"><span>EV {pct(e)} · CLV {pct(c)}</span>{p !== null && <b className={p >= 0 ? 'pos' : 'neg'}>{money(p)}</b>}</div>
              </button>
            )
          })}
          {!bets.length && <p className="muted">Tap “+ Bet” to log your first bet. Add the fair (no-vig) odds to track EV, and the closing odds later to track CLV.</p>}
          {!!bets.length && <button className="btn" onClick={() => download('bets.csv', 'Date,Bookmaker,Event,Selection,Type,Stake,Odds,FairOdds,ClosingOdds,Result,Profit,EV\n' + bets.map((b) => [b.date, b.bookmaker, `"${b.event}"`, `"${b.selection}"`, b.type, b.stake, b.odds, b.fairOdds ?? '', b.closingOdds ?? '', b.result, actualProfit(b) ?? '', expectedProfit(b)?.toFixed(2) ?? ''].join(',')).join('\n'), 'text/csv')}>Export CSV</button>}
        </div>
      )}

      {view === 'Bookies' && <Bookies bookies={bookies} setBookies={setBookies} />}
      {view === 'Devig' && <Devig />}

      {editing && <BetForm bet={editing} bookies={bookies} onSave={saveBet} onDelete={() => { setBets(bets.filter((b) => b.id !== editing.id)); setEditing(null) }} onClose={() => setEditing(null)} />}
    </div>
  )
}

const num = (v: string) => { const n = parseFloat(v); return isNaN(n) ? undefined : n }

function BetForm({ bet, bookies, onSave, onDelete, onClose }: { bet: Bet; bookies: Bookmaker[]; onSave: (b: Bet) => void; onDelete: () => void; onClose: () => void }) {
  const [b, setB] = useState(bet)
  const [txt, setTxt] = useState({ stake: bet.stake ? String(bet.stake) : '', odds: bet.odds ? String(bet.odds) : '', fair: bet.fairOdds ? String(bet.fairOdds) : '', close: bet.closingOdds ? String(bet.closingOdds) : '', ret: bet.returned !== undefined ? String(bet.returned) : '' })
  const full: Bet = { ...b, stake: num(txt.stake) ?? 0, odds: num(txt.odds) ?? 0, fairOdds: num(txt.fair), closingOdds: num(txt.close), returned: num(txt.ret) }
  const e = expectedProfit(full)
  const valid = full.stake > 0 && full.odds > 1 && b.bookmaker
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(ev) => ev.stopPropagation()}>
        <h3>{bet.stake ? 'Edit bet' : 'New bet'}</h3>
        <div className="grid2">
          <label className="field"><span>Date</span><input type="date" value={b.date} onChange={(ev) => setB({ ...b, date: ev.target.value })} /></label>
          <label className="field"><span>Bookmaker</span><select value={b.bookmaker} onChange={(ev) => setB({ ...b, bookmaker: ev.target.value })}>{bookies.map((k) => <option key={k.id}>{k.name}</option>)}</select></label>
        </div>
        <label className="field"><span>Event</span><input value={b.event} placeholder="e.g. Collingwood v Carlton" onChange={(ev) => setB({ ...b, event: ev.target.value })} /></label>
        <label className="field"><span>Selection</span><input value={b.selection} placeholder="e.g. Carlton +12.5" onChange={(ev) => setB({ ...b, selection: ev.target.value })} /></label>
        <div className="seg small">{(['cash', 'bonus'] as const).map((t) => <button key={t} className={b.type === t ? 'on' : ''} onClick={() => setB({ ...b, type: t })}>{t === 'cash' ? 'Cash bet' : 'Bonus bet (SNR)'}</button>)}</div>
        <div className="grid2">
          <label className="field"><span>Stake</span><input inputMode="decimal" value={txt.stake} onChange={(ev) => setTxt({ ...txt, stake: ev.target.value })} /></label>
          <label className="field"><span>Odds taken</span><input inputMode="decimal" value={txt.odds} onChange={(ev) => setTxt({ ...txt, odds: ev.target.value })} /></label>
          <label className="field"><span>Fair odds (no-vig)</span><input inputMode="decimal" value={txt.fair} onChange={(ev) => setTxt({ ...txt, fair: ev.target.value })} /></label>
          <label className="field"><span>Closing odds</span><input inputMode="decimal" value={txt.close} onChange={(ev) => setTxt({ ...txt, close: ev.target.value })} /></label>
        </div>
        {e !== null && <p className={e >= 0 ? 'pos' : 'neg'}>Expected profit {money(e)} ({pct(evPct(full))})</p>}
        <div className="seg small">{(['pending', 'won', 'lost', 'void', 'cashout'] as BetResult[]).map((r) => <button key={r} className={b.result === r ? 'on' : ''} onClick={() => setB({ ...b, result: r })}>{r}</button>)}</div>
        {(b.result === 'cashout' || b.result === 'won') && <label className="field"><span>Amount returned {b.result === 'won' && '(optional, for partial wins / dead heats)'}</span><input inputMode="decimal" value={txt.ret} onChange={(ev) => setTxt({ ...txt, ret: ev.target.value })} /></label>}
        <div className="row gap">
          <button className="btn primary" disabled={!valid} onClick={() => onSave(full)}>Save</button>
          <button className="btn" onClick={onClose}>Cancel</button>
          {bet.stake > 0 && <button className="btn danger" onClick={() => confirm('Delete this bet?') && onDelete()}>Delete</button>}
        </div>
      </div>
    </div>
  )
}

function Bookies({ bookies, setBookies }: { bookies: Bookmaker[]; setBookies: (b: Bookmaker[]) => void }) {
  const upd = (id: string, patch: Partial<Bookmaker>) => setBookies(bookies.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  return (
    <div className="card">
      <p className="muted small">Each button opens the bookmaker's site in Safari, where you stay signed in. Save your passwords with iPhone Passwords (Face ID autofill) rather than in this app; bookmaker logins can't be safely stored or automated here.</p>
      {bookies.map((b) => (
        <div key={b.id} className="bookie-row">
          <div className="row between"><a href={b.url} target="_blank" rel="noreferrer"><b>{b.name}</b> ↗</a>
            <select value={b.status ?? 'active'} onChange={(e) => upd(b.id, { status: e.target.value as Bookmaker['status'] })}><option value="active">Active</option><option value="limited">Limited</option><option value="banned">Banned</option></select>
          </div>
          <div className="grid2">
            <label className="field"><span>Balance</span><input inputMode="decimal" value={b.balance ?? ''} onChange={(e) => upd(b.id, { balance: num(e.target.value) })} /></label>
            <label className="field"><span>Notes</span><input value={b.notes ?? ''} placeholder="promos, limits…" onChange={(e) => upd(b.id, { notes: e.target.value })} /></label>
          </div>
          <button className="link danger" onClick={() => confirm(`Remove ${b.name}?`) && setBookies(bookies.filter((x) => x.id !== b.id))}>Remove</button>
        </div>
      ))}
      <button className="btn" onClick={() => { const name = prompt('Bookmaker name'); if (!name) return; const url = prompt('Website', 'https://') || ''; setBookies([...bookies, { id: uid(), name, url, status: 'active' }]) }}>+ Add bookmaker</button>
      <p className="muted small">Total balance: {money(bookies.reduce((s, b) => s + (b.balance ?? 0), 0))}</p>
    </div>
  )
}

function Devig() {
  const [txt, setTxt] = useState('1.90, 1.95')
  const [mine, setMine] = useState('')
  const odds = txt.split(/[\s,]+/).map(Number).filter((n) => n > 1)
  const fair = devig(odds)
  const margin = odds.length > 1 ? odds.reduce((s, o) => s + 1 / o, 0) - 1 : 0
  const m = parseFloat(mine)
  return (
    <div className="card">
      <h3>No-vig fair odds</h3>
      <p className="muted small">Enter the sharp book's odds for every outcome in the market (e.g. Pinnacle or Betfair), separated by commas.</p>
      <input value={txt} onChange={(e) => setTxt(e.target.value)} inputMode="decimal" />
      {fair.length > 0 && (
        <>
          <p className="muted small">Market margin {(margin * 100).toFixed(2)}%</p>
          {fair.map((f, i) => <div key={i} className="row between line"><span>Outcome {i + 1} ({odds[i].toFixed(2)})</span><b>{f.toFixed(3)}</b><span className="muted small">{(100 / f).toFixed(1)}%</span></div>)}
          <label className="field"><span>Odds you can get for outcome 1</span><input inputMode="decimal" value={mine} onChange={(e) => setMine(e.target.value)} /></label>
          {m > 1 && <p className={m / fair[0] - 1 >= 0 ? 'pos' : 'neg'}>Cash EV {pct(m / fair[0] - 1)} · Bonus bet conversion {((m - 1) / fair[0] * 100).toFixed(1)}%</p>}
        </>
      )}
    </div>
  )
}

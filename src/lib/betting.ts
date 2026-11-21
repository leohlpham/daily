import type { Bet } from './types'

export function expectedProfit(b: Bet): number | null {
  if (!b.fairOdds || b.fairOdds <= 1) return null
  return b.type === 'bonus' ? b.stake * ((b.odds - 1) / b.fairOdds) : b.stake * (b.odds / b.fairOdds - 1)
}

export function actualProfit(b: Bet): number | null {
  const cashStake = b.type === 'cash' ? b.stake : 0
  switch (b.result) {
    case 'pending': return null
    case 'won': return b.returned !== undefined ? b.returned - cashStake : b.type === 'bonus' ? b.stake * (b.odds - 1) : b.stake * (b.odds - 1)
    case 'lost': return -cashStake
    case 'void': return 0
    case 'cashout': return (b.returned ?? 0) - cashStake
  }
}

export const clv = (b: Bet) => (b.closingOdds && b.closingOdds > 1 ? b.odds / b.closingOdds - 1 : null)
export const evPct = (b: Bet) => (b.fairOdds && b.fairOdds > 1 ? (b.type === 'bonus' ? (b.odds - 1) / b.fairOdds : b.odds / b.fairOdds - 1) : null)

/** Remove the bookmaker margin from a set of odds (multiplicative method). */
export function devig(odds: number[]): number[] {
  const valid = odds.filter((o) => o > 1)
  if (valid.length < 2) return []
  const book = valid.reduce((s, o) => s + 1 / o, 0)
  return valid.map((o) => o * book)
}

export function summarise(bets: Bet[]) {
  const settled = bets.filter((b) => b.result !== 'pending')
  let profit = 0, ev = 0, cashStaked = 0, bonusStaked = 0, bonusProfit = 0, clvSum = 0, clvN = 0
  for (const b of settled) {
    profit += actualProfit(b) ?? 0
    ev += expectedProfit(b) ?? 0
    if (b.type === 'cash') cashStaked += b.stake
    else { bonusStaked += b.stake; bonusProfit += actualProfit(b) ?? 0 }
  }
  for (const b of bets) { const c = clv(b); if (c !== null) { clvSum += c; clvN++ } }
  const pending = bets.filter((b) => b.result === 'pending')
  return {
    count: bets.length, settled: settled.length, profit, ev, cashStaked,
    roi: cashStaked ? (profit - bonusProfit) / cashStaked : 0,
    bonusConversion: bonusStaked ? bonusProfit / bonusStaked : null,
    avgClv: clvN ? clvSum / clvN : null,
    pendingStake: pending.filter((b) => b.type === 'cash').reduce((s, b) => s + b.stake, 0),
    pendingEv: pending.reduce((s, b) => s + (expectedProfit(b) ?? 0), 0),
  }
}

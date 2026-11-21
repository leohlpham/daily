export interface Txn { id: string; date: string; description: string; amount: number; category: string; account?: string }
export interface CategoryRule { id: string; match: string; category: string }

export type BetType = 'cash' | 'bonus'
export type BetResult = 'pending' | 'won' | 'lost' | 'void' | 'cashout'
export interface Bet {
  id: string; date: string; bookmaker: string; event: string; selection: string
  type: BetType; stake: number; odds: number; fairOdds?: number; closingOdds?: number
  result: BetResult; returned?: number; notes?: string
}
export interface Bookmaker { id: string; name: string; url: string; balance?: number; notes?: string; status?: 'active' | 'limited' | 'banned' }

export interface CalEvent { id: string; title: string; start: string; end: string; source: 'outlook' | 'google' | 'manual' | 'plan'; location?: string; allDay?: boolean; note?: string }
export interface PlanGoal { id: string; title: string; minutes: number; days: number[]; earliest: string; latest: string; color: string }
export interface PlanSettings { dayStart: string; dayEnd: string; buffer: number }

export interface Activity { id: string; date: string; type: string; title: string; distanceKm?: number; durationMin?: number; calories?: number; avgHr?: number }
export interface DailyLog { date: string; sleepHrs?: number; steps?: number; weightKg?: number; restingHr?: number; mood?: number; energy?: number; water?: number; notes?: string }

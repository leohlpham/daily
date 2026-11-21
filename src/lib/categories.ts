import type { CategoryRule } from './types'

export const CATEGORIES = ['Groceries', 'Eating out', 'Takeaway', 'Transport', 'Fuel', 'Rent & bills', 'Subscriptions', 'Shopping', 'Health & fitness', 'Entertainment', 'Travel', 'Betting', 'Income', 'Transfers', 'Other']

const DEFAULTS: [string, string][] = [
  ['woolworths', 'Groceries'], ['coles', 'Groceries'], ['aldi', 'Groceries'], ['iga ', 'Groceries'], ['harris farm', 'Groceries'],
  ['uber eats', 'Takeaway'], ['ubereats', 'Takeaway'], ['menulog', 'Takeaway'], ['doordash', 'Takeaway'], ['mcdonald', 'Takeaway'], ['kfc', 'Takeaway'], ['hungry jack', 'Takeaway'], ['grill', 'Eating out'],
  ['cafe', 'Eating out'], ['coffee', 'Eating out'], ['restaurant', 'Eating out'], ['bar ', 'Eating out'], ['pub', 'Eating out'],
  ['uber', 'Transport'], ['didi', 'Transport'], ['myki', 'Transport'], ['ptv', 'Transport'], ['opal', 'Transport'], ['linkt', 'Transport'], ['citylink', 'Transport'], ['parking', 'Transport'],
  ['shell', 'Fuel'], ['bp ', 'Fuel'], ['ampol', 'Fuel'], ['7-eleven', 'Fuel'], ['caltex', 'Fuel'], ['united petrol', 'Fuel'],
  ['rent', 'Rent & bills'], ['agl', 'Rent & bills'], ['origin', 'Rent & bills'], ['telstra', 'Rent & bills'], ['optus', 'Rent & bills'], ['vodafone', 'Rent & bills'], ['energy', 'Rent & bills'], ['water', 'Rent & bills'], ['insurance', 'Rent & bills'],
  ['netflix', 'Subscriptions'], ['spotify', 'Subscriptions'], ['apple.com', 'Subscriptions'], ['disney', 'Subscriptions'], ['stan.com', 'Subscriptions'], ['youtube', 'Subscriptions'], ['amazon prime', 'Subscriptions'], ['openai', 'Subscriptions'], ['anthropic', 'Subscriptions'], ['garmin', 'Subscriptions'],
  ['amazon', 'Shopping'], ['kmart', 'Shopping'], ['target', 'Shopping'], ['jb hi', 'Shopping'], ['bunnings', 'Shopping'], ['officeworks', 'Shopping'], ['big w', 'Shopping'],
  ['gym', 'Health & fitness'], ['chemist', 'Health & fitness'], ['pharmacy', 'Health & fitness'], ['physio', 'Health & fitness'], ['rebel', 'Health & fitness'],
  ['ticketek', 'Entertainment'], ['ticketmaster', 'Entertainment'], ['hoyts', 'Entertainment'], ['village cinema', 'Entertainment'], ['steam', 'Entertainment'],
  ['qantas', 'Travel'], ['virgin', 'Travel'], ['jetstar', 'Travel'], ['airbnb', 'Travel'], ['booking.com', 'Travel'],
  ['sportsbet', 'Betting'], ['ladbrokes', 'Betting'], ['neds', 'Betting'], ['bet365', 'Betting'], ['tabcorp', 'Betting'], ['tab ', 'Betting'], ['pointsbet', 'Betting'], ['betfair', 'Betting'], ['unibet', 'Betting'], ['palmerbet', 'Betting'], ['bluebet', 'Betting'], ['betr', 'Betting'], ['picklebet', 'Betting'], ['dabble', 'Betting'], ['topsport', 'Betting'], ['betdeluxe', 'Betting'], ['boombet', 'Betting'],
  ['salary', 'Income'], ['payroll', 'Income'], ['wage', 'Income'], ['pay ', 'Income'], ['interest', 'Income'],
  ['transfer', 'Transfers'], ['osko', 'Transfers'], ['payid', 'Transfers'], ['bpay', 'Rent & bills'],
]

export function categorise(description: string, amount: number, userRules: CategoryRule[]): string {
  const d = ' ' + description.toLowerCase() + ' '
  for (const r of userRules) if (r.match && d.includes(r.match.toLowerCase())) return r.category
  for (const [k, c] of DEFAULTS) {
    if (c === 'Income' && amount < 0) continue
    if (d.includes(k)) return c
  }
  return amount > 0 ? 'Income' : 'Other'
}

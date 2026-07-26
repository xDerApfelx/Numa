import { ACTION_FREQUENCIES } from './config'
import { shuffle, type Rng } from './rng'
import {
  COLORS,
  JOKER_KINDS,
  type AnyCard,
  type HandCard,
  type NumberAction,
  type RuleCard,
} from './types'

// Zieh-Deck: 108 Zahlenkarten (Aktionen pro Session zufällig nach
// ACTION_FREQUENCIES auf die Slots verteilt) + 12 zahlenlose + 18 farblose
// [+ 8 Joker], fertig gemischt.
export function buildDrawDeck(rng: Rng, jokersEnabled: boolean): AnyCard[] {
  const actionPool: NumberAction[] = []
  for (const [action, count] of Object.entries(ACTION_FREQUENCIES) as [NumberAction, number][]) {
    for (let i = 0; i < count; i++) actionPool.push(action)
  }
  const actions = shuffle(actionPool, rng)

  const deck: AnyCard[] = []
  let slot = 0
  for (const color of COLORS) {
    for (let value = 1; value <= 9; value++) {
      for (let copy = 0; copy < 3; copy++) {
        deck.push({
          id: `n-${color}-${value}-${copy}`,
          kind: 'number',
          color,
          value,
          action: actions[slot++],
        } satisfies HandCard)
      }
    }
  }

  for (const color of COLORS) {
    for (let copy = 0; copy < 3; copy++) {
      deck.push({ id: `q-${color}-${copy}`, kind: 'numberless', color, value: null, action: 'copyValue' })
    }
  }

  for (let value = 1; value <= 9; value++) {
    for (let copy = 0; copy < 2; copy++) {
      deck.push({ id: `c-${value}-${copy}`, kind: 'colorless', color: null, value, action: 'copyColor' })
    }
  }

  if (jokersEnabled) {
    for (const joker of JOKER_KINDS) {
      for (let copy = 0; copy < 2; copy++) {
        deck.push({ id: `j-${joker}-${copy}`, kind: 'joker', joker })
      }
    }
  }

  return shuffle(deck, rng)
}

// Die 7 offiziellen Bedingungen je Farbe (aus Alle_Regelkarten.pdf).
const RULE_CONDITIONS: { parity: RuleCard['parity']; range: RuleCard['range'] }[] = [
  { parity: null, range: 'low' },
  { parity: null, range: 'high' },
  { parity: 'even', range: 'high' },
  { parity: 'odd', range: 'high' },
  { parity: 'even', range: 'low' },
  { parity: 'odd', range: 'low' },
  { parity: null, range: 'mid' },
]

export function buildRuleDeck(rng: Rng): RuleCard[] {
  const deck: RuleCard[] = []
  for (const color of COLORS) {
    RULE_CONDITIONS.forEach((cond, i) => {
      deck.push({ id: `r-${color}-${i}`, color, parity: cond.parity, range: cond.range, black: false })
    })
  }
  deck.push({ id: 'r-black-0', color: null, parity: null, range: null, black: true })
  deck.push({ id: 'r-black-1', color: null, parity: null, range: null, black: true })
  return shuffle(deck, rng)
}

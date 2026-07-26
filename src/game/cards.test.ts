import { describe, expect, it } from 'vitest'
import { buildDrawDeck, buildRuleDeck } from './cards'
import { mulberry32 } from './rng'
import { ACTION_FREQUENCIES } from './config'
import { COLORS, isJoker, type HandCard, type JokerCard } from './types'

function handCards(deck: ReturnType<typeof buildDrawDeck>): HandCard[] {
  return deck.filter((c): c is HandCard => !isJoker(c))
}

describe('buildDrawDeck', () => {
  it('hat 138 Karten ohne Joker und 146 mit Jokern', () => {
    expect(buildDrawDeck(mulberry32(1), false)).toHaveLength(138)
    expect(buildDrawDeck(mulberry32(1), true)).toHaveLength(146)
  })

  it('enthält je Farbe×Zahl genau 3 Zahlenkarten', () => {
    const numbers = handCards(buildDrawDeck(mulberry32(2), false)).filter((c) => c.kind === 'number')
    expect(numbers).toHaveLength(108)
    for (const color of COLORS) {
      for (let v = 1; v <= 9; v++) {
        expect(numbers.filter((c) => c.color === color && c.value === v)).toHaveLength(3)
      }
    }
  })

  it('verteilt Aktionen exakt nach ACTION_FREQUENCIES', () => {
    const numbers = handCards(buildDrawDeck(mulberry32(3), false)).filter((c) => c.kind === 'number')
    for (const [action, count] of Object.entries(ACTION_FREQUENCIES)) {
      expect(numbers.filter((c) => c.action === action)).toHaveLength(count)
    }
  })

  it('enthält 18 farblose Karten: copyColor, Werte 1-9 je 2x, ohne Farbe', () => {
    const colorless = handCards(buildDrawDeck(mulberry32(4), false)).filter((c) => c.kind === 'colorless')
    expect(colorless).toHaveLength(18)
    for (const c of colorless) {
      expect(c.color).toBeNull()
      expect(c.action).toBe('copyColor')
    }
    for (let v = 1; v <= 9; v++) {
      expect(colorless.filter((c) => c.value === v)).toHaveLength(2)
    }
  })

  it('enthält 12 zahlenlose Karten: copyValue, 3 je Farbe, ohne Wert', () => {
    const numberless = handCards(buildDrawDeck(mulberry32(5), false)).filter((c) => c.kind === 'numberless')
    expect(numberless).toHaveLength(12)
    for (const c of numberless) {
      expect(c.value).toBeNull()
      expect(c.action).toBe('copyValue')
    }
    for (const color of COLORS) {
      expect(numberless.filter((c) => c.color === color)).toHaveLength(3)
    }
  })

  it('enthält mit Jokern 2 je Joker-Typ', () => {
    const jokers = buildDrawDeck(mulberry32(6), true).filter((c): c is JokerCard => isJoker(c))
    expect(jokers).toHaveLength(8)
    for (const kind of ['shiftAll', 'newRule', 'secondWins', 'onlyOwnAction']) {
      expect(jokers.filter((j) => j.joker === kind)).toHaveLength(2)
    }
  })

  it('hat eindeutige IDs', () => {
    const deck = buildDrawDeck(mulberry32(7), true)
    expect(new Set(deck.map((c) => c.id)).size).toBe(deck.length)
  })

  it('ist deterministisch je Seed, verschieden je Seed (auch die Aktionsverteilung)', () => {
    const a = buildDrawDeck(mulberry32(8), true)
    const b = buildDrawDeck(mulberry32(8), true)
    expect(a).toEqual(b)
    const c = buildDrawDeck(mulberry32(9), true)
    expect(a).not.toEqual(c)
    // Aktionszuordnung je (Farbe, Wert, Kopie) unterscheidet sich zwischen Seeds
    const key = (h: HandCard) => `${h.color}-${h.value}`
    const actionsBySlot = (deck: typeof a) =>
      handCards(deck)
        .filter((h) => h.kind === 'number')
        .sort((x, y) => (key(x) + x.action).localeCompare(key(y) + y.action))
        .map((h) => key(h) + ':' + h.action)
        .join(',')
    expect(actionsBySlot(a)).not.toEqual(actionsBySlot(c))
  })
})

describe('buildRuleDeck', () => {
  it('hat 30 Karten: 7 je Farbe + 2 schwarze', () => {
    const deck = buildRuleDeck(mulberry32(1))
    expect(deck).toHaveLength(30)
    for (const color of COLORS) {
      expect(deck.filter((r) => r.color === color && !r.black)).toHaveLength(7)
    }
    expect(deck.filter((r) => r.black)).toHaveLength(2)
  })

  it('hat je Farbe die 7 offiziellen Bedingungen', () => {
    const deck = buildRuleDeck(mulberry32(2))
    const expected = [
      { parity: null, range: 'low' },
      { parity: null, range: 'high' },
      { parity: 'even', range: 'high' },
      { parity: 'odd', range: 'high' },
      { parity: 'even', range: 'low' },
      { parity: 'odd', range: 'low' },
      { parity: null, range: 'mid' },
    ]
    for (const color of COLORS) {
      const conds = deck
        .filter((r) => r.color === color)
        .map((r) => ({ parity: r.parity, range: r.range }))
      for (const e of expected) {
        expect(conds).toContainEqual(e)
      }
    }
  })

  it('schwarze Karten haben keine Bedingung, eindeutige IDs, deterministisch je Seed', () => {
    const deck = buildRuleDeck(mulberry32(3))
    for (const black of deck.filter((r) => r.black)) {
      expect(black.color).toBeNull()
      expect(black.parity).toBeNull()
      expect(black.range).toBeNull()
    }
    expect(new Set(deck.map((r) => r.id)).size).toBe(30)
    expect(buildRuleDeck(mulberry32(3))).toEqual(deck)
  })
})

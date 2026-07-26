import { describe, expect, it } from 'vitest'
import { determineWinner, type FinalCard } from './winner'
import type { RuleCard } from './types'

function rule(over: Partial<RuleCard>): RuleCard {
  return { id: 'r-test', color: 'yellow', parity: null, range: 'high', black: false, ...over }
}

function card(playerId: string, color: FinalCard['color'], value: number | null): FinalCard {
  return { playerId, color, value }
}

describe('determineWinner', () => {
  it('Anleitungs-Beispiel: gelb "Gerade Hohe" — gelb5 schlägt gelb3, grün8 und rot3 sind raus', () => {
    const r = rule({ color: 'yellow', parity: 'even', range: 'high' })
    const res = determineWinner(
      [card('a', 'yellow', 5), card('b', 'green', 8), card('c', 'yellow', 3), card('d', 'red', 3)],
      r,
      false,
    )
    expect(res.winnerId).toBe('a')
    expect(res.tie).toBe(false)
  })

  it('Farbbedingung entfällt ersatzlos, wenn niemand die Farbe bedient', () => {
    const r = rule({ color: 'yellow', parity: null, range: 'high' })
    const res = determineWinner([card('a', 'red', 9), card('b', 'green', 4)], r, false)
    expect(res.winnerId).toBe('a')
  })

  it('Parität greift, wenn mindestens eine zulässige Karte sie erfüllt', () => {
    const r = rule({ color: 'blue', parity: 'even', range: 'high' })
    const res = determineWinner([card('a', 'blue', 9), card('b', 'blue', 2)], r, false)
    expect(res.winnerId).toBe('b')
  })

  it('low: niedrigste Zahl gewinnt', () => {
    const r = rule({ color: 'red', parity: null, range: 'low' })
    const res = determineWinner([card('a', 'red', 3), card('b', 'red', 7)], r, false)
    expect(res.winnerId).toBe('a')
  })

  it('mid: Distanz zu 5 entscheidet, 4 vs 6 ist Gleichstand', () => {
    const r = rule({ color: 'red', parity: null, range: 'mid' })
    expect(determineWinner([card('a', 'red', 4), card('b', 'red', 8)], r, false).winnerId).toBe('a')
    const tied = determineWinner([card('a', 'red', 4), card('b', 'red', 6)], r, false)
    expect(tied.winnerId).toBeNull()
    expect(tied.tie).toBe(true)
  })

  it('wertlose Karte verliert gegen wertige; nur wertlose zulässig => tie', () => {
    const r = rule({ color: 'green', parity: null, range: 'high' })
    expect(
      determineWinner([card('a', 'green', null), card('b', 'green', 1)], r, false).winnerId,
    ).toBe('b')
    const res = determineWinner([card('a', 'green', null), card('b', 'green', null)], r, false)
    expect(res.tie).toBe(true)
  })

  it('exakter Gleichstand => tie', () => {
    const r = rule({ color: 'red', parity: null, range: 'high' })
    const res = determineWinner([card('a', 'red', 7), card('b', 'red', 7), card('c', 'red', 2)], r, false)
    expect(res.tie).toBe(true)
    expect(res.winnerId).toBeNull()
  })

  it('farblose Karte kann nie gewinnen, solange jemand die Regelfarbe bedient', () => {
    const r = rule({ color: 'red', parity: null, range: 'high' })
    const res = determineWinner([card('a', null, 9), card('b', 'red', 1)], r, false)
    expect(res.winnerId).toBe('b')
  })

  it('secondWins: Zweitplatzierter gewinnt', () => {
    const r = rule({ color: 'red', parity: null, range: 'high' })
    const res = determineWinner([card('a', 'red', 9), card('b', 'red', 7), card('c', 'red', 2)], r, true)
    expect(res.winnerId).toBe('b')
    expect(res.tie).toBe(false)
  })

  it('secondWins bei geteiltem 1. Platz: die dritte Person gewinnt', () => {
    const r = rule({ color: 'red', parity: null, range: 'high' })
    const res = determineWinner(
      [card('a', 'red', 9), card('b', 'red', 9), card('c', 'red', 4), card('d', 'red', 2)],
      r,
      true,
    )
    expect(res.winnerId).toBe('c')
  })

  it('secondWins ohne existierenden Zweiten => tie', () => {
    const r = rule({ color: 'red', parity: null, range: 'high' })
    // nur eine zulässige (rote) Karte => es gibt keinen zweiten Platz unter den zulässigen
    const res = determineWinner([card('a', 'red', 5)], r, true)
    expect(res.tie).toBe(true)
    expect(res.winnerId).toBeNull()
  })

  it('secondWins mit geteiltem zweiten Platz => tie', () => {
    const r = rule({ color: 'red', parity: null, range: 'high' })
    const res = determineWinner(
      [card('a', 'red', 9), card('b', 'red', 7), card('c', 'red', 7)],
      r,
      true,
    )
    expect(res.tie).toBe(true)
  })

  it('ranking listet zulässige Karten absteigend nach Güte', () => {
    const r = rule({ color: 'red', parity: 'even', range: 'high' })
    const res = determineWinner(
      [card('a', 'red', 3), card('b', 'red', 8), card('c', 'red', 2), card('d', 'green', 9)],
      r,
      false,
    )
    // b (gerade, 8) > c (gerade, 2) > a (ungerade 3, Parität nicht erfüllt) — d ist farblich raus
    expect(res.ranking.slice(0, 3)).toEqual(['b', 'c', 'a'])
  })
})

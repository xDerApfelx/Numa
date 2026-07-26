import { describe, expect, it } from 'vitest'
import { resolveRound, type PlayedCard } from './resolve'
import type { Direction, HandCard, JokerKind, RuleCard } from './types'

let nextId = 0
function hc(over: Partial<HandCard>): HandCard {
  return { id: `t-${nextId++}`, kind: 'number', color: 'red', value: 5, action: 'shield', ...over }
}

function play(
  playerId: string,
  card: Partial<HandCard>,
  direction: Direction,
  joker?: { kind: JokerKind; direction?: Direction },
): PlayedCard {
  return {
    playerId,
    card: hc(card),
    direction,
    joker: joker
      ? {
          card: { id: `j-${nextId++}`, kind: 'joker', joker: joker.kind },
          direction: joker.direction ?? 'self',
        }
      : null,
  }
}

const RULE: RuleCard = { id: 'r', color: 'red', parity: null, range: 'high', black: false }
const BLUE_RULE: RuleCard = { id: 'u0', color: 'blue', parity: null, range: 'low', black: false }
const YELLOW_RULE: RuleCard = { id: 'u1', color: 'yellow', parity: null, range: 'high', black: false }
const BLACK_RULE: RuleCard = { id: 'ub', color: null, parity: null, range: null, black: true }

function run(played: PlayedCard[], upcoming: RuleCard[] = [], startIndex = 0) {
  return resolveRound({ played, startIndex, rule: RULE, upcoming, jokersEnabled: true })
}

describe('resolveRound – Joker', () => {
  it('Joker ist nur aktiv, wenn die Begleitkarte die Regelfarbe hat', () => {
    const active = run([play('p0', { color: 'red' }, 'self', { kind: 'secondWins' })])
    expect(active.secondWins).toBe(true)
    expect(active.steps[0]).toMatchObject({ type: 'jokerReveal', playerId: 'p0', active: true })

    const inactive = run([play('p0', { color: 'green' }, 'self', { kind: 'secondWins' })])
    expect(inactive.secondWins).toBe(false)
    expect(inactive.steps[0]).toMatchObject({ type: 'jokerReveal', active: false })
  })

  it('farblose Begleitkarte => Joker inaktiv', () => {
    const res = run([
      play('p0', { kind: 'colorless', color: null, value: 3, action: 'copyColor' }, 'self', {
        kind: 'secondWins',
      }),
    ])
    expect(res.secondWins).toBe(false)
  })

  it('inaktiver Joker: Begleitkarte nimmt normal am Stich teil', () => {
    const res = run([
      play('p0', { color: 'green', value: 5, action: 'plus' }, 'self', { kind: 'secondWins' }),
      play('p1', { color: 'red', value: 2, action: 'shield' }, 'self'),
    ])
    const p0 = res.finalCards.find((c) => c.playerId === 'p0')!
    expect(p0.value).toBe(6)
    expect(p0.color).toBe('green')
  })

  it('Joker-Aktivierung nutzt die aufgedruckte, nicht die finale Farbe', () => {
    // p0s rote Karte wird durch p1s Tausch grün — der Joker war aber schon
    // beim Aufdecken aktiv (aufgedruckt rot).
    const res = run([
      play('p0', { color: 'red', value: 5, action: 'shield' }, 'left', { kind: 'secondWins' }),
      play('p1', { color: 'green', value: 2, action: 'swapColor' }, 'right'),
    ])
    expect(res.secondWins).toBe(true)
  })

  it('newRule prüft gegen die Vorschau-Farbe und tauscht die Regel', () => {
    const res = run(
      [play('p0', { color: 'blue', value: 3 }, 'self', { kind: 'newRule' })],
      [BLUE_RULE, YELLOW_RULE],
    )
    expect(res.ruleSwaps).toBe(1)
    expect(res.finalRule).toEqual(BLUE_RULE)
    expect(res.steps.some((s) => s.type === 'ruleSwap' && s.newRuleId === 'u0')).toBe(true)
  })

  it('newRule mit falscher Vorschau-Farbe oder schwarzer Vorschau => inaktiv', () => {
    const wrongColor = run(
      [play('p0', { color: 'red', value: 3 }, 'self', { kind: 'newRule' })],
      [BLUE_RULE, YELLOW_RULE],
    )
    expect(wrongColor.ruleSwaps).toBe(0)
    expect(wrongColor.finalRule).toEqual(RULE)

    const black = run(
      [play('p0', { color: 'blue', value: 3 }, 'self', { kind: 'newRule' })],
      [BLACK_RULE, YELLOW_RULE],
    )
    expect(black.ruleSwaps).toBe(0)
  })

  it('zwei newRule-Joker schieben zweimal, der zweite prüft gegen die neue Vorschau', () => {
    const res = run(
      [
        play('p0', { color: 'blue', value: 3 }, 'self', { kind: 'newRule' }),
        play('p1', { color: 'yellow', value: 4 }, 'self', { kind: 'newRule' }),
      ],
      [BLUE_RULE, YELLOW_RULE, BLACK_RULE],
    )
    expect(res.ruleSwaps).toBe(2)
    expect(res.finalRule).toEqual(YELLOW_RULE)
  })

  it('shiftAll verschiebt die Karten samt Pfeil, Joker bleiben beim Spieler', () => {
    const res = run([
      play('p0', { color: 'red', value: 5 }, 'self', { kind: 'shiftAll', direction: 'left' }),
      play('p1', { color: 'green', value: 7 }, 'self'),
      play('p2', { color: 'blue', value: 2 }, 'self'),
    ])
    // links = (i+1)%n: p0s Karte liegt jetzt bei p1, p1s bei p2, p2s bei p0
    const by = (id: string) => res.finalCards.find((c) => c.playerId === id)!
    expect(by('p0')).toMatchObject({ color: 'blue', value: 2 })
    expect(by('p1')).toMatchObject({ color: 'red', value: 5 })
    expect(by('p2')).toMatchObject({ color: 'green', value: 7 })
    expect(res.steps.some((s) => s.type === 'shiftAll' && s.direction === 'left')).toBe(true)
  })

  it('nach shiftAll wirken Aktionen von der neuen Position aus', () => {
    const res = run([
      play('p0', { color: 'red', value: 5, action: 'plus' }, 'left', {
        kind: 'shiftAll',
        direction: 'left',
      }),
      play('p1', { color: 'green', value: 7, action: 'none' }, 'self'),
      play('p2', { color: 'blue', value: 2, action: 'none' }, 'self'),
    ])
    // p0s plus-Karte (Pfeil links) liegt nach dem Shift bei Seat 1 und trifft
    // damit Seat 2, wo jetzt p1s grüne 7 liegt -> 8
    const by = (id: string) => res.finalCards.find((c) => c.playerId === id)!
    expect(by('p2')).toMatchObject({ color: 'green', value: 8 })
  })

  it('onlyOwnAction unterdrückt fremde Aktionen und fremde Schilde', () => {
    const res = run([
      play('p0', { color: 'red', value: 9, action: 'minus' }, 'left'), // -> p1, unterdrückt
      play('p1', { color: 'red', value: 4, action: 'plus' }, 'left', { kind: 'onlyOwnAction' }), // -> p2
      play('p2', { color: 'red', value: 7, action: 'shield' }, 'self'), // Schild unterdrückt
    ])
    const by = (id: string) => res.finalCards.find((c) => c.playerId === id)!
    expect(by('p1').value).toBe(4)
    expect(by('p2').value).toBe(8)
    expect(res.steps.some((s) => s.type === 'fizzle' && s.actorId === 'p0' && s.reason === 'suppressed')).toBe(
      true,
    )
  })

  it('secondWins-Flag wird durchgereicht', () => {
    const res = run([play('p0', { color: 'red' }, 'self', { kind: 'secondWins' })])
    expect(res.secondWins).toBe(true)
  })

  it('Joker werden ab dem Startspieler aufgedeckt', () => {
    const res = run(
      [
        play('p0', { color: 'red' }, 'self', { kind: 'secondWins' }),
        play('p1', { color: 'red' }, 'self'),
        play('p2', { color: 'red' }, 'self', { kind: 'onlyOwnAction' }),
      ],
      [],
      1,
    )
    const reveals = res.steps.filter((s) => s.type === 'jokerReveal').map((s) => s.playerId)
    expect(reveals).toEqual(['p2', 'p0'])
  })
})

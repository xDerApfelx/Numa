import { describe, expect, it } from 'vitest'
import { resolveRound, type PlayedCard } from './resolve'
import type { Direction, HandCard, RuleCard } from './types'

let nextId = 0
function hc(over: Partial<HandCard>): HandCard {
  return { id: `t-${nextId++}`, kind: 'number', color: 'red', value: 5, action: 'plus', ...over }
}

function play(
  playerId: string,
  card: Partial<HandCard>,
  direction: Direction,
): PlayedCard {
  return { playerId, card: hc(card), direction, joker: null }
}

const RULE: RuleCard = { id: 'r', color: 'red', parity: null, range: 'high', black: false }

function run(played: PlayedCard[], startIndex = 0) {
  return resolveRound({ played, startIndex, rule: RULE, upcoming: [], jokersEnabled: true })
}

function finalOf(res: ReturnType<typeof run>, playerId: string) {
  const f = res.finalCards.find((c) => c.playerId === playerId)
  if (!f) throw new Error('missing final card for ' + playerId)
  return f
}

describe('resolveRound – Aktionen', () => {
  it('Wert kopieren kopiert den aktuellen Wert: Kopierer zuerst => alter Wert', () => {
    // p0 kopiert von p1 (links von Seat 0), danach erhöht p1 sich selbst
    const res = run([
      play('p0', { kind: 'numberless', value: null, action: 'copyValue', color: 'blue' }, 'left'),
      play('p1', { value: 5, action: 'plus' }, 'self'),
      play('p2', { value: 2, action: 'shield' }, 'self'),
    ])
    expect(finalOf(res, 'p0').value).toBe(5)
    expect(finalOf(res, 'p1').value).toBe(6)
  })

  it('Wert kopieren kopiert den aktuellen Wert: Quelle vorher verändert => neuer Wert', () => {
    // p0 erhöht sich selbst (5->6), p1 kopiert danach von p0 (rechts von Seat 1)
    const res = run([
      play('p0', { value: 5, action: 'plus' }, 'self'),
      play('p1', { kind: 'numberless', value: null, action: 'copyValue', color: 'blue' }, 'right'),
      play('p2', { value: 2, action: 'shield' }, 'self'),
    ])
    expect(finalOf(res, 'p1').value).toBe(6)
  })

  it('zwei Farblose aufeinander bleiben farblos', () => {
    const res = run([
      play('p0', { kind: 'colorless', color: null, value: 4, action: 'copyColor' }, 'left'),
      play('p1', { kind: 'colorless', color: null, value: 7, action: 'copyColor' }, 'right'),
    ])
    expect(finalOf(res, 'p0').color).toBeNull()
    expect(finalOf(res, 'p1').color).toBeNull()
    expect(res.steps.filter((s) => s.type === 'fizzle' && s.reason === 'noColor')).toHaveLength(2)
  })

  it('zwei Zahlenlose aufeinander bleiben wertlos', () => {
    const res = run([
      play('p0', { kind: 'numberless', value: null, action: 'copyValue' }, 'left'),
      play('p1', { kind: 'numberless', value: null, action: 'copyValue', color: 'green' }, 'right'),
    ])
    expect(finalOf(res, 'p0').value).toBeNull()
    expect(finalOf(res, 'p1').value).toBeNull()
  })

  it('erlaubt 10 und 0, aber nicht darüber hinaus', () => {
    const hoch = run([
      play('p0', { value: 9, action: 'plus' }, 'self'),
      play('p1', { value: 1, action: 'minus' }, 'self'),
    ])
    expect(finalOf(hoch, 'p0').value).toBe(10)
    expect(finalOf(hoch, 'p1').value).toBe(0)

    // zwei Erhöhungen auf dieselbe 9er-Karte kommen trotzdem nur bis 10
    const grenze = run([
      play('p0', { value: 5, action: 'plus' }, 'left'),
      play('p1', { value: 9, action: 'none' }, 'self'),
      play('p2', { value: 5, action: 'plus' }, 'right'),
    ])
    expect(finalOf(grenze, 'p1').value).toBe(10)
  })

  it('die 0 gilt als gerade Zahl', () => {
    const res = run([
      play('p0', { value: 1, action: 'minus' }, 'self'),
      play('p1', { value: 5, action: 'none' }, 'self'),
    ])
    const null_ = finalOf(res, 'p0').value!
    expect(null_).toBe(0)
    expect(null_ % 2).toBe(0)
  })

  it('Farbe tauschen ist bidirektional', () => {
    const res = run([
      play('p0', { color: 'red', value: 3, action: 'swapColor' }, 'left'),
      play('p1', { color: 'green', value: 7, action: 'shield' }, 'left'),
      play('p2', { color: 'blue', value: 2, action: 'shield' }, 'left'),
    ])
    expect(finalOf(res, 'p0').color).toBe('green')
    expect(finalOf(res, 'p1').color).toBe('red')
  })

  it('Farbe tauschen mit farblosem Ziel macht die eigene Karte farblos', () => {
    const res = run([
      play('p0', { color: 'red', value: 3, action: 'swapColor' }, 'left'),
      play('p1', { kind: 'colorless', color: null, value: 7, action: 'copyColor' }, 'self'),
    ])
    expect(finalOf(res, 'p0').color).toBeNull()
    expect(finalOf(res, 'p1').color).toBe('red')
  })

  // Sitzordnung p0, p1, p2: links von i = (i+1)%3, rechts = (i-1+3)%3.
  // Schild und Spiegel wehren nur Angriffe aus der Richtung ab, in die ihr
  // Pfeil zeigt — man muss sich also entscheiden, woher man den Angriff
  // erwartet.

  it('Schild wehrt den Angriff aus der Pfeilrichtung ab', () => {
    const res = run([
      play('p0', { value: 5, action: 'plus' }, 'left'), // greift p1 an
      play('p1', { value: 4, action: 'shield' }, 'right'), // rechts von p1 ist p0
      play('p2', { value: 2, action: 'none' }, 'self'),
    ])
    expect(finalOf(res, 'p1').value).toBe(4)
    expect(res.steps.find((s) => s.type === 'blocked')).toMatchObject({
      actorId: 'p0',
      targetId: 'p1',
      shieldOwnerId: 'p1',
    })
  })

  it('Schild aus der falschen Richtung hilft nicht', () => {
    const res = run([
      play('p0', { value: 5, action: 'plus' }, 'left'), // greift p1 an
      play('p1', { value: 4, action: 'shield' }, 'left'), // schaut auf p2, nicht auf p0
      play('p2', { value: 2, action: 'none' }, 'self'),
    ])
    expect(finalOf(res, 'p1').value).toBe(5)
    expect(res.steps.some((s) => s.type === 'blocked')).toBe(false)
  })

  it('Schild auf sich selbst wehrt nichts ab', () => {
    const res = run([
      play('p0', { value: 5, action: 'plus' }, 'left'),
      play('p1', { value: 4, action: 'shield' }, 'self'),
      play('p2', { value: 2, action: 'none' }, 'self'),
    ])
    expect(finalOf(res, 'p1').value).toBe(5)
    expect(res.steps.some((s) => s.type === 'blocked')).toBe(false)
  })

  it('Schild schützt nur den eigenen Platz, nicht den Nachbarn', () => {
    const res = run([
      play('p0', { value: 5, action: 'minus' }, 'right'), // greift p2 an
      play('p1', { value: 4, action: 'shield' }, 'left'), // p1 schaut auf p2
      play('p2', { value: 6, action: 'none' }, 'self'),
    ])
    expect(finalOf(res, 'p2').value).toBe(5) // Angriff geht durch
  })

  it('zwei Angreifer: nur der aus der Pfeilrichtung wird abgewehrt', () => {
    const res = run([
      play('p0', { value: 5, action: 'plus' }, 'left'), // -> p1, aus p1s Sicht rechts
      play('p1', { value: 4, action: 'shield' }, 'right'), // wehrt p0 ab
      play('p2', { value: 6, action: 'plus' }, 'left'), // -> p0 ... 2+1=0
    ])
    expect(finalOf(res, 'p1').value).toBe(4) // p0 abgewehrt
    expect(finalOf(res, 'p0').value).toBe(6) // p2 kommt durch
  })

  it('Spiegel reflektiert den Angriff aus seiner Pfeilrichtung auf den Angreifer', () => {
    const res = run([
      play('p0', { value: 5, action: 'plus' }, 'left'), // -> p1
      play('p1', { value: 4, action: 'mirror' }, 'right'), // schaut auf p0
    ])
    expect(finalOf(res, 'p0').value).toBe(6)
    expect(finalOf(res, 'p1').value).toBe(4)
    expect(res.steps.some((s) => s.type === 'reflected' && s.mirrorOwnerId === 'p1')).toBe(true)
  })

  it('Spiegel aus der falschen Richtung reflektiert nicht', () => {
    const res = run([
      play('p0', { value: 5, action: 'plus' }, 'left'),
      play('p1', { value: 4, action: 'mirror' }, 'left'),
      play('p2', { value: 2, action: 'none' }, 'self'),
    ])
    expect(finalOf(res, 'p1').value).toBe(5)
    expect(res.steps.some((s) => s.type === 'reflected')).toBe(false)
  })

  it('selbst-gerichtete Aktionen werden nicht geblockt', () => {
    const res = run([
      play('p0', { value: 4, action: 'shield' }, 'left'),
      play('p1', { value: 5, action: 'plus' }, 'self'),
    ])
    expect(finalOf(res, 'p1').value).toBe(6)
  })

  it('Aktionen laufen in Sitzreihenfolge ab dem Startspieler', () => {
    const res = run(
      [
        play('p0', { value: 5, action: 'plus' }, 'self'),
        play('p1', { value: 5, action: 'plus' }, 'self'),
        play('p2', { value: 5, action: 'plus' }, 'self'),
      ],
      1,
    )
    const actors = res.steps.filter((s) => s.type === 'action').map((s) => s.actorId)
    expect(actors).toEqual(['p1', 'p2', 'p0'])
  })

  it('jeder Seat erzeugt genau einen Step (action/blocked/reflected/fizzle)', () => {
    const res = run([
      play('p0', { value: 5, action: 'plus' }, 'left'),
      play('p1', { value: 4, action: 'shield' }, 'self'),
      play('p2', { kind: 'colorless', color: null, value: 2, action: 'copyColor' }, 'left'), // Ziel p0 hat Farbe -> action
    ])
    const perSeat = res.steps.filter((s) => s.type !== 'jokerReveal')
    expect(perSeat).toHaveLength(3)
  })
})

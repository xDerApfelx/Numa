import { describe, expect, it } from 'vitest'
import { applyEvent, createGame, type GameState } from './engine'
import { isJoker, type AnyCard, type Color, type HandCard, type JokerCard, type RuleCard } from './types'

const PLAYERS = [
  { id: 'p0', name: 'Anna', isBot: false },
  { id: 'p1', name: 'Ben', isBot: false },
  { id: 'p2', name: 'Cleo', isBot: true },
]

function newGame(over: { targetScore?: number; jokersEnabled?: boolean } = {}, seed = 1) {
  const s = createGame(
    PLAYERS,
    { targetScore: over.targetScore ?? 5, jokersEnabled: over.jokersEnabled ?? true },
    seed,
  )
  // createGame lost die Sitzordnung aus; für die Tests hier auf die bekannte
  // Reihenfolge zurückdrehen, damit Sitzplatz i immer PLAYERS[i] ist. Das
  // Auslosen selbst hat einen eigenen Test.
  s.players = PLAYERS.map((info) => s.players.find((p) => p.id === info.id)!)
  return s
}

let nextId = 0
function num(color: Color | null, value: number | null, action: HandCard['action'] = 'none'): HandCard {
  return { id: `x-${nextId++}`, kind: 'number', color, value, action }
}
function jok(kind: JokerCard['joker']): JokerCard {
  return { id: `xj-${nextId++}`, kind: 'joker', joker: kind }
}
const RED_HIGH: RuleCard = { id: 'xr-red', color: 'red', parity: null, range: 'high', black: false }
const BLACK: RuleCard = { id: 'xr-black', color: null, parity: null, range: null, black: true }

// Präpariert eine Runde mit fest vorgegebenen Handkarten und Regel.
function rigged(hands: AnyCard[][], rule: RuleCard = RED_HIGH): GameState {
  const s = newGame()
  s.players.forEach((p, i) => (p.hand = [...hands[i]]))
  s.ruleDeck = [rule, ...s.ruleDeck.filter((r) => !r.black)]
  s.phase = 'playing'
  return s
}

function playAll(state: GameState, pick?: (s: GameState, seat: number) => string): GameState {
  let s = state
  for (let k = 0; k < s.players.length; k++) {
    const seat = s.turnIndex
    const player = s.players[seat]
    const cardId = pick
      ? pick(s, seat)
      : player.hand.find((c) => !isJoker(c))!.id
    s = applyEvent(s, { type: 'play', playerId: player.id, cardId, direction: 'self', jokerId: null, jokerDirection: null })
  }
  return s
}

describe('createGame', () => {
  it('teilt 7 Karten je Spieler aus, Rest bleibt im Nachziehstapel', () => {
    const s = newGame()
    for (const p of s.players) expect(p.hand).toHaveLength(7)
    expect(s.drawPile).toHaveLength(146 - 21)
    expect(s.ruleDeck).toHaveLength(30)
    expect(s.phase === 'playing' || s.phase === 'blackRule').toBe(true)
    expect(s.round).toBe(1)
  })

  it('wirft bei falscher Spielerzahl', () => {
    expect(() => createGame(PLAYERS.slice(0, 1), { targetScore: 5, jokersEnabled: true }, 1)).toThrow()
  })

  it('lost die Sitzordnung pro Spiel aus, aber immer vollständig', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, name: `S${i}`, isBot: false }))
    const opts = { targetScore: 5, jokersEnabled: true }
    const orderOf = (seed: number) =>
      createGame(six, opts, seed)
        .players.map((p) => p.id)
        .join(',')

    // Gleicher Seed -> gleiche Sitzordnung, anderer Seed -> andere
    expect(orderOf(4)).toEqual(orderOf(4))
    const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(orderOf))
    expect(seen.size).toBeGreaterThan(1)

    // Es geht niemand verloren und niemand sitzt doppelt
    for (const order of seen) {
      expect(order.split(',').sort()).toEqual(six.map((p) => p.id).sort())
    }
  })

  it('behält die ausgeloste Sitzordnung über die Runden bei', () => {
    const s0 = rigged([[num('red', 9, 'shield')], [num('red', 5, 'shield')], [num('blue', 2, 'shield')]])
    const before = s0.players.map((p) => p.id)
    const s2 = applyEvent(playAll(s0), { type: 'nextRound' })
    expect(s2.players.map((p) => p.id)).toEqual(before)
  })
})

describe('Rundenzyklus', () => {
  it('kompletter Durchlauf: legen, aufdecken, Punkt, nachziehen, rotieren', () => {
    const s0 = rigged([[num('red', 9, 'shield')], [num('red', 5, 'shield')], [num('blue', 2, 'shield')]])
    const s1 = playAll(s0)
    expect(s1.phase).toBe('reveal')
    expect(s1.lastResolution).not.toBeNull()
    expect(s1.lastWinnerId).toBe('p0')
    expect(s1.players[0].score).toBe(1)

    const s2 = applyEvent(s1, { type: 'nextRound' })
    for (const p of s2.players) expect(p.hand).toHaveLength(7)
    expect(s2.startIndex).toBe(1)
    expect(s2.turnIndex).toBe(1)
    expect(s2.round).toBe(2)
    expect(['playing', 'blackRule']).toContain(s2.phase)
  })

  it('Unentschieden füllt den Pool, nächster Sieg räumt ihn ab (Pool Extrem)', () => {
    const tieState = playAll(
      rigged([[num('red', 5, 'shield')], [num('red', 5, 'shield')], [num('blue', 2, 'shield')]]),
    )
    expect(tieState.lastWinnerId).toBeNull()
    expect(tieState.pool).toHaveLength(1)
    expect(tieState.players.every((p) => p.score === 0)).toBe(true)

    // Nächste Runde manuell präparieren: p1 gewinnt und räumt den Pool ab
    let s = applyEvent(tieState, { type: 'nextRound' })
    s.players[0].hand = [num('red', 1, 'shield')]
    s.players[1].hand = [num('red', 8, 'shield')]
    s.players[2].hand = [num('green', 3, 'shield')]
    s.ruleDeck = [RED_HIGH, ...s.ruleDeck.filter((r) => !r.black)]
    s.phase = 'playing'
    s = playAll(s)
    expect(s.lastWinnerId).toBe(s.players[1].id)
    expect(s.players[1].score).toBe(2) // 1 Regelkarte + 1 Pool-Karte
    expect(s.lastPoolWin).toBe(1)
    expect(s.pool).toHaveLength(0)
  })

  it('leerer Nachziehstapel wird aus der Ablage neu gemischt', () => {
    const s = playAll(rigged([[num('red', 9, 'shield')], [num('red', 5, 'shield')], [num('blue', 2, 'shield')]]))
    s.drawPile = []
    s.discard = Array.from({ length: 30 }, (_, i) => num('green', (i % 9) + 1, 'plus'))
    const s2 = applyEvent(s, { type: 'nextRound' })
    for (const p of s2.players) expect(p.hand).toHaveLength(7)
    expect(s2.discard).toHaveLength(0)
    expect(s2.drawPile.length).toBeGreaterThan(0)
  })

  it('Joker kann mit einer Karte zusammen gespielt werden', () => {
    const j = jok('secondWins')
    const s0 = rigged([
      [num('red', 9, 'shield'), j],
      [num('red', 5, 'shield')],
      [num('blue', 2, 'shield')],
    ])
    const s1 = applyEvent(s0, {
      type: 'play',
      playerId: 'p0',
      cardId: s0.players[0].hand[0].id,
      direction: 'self',
      jokerId: j.id,
      jokerDirection: 'self',
    })
    expect(s1.played[0]!.joker!.card.joker).toBe('secondWins')
    expect(s1.players[0].hand).toHaveLength(0)
  })
})

describe('Validierung', () => {
  it('wirft, wenn der falsche Spieler legt', () => {
    const s = rigged([[num('red', 9)], [num('red', 5)], [num('blue', 2)]])
    expect(() =>
      applyEvent(s, {
        type: 'play',
        playerId: 'p1',
        cardId: s.players[1].hand[0].id,
        direction: 'self',
        jokerId: null,
        jokerDirection: null,
      }),
    ).toThrow(/Reihe/)
  })

  it('wirft bei Karte, die nicht auf der Hand ist', () => {
    const s = rigged([[num('red', 9)], [num('red', 5)], [num('blue', 2)]])
    expect(() =>
      applyEvent(s, { type: 'play', playerId: 'p0', cardId: 'nope', direction: 'self', jokerId: null, jokerDirection: null }),
    ).toThrow(/Hand/)
  })

  it('wirft, wenn ein Joker allein gespielt wird, obwohl normale Karten da sind', () => {
    const j = jok('shiftAll')
    const s = rigged([[num('red', 9), j], [num('red', 5)], [num('blue', 2)]])
    expect(() =>
      applyEvent(s, { type: 'play', playerId: 'p0', cardId: j.id, direction: 'self', jokerId: null, jokerDirection: null }),
    ).toThrow(/allein/)
  })

  it('Nur-Joker-Hand: Joker darf als wirkungslose Karte abgeworfen werden', () => {
    const j = jok('shiftAll')
    const s = rigged([[j], [num('red', 5, 'shield')], [num('blue', 2, 'shield')]])
    const s1 = applyEvent(s, { type: 'play', playerId: 'p0', cardId: j.id, direction: 'self', jokerId: null, jokerDirection: null })
    expect(s1.played[0]!.card.action).toBe('none')
    expect(s1.discard.some((c) => c.id === j.id)).toBe(true)
  })

  it('wirft bei nextRound außerhalb der reveal-Phase', () => {
    const s = rigged([[num('red', 9)], [num('red', 5)], [num('blue', 2)]])
    expect(() => applyEvent(s, { type: 'nextRound' })).toThrow()
  })
})

describe('Spielende', () => {
  it('targetScore erreicht => gameOver mit winnerId', () => {
    const s0 = rigged([[num('red', 9, 'shield')], [num('red', 5, 'shield')], [num('blue', 2, 'shield')]])
    s0.options.targetScore = 1
    const s1 = playAll(s0)
    const s2 = applyEvent(s1, { type: 'nextRound' })
    expect(s2.phase).toBe('gameOver')
    expect(s2.winnerId).toBe('p0')
  })

  it('targetScore 0 = Endlosspiel: nie gameOver', () => {
    const s0 = rigged([[num('red', 9, 'shield')], [num('red', 5, 'shield')], [num('blue', 2, 'shield')]])
    s0.options.targetScore = 0
    s0.players[0].score = 50
    const s1 = playAll(s0)
    const s2 = applyEvent(s1, { type: 'nextRound' })
    expect(s2.phase).not.toBe('gameOver')
  })
})

describe('Schwarze Regelkarte', () => {
  function blackState(): GameState {
    const s = newGame()
    s.ruleDeck = [BLACK, RED_HIGH, ...s.ruleDeck.filter((r) => !r.black)]
    s.phase = 'blackRule'
    s.blackDone = s.players.map(() => false)
    return s
  }

  it('Tausch erhält die Handgröße, danach geht es mit der nächsten Regel weiter', () => {
    let s = blackState()
    const dropIds = s.players[0].hand.slice(0, 3).map((c) => c.id)
    s = applyEvent(s, { type: 'blackDiscard', playerId: 'p0', cardIds: dropIds })
    expect(s.players[0].hand).toHaveLength(7)
    expect(s.blackDone[0]).toBe(true)
    expect(s.phase).toBe('blackRule')

    s = applyEvent(s, { type: 'blackDiscard', playerId: 'p1', cardIds: [] })
    s = applyEvent(s, { type: 'blackDiscard', playerId: 'p2', cardIds: [] })
    expect(s.phase).toBe('playing')
    expect(s.ruleDeck[0]).toEqual(RED_HIGH)
    expect(s.removedRules.some((r) => r.black)).toBe(true)
  })

  it('doppelter Tausch wirft', () => {
    let s = blackState()
    s = applyEvent(s, { type: 'blackDiscard', playerId: 'p0', cardIds: [] })
    expect(() => applyEvent(s, { type: 'blackDiscard', playerId: 'p0', cardIds: [] })).toThrow()
  })
})

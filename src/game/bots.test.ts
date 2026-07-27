import { describe, expect, it } from 'vitest'
import { chooseBotBlackDiscard, chooseBotMove } from './bots'
import { applyEvent, createGame, type GameState } from './engine'
import { mulberry32 } from './rng'
import type { HandCard, RuleCard } from './types'

const PLAYERS = [
  { id: 'p0', name: 'BotA', isBot: true },
  { id: 'p1', name: 'BotB', isBot: true },
  { id: 'p2', name: 'BotC', isBot: true },
  { id: 'p3', name: 'BotD', isBot: true },
]

describe('Bots', () => {
  it('spielen komplette Partien ohne illegale Züge (20 Seeds)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = mulberry32(seed * 1000)
      let s: GameState = createGame(PLAYERS, { targetScore: 3, jokersEnabled: true }, seed)
      let guard = 0
      while (s.phase !== 'gameOver' && guard++ < 500) {
        if (s.phase === 'playing') {
          const current = s.players[s.turnIndex]
          s = applyEvent(s, chooseBotMove(s, current.id, rng))
        } else if (s.phase === 'reveal') {
          s = applyEvent(s, { type: 'nextRound' })
        } else if (s.phase === 'blackRule') {
          const idx = s.blackDone.findIndex((d) => !d)
          s = applyEvent(s, chooseBotBlackDiscard(s, s.players[idx].id, rng))
        }
      }
      expect(s.phase).toBe('gameOver')
      expect(s.winnerId).not.toBeNull()
      const winner = s.players.find((p) => p.id === s.winnerId)!
      expect(winner.score).toBeGreaterThanOrEqual(3)
    }
  })

  it('bevorzugt Karten in der Regelfarbe', () => {
    const s = createGame(PLAYERS, { targetScore: 3, jokersEnabled: false }, 7)
    const red9: HandCard = { id: 'red9', kind: 'number', color: 'red', value: 9, action: 'shield' }
    const green1: HandCard = { id: 'green1', kind: 'number', color: 'green', value: 1, action: 'shield' }
    // Sitzordnung wird ausgelost — Karten dem Spieler geben, nicht dem Platz
    const bot = s.players[0]
    bot.hand = [green1, red9]
    const rule: RuleCard = { id: 'r', color: 'red', parity: null, range: 'high', black: false }
    s.ruleDeck = [rule, ...s.ruleDeck]
    s.phase = 'playing'
    const move = chooseBotMove(s, bot.id, mulberry32(1))
    expect(move.cardId).toBe('red9')
  })

  it('ist deterministisch je Seed', () => {
    const s = createGame(PLAYERS, { targetScore: 3, jokersEnabled: true }, 42)
    const a = chooseBotMove(s, s.players[0].id, mulberry32(5))
    const b = chooseBotMove(s, s.players[0].id, mulberry32(5))
    expect(a).toEqual(b)
  })

  it('blackDiscard wirft nur regelfremde Farben ab, maximal 4', () => {
    const s = createGame(PLAYERS, { targetScore: 3, jokersEnabled: false }, 9)
    s.phase = 'blackRule'
    const mk = (id: string, color: HandCard['color']): HandCard => ({
      id,
      kind: 'number',
      color,
      value: 5,
      action: 'shield',
    })
    const bot = s.players[0]
    bot.hand = [
      mk('a', 'red'),
      mk('b', 'red'),
      mk('c', 'green'),
      mk('d', 'green'),
      mk('e', 'green'),
      mk('f', 'green'),
      mk('g', 'blue'),
    ]
    s.ruleDeck = [
      { id: 'black', color: null, parity: null, range: null, black: true },
      { id: 'r1', color: 'red', parity: null, range: 'high', black: false },
      { id: 'r2', color: 'blue', parity: null, range: 'low', black: false },
      ...s.ruleDeck,
    ]
    const ev = chooseBotBlackDiscard(s, bot.id, mulberry32(1))
    // grüne Karten passen weder zu rot (aktuell danach) noch blau (Vorschau danach)
    expect(ev.cardIds.length).toBeLessThanOrEqual(4)
    expect(ev.cardIds).toEqual(['c', 'd', 'e', 'f'])
  })
})

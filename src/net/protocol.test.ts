import { describe, expect, it } from 'vitest'
import { applyEvent, createGame } from '../game/engine'
import { isJoker } from '../game/types'
import { toPublicState } from './protocol'
import { makeRoomCode, normalizeRoomCode, ROOM_ALPHABET, roomCodeToPeerId } from './roomCode'
import { mulberry32 } from '../game/rng'

const PLAYERS = [
  { id: 'p0', name: 'Anna', isBot: false },
  { id: 'p1', name: 'Ben', isBot: false },
  { id: 'p2', name: 'Cleo', isBot: true },
]

describe('roomCode', () => {
  it('erzeugt 5 Zeichen aus dem sicheren Alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = makeRoomCode(mulberry32(i))
      expect(code).toHaveLength(5)
      for (const ch of code) expect(ROOM_ALPHABET).toContain(ch)
    }
  })

  it('normalisiert Eingaben', () => {
    expect(normalizeRoomCode(' ab c-de ')).toBe('ABCDE')
  })

  it('mappt auf eine präfixierte Peer-ID', () => {
    expect(roomCodeToPeerId('ABCDE')).toBe('numa-w7q-ABCDE')
  })
})

describe('toPublicState – Privatsphäre', () => {
  it('enthält keine Handkarten-IDs und keine Stapel-Inhalte', () => {
    const s = createGame(PLAYERS, { targetScore: 5, jokersEnabled: true }, 11)
    const pub = toPublicState(s)
    const json = JSON.stringify(pub)
    for (const p of s.players) {
      for (const card of p.hand) expect(json).not.toContain(card.id)
    }
    for (const card of s.drawPile) expect(json).not.toContain(card.id)
    expect(pub.drawCount).toBe(s.drawPile.length)
    expect(pub.players[0].handCount).toBe(7)
  })

  it('zeigt vor dem Aufdecken nur Pfeilrichtung, keine Kartendetails', () => {
    let s = createGame(PLAYERS, { targetScore: 5, jokersEnabled: true }, 12)
    if (s.phase !== 'playing') s.phase = 'playing' // schwarze Startregel hier irrelevant
    const first = s.players[s.turnIndex]
    const card = first.hand.find((c) => !isJoker(c))!
    s = applyEvent(s, { type: 'play', playerId: first.id, cardId: card.id, direction: 'left', jokerId: null, jokerDirection: null })
    const pub = toPublicState(s)
    const seat = s.players.findIndex((p) => p.id === first.id)
    expect(pub.players[seat].hasPlayed).toBe(true)
    expect(pub.players[seat].playedBack).toEqual({ direction: 'left', jokerDirection: null })
    expect(pub.revealed).toBeNull()
    expect(JSON.stringify(pub)).not.toContain(card.id)
  })

  it('liefert nach dem Aufdecken die gelegten Karten und Steps', () => {
    let s = createGame(PLAYERS, { targetScore: 5, jokersEnabled: true }, 13)
    s.phase = 'playing'
    for (let k = 0; k < 3; k++) {
      const p = s.players[s.turnIndex]
      const card = p.hand.find((c) => !isJoker(c))!
      s = applyEvent(s, { type: 'play', playerId: p.id, cardId: card.id, direction: 'self', jokerId: null, jokerDirection: null })
    }
    expect(s.phase).toBe('reveal')
    const pub = toPublicState(s)
    expect(pub.revealed).toHaveLength(3)
    expect(pub.resolution).not.toBeNull()
    expect(pub.resolution!.steps.length).toBeGreaterThan(0)
  })
})

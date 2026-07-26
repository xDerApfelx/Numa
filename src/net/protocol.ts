import type { GameState, Phase } from '../game/engine'
import type { PlayedCard, ResolutionResult } from '../game/resolve'
import type { AnyCard, Direction, GameOptions, RuleCard } from '../game/types'

export interface LobbyPlayer {
  id: string
  name: string
  isBot: boolean
  connected: boolean
}

export interface LobbySnapshot {
  code: string
  players: LobbyPlayer[]
  options: GameOptions
  hostId: string
}

export interface PublicPlayer {
  id: string
  name: string
  isBot: boolean
  score: number
  handCount: number
  hasPlayed: boolean
  // Vor dem Aufdecken ist nur die Rückseite mit Pfeilrichtung sichtbar
  playedBack: { direction: Direction; jokerDirection: Direction | null } | null
}

export interface PublicState {
  phase: Phase
  options: GameOptions
  players: PublicPlayer[]
  rule: RuleCard
  preview: RuleCard | null
  poolSize: number
  drawCount: number
  startIndex: number
  turnIndex: number
  round: number
  revealed: PlayedCard[] | null // erst in der reveal-Phase gefüllt
  resolution: ResolutionResult | null
  lastWinnerId: string | null
  lastPoolWin: number
  blackDone: boolean[]
  winnerId: string | null
}

// Projektion des Host-Zustands ohne private Informationen: keine fremden
// Handkarten, keine Stapel-Inhalte, gelegte Karten erst nach dem Aufdecken.
export function toPublicState(s: GameState): PublicState {
  const reveal = s.phase === 'reveal'
  return {
    phase: s.phase,
    options: s.options,
    players: s.players.map((p, seat) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      score: p.score,
      handCount: p.hand.length,
      hasPlayed: s.played[seat] !== null,
      playedBack: s.played[seat]
        ? {
            direction: s.played[seat]!.direction,
            jokerDirection: s.played[seat]!.joker?.direction ?? null,
          }
        : null,
    })),
    rule: s.ruleDeck[0],
    preview: s.ruleDeck[1] ?? null,
    poolSize: s.pool.length,
    drawCount: s.drawPile.length,
    startIndex: s.startIndex,
    turnIndex: s.turnIndex,
    round: s.round,
    revealed: reveal ? (s.played as PlayedCard[]) : null,
    resolution: reveal ? s.lastResolution : null,
    lastWinnerId: s.lastWinnerId,
    lastPoolWin: s.lastPoolWin,
    blackDone: s.blackDone,
    winnerId: s.winnerId,
  }
}

export type C2H =
  | { t: 'hello'; name: string }
  | { t: 'play'; cardId: string; direction: Direction; jokerId: string | null; jokerDirection: Direction | null }
  | { t: 'blackDiscard'; cardIds: string[] }

export type H2C =
  | { t: 'lobby'; lobby: LobbySnapshot; youId: string }
  | { t: 'state'; pub: PublicState; hand: AnyCard[] }
  | { t: 'err'; message: string }

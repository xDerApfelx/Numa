import { buildDrawDeck, buildRuleDeck } from './cards'
import { HAND_SIZE } from './config'
import { mulberry32, shuffle } from './rng'
import { resolveRound, type PlayedCard, type ResolutionResult } from './resolve'
import { determineWinner } from './winner'
import { isJoker, type AnyCard, type Direction, type GameOptions, type HandCard, type RuleCard } from './types'

export interface PlayerState {
  id: string
  name: string
  isBot: boolean
  hand: AnyCard[]
  score: number
}

export type Phase = 'playing' | 'reveal' | 'blackRule' | 'gameOver'

export interface GameState {
  seed: number
  rngCursor: number
  options: GameOptions
  players: PlayerState[] // Sitzreihenfolge im Uhrzeigersinn
  drawPile: AnyCard[]
  discard: AnyCard[]
  ruleDeck: RuleCard[] // [0] = aktuelle Regel, [1] = Vorschau
  removedRules: RuleCard[] // gewonnene/aussortierte Regelkarten
  pool: RuleCard[] // Pool Extrem: sammelt sich bei Unentschieden an
  startIndex: number
  turnIndex: number
  phase: Phase
  played: (PlayedCard | null)[] // Index = Seat
  lastResolution: ResolutionResult | null
  lastWinnerId: string | null
  lastPoolWin: number // wie viele Pool-Karten der letzte Sieg abgeräumt hat
  blackDone: boolean[]
  winnerId: string | null // gesetzt bei gameOver
  round: number
}

export type GameEvent =
  | {
      type: 'play'
      playerId: string
      cardId: string
      direction: Direction
      jokerId: string | null
      jokerDirection: Direction | null
    }
  | { type: 'blackDiscard'; playerId: string; cardIds: string[] }
  | { type: 'nextRound' }

export function createGame(
  playerInfos: { id: string; name: string; isBot: boolean }[],
  options: GameOptions,
  seed: number,
): GameState {
  if (playerInfos.length < 2 || playerInfos.length > 6) {
    throw new Error('Numa braucht 2-6 Spieler')
  }
  const rng = mulberry32(seed)
  const drawPile = buildDrawDeck(rng, options.jokersEnabled)
  const ruleDeck = buildRuleDeck(rng)

  const players: PlayerState[] = playerInfos.map((p) => ({ ...p, hand: [], score: 0 }))
  for (const p of players) {
    p.hand = drawPile.splice(0, HAND_SIZE)
  }

  return {
    seed,
    rngCursor: 0,
    options,
    players,
    drawPile,
    discard: [],
    ruleDeck,
    removedRules: [],
    pool: [],
    startIndex: 0,
    turnIndex: 0,
    phase: ruleDeck[0].black ? 'blackRule' : 'playing',
    played: players.map(() => null),
    lastResolution: null,
    lastWinnerId: null,
    lastPoolWin: 0,
    blackDone: players.map(() => false),
    winnerId: null,
    round: 1,
  }
}

function nextRng(s: GameState) {
  // Deterministisch und serialisierbar: jeder Bedarf an Zufall bekommt einen
  // eigenen, aus Seed + Zähler abgeleiteten Generator.
  return mulberry32((s.seed ^ (s.rngCursor++ * 0x9e3779b9)) >>> 0)
}

function seatOf(s: GameState, playerId: string): number {
  const i = s.players.findIndex((p) => p.id === playerId)
  if (i < 0) throw new Error(`Unbekannter Spieler: ${playerId}`)
  return i
}

// Zieht count Karten; Nachziehstapel leer => Ablage neu mischen; beides leer
// => frisches Deck generieren ("Karten gehen digital nie aus").
function drawCards(s: GameState, count: number): AnyCard[] {
  const out: AnyCard[] = []
  for (let i = 0; i < count; i++) {
    if (s.drawPile.length === 0 && s.discard.length > 0) {
      s.drawPile = shuffle(s.discard, nextRng(s))
      s.discard = []
    }
    if (s.drawPile.length === 0) {
      s.drawPile = buildDrawDeck(nextRng(s), s.options.jokersEnabled)
    }
    out.push(s.drawPile.shift()!)
  }
  return out
}

// Stellt sicher, dass mindestens eine aktuelle + eine Vorschau-Regelkarte liegt.
function replenishRules(s: GameState) {
  if (s.ruleDeck.length < 2 && s.removedRules.length > 0) {
    s.ruleDeck.push(...shuffle(s.removedRules, nextRng(s)))
    s.removedRules = []
  }
  if (s.ruleDeck.length === 0) {
    s.ruleDeck = buildRuleDeck(nextRng(s))
  }
}

function applyPlay(s: GameState, ev: Extract<GameEvent, { type: 'play' }>) {
  if (s.phase !== 'playing') throw new Error('Gerade kann keine Karte gelegt werden')
  const seat = seatOf(s, ev.playerId)
  if (seat !== s.turnIndex) throw new Error('Nicht an der Reihe')
  if (s.played[seat]) throw new Error('Bereits gelegt')

  const player = s.players[seat]
  const cardIdx = player.hand.findIndex((c) => c.id === ev.cardId)
  if (cardIdx < 0) throw new Error('Karte nicht auf der Hand')
  const rawCard = player.hand[cardIdx]

  let card: HandCard
  if (isJoker(rawCard)) {
    // Notlösung Nur-Joker-Hand: Joker als wirkungslose Karte abwerfen.
    if (player.hand.some((c) => !isJoker(c))) {
      throw new Error('Joker können nicht allein gespielt werden')
    }
    if (ev.jokerId) throw new Error('Joker können nicht kombiniert werden')
    // Der Joker wandert sofort in die Ablage; am Tisch liegt eine
    // wirkungslose Platzhalter-Karte, die weiterhin die Joker-Grafik zeigt.
    card = {
      id: `${rawCard.id}-discarded`,
      kind: 'colorless',
      color: null,
      value: null,
      action: 'none',
      art: `joker/${rawCard.joker}`,
    }
    player.hand.splice(cardIdx, 1)
    s.discard.push(rawCard)
    s.played[seat] = { playerId: ev.playerId, card, direction: ev.direction, joker: null }
  } else {
    card = rawCard
    let joker: PlayedCard['joker'] = null
    if (ev.jokerId) {
      if (!s.options.jokersEnabled) throw new Error('Joker sind deaktiviert')
      const jIdx = player.hand.findIndex((c) => c.id === ev.jokerId)
      if (jIdx < 0) throw new Error('Joker nicht auf der Hand')
      const j = player.hand[jIdx]
      if (!isJoker(j)) throw new Error('Das ist kein Joker')
      joker = { card: j, direction: ev.jokerDirection ?? 'self' }
    }
    // Erst Joker entfernen (Index-Verschiebung vermeiden: nach ID filtern)
    player.hand = player.hand.filter((c) => c.id !== ev.cardId && c.id !== ev.jokerId)
    s.played[seat] = { playerId: ev.playerId, card, direction: ev.direction, joker }
  }

  // Nächster Spieler in Sitzreihenfolge ab Startspieler; haben alle gelegt,
  // wird aufgedeckt.
  const n = s.players.length
  const playedCount = s.played.filter(Boolean).length
  if (playedCount < n) {
    s.turnIndex = (seat + 1) % n
    return
  }

  const res = resolveRound({
    played: s.played as PlayedCard[],
    startIndex: s.startIndex,
    rule: s.ruleDeck[0],
    upcoming: s.ruleDeck.slice(1),
    jokersEnabled: s.options.jokersEnabled,
  })

  // "Neue Regelkarte": aktuelle Regel wandert unter den Stapel.
  for (let k = 0; k < res.ruleSwaps; k++) {
    s.ruleDeck.push(s.ruleDeck.shift()!)
  }

  const result = determineWinner(res.finalCards, res.finalRule, res.secondWins)
  s.lastResolution = res
  s.lastWinnerId = result.winnerId
  s.lastPoolWin = 0

  const current = s.ruleDeck.shift()!
  if (result.winnerId) {
    const winner = s.players[seatOf(s, result.winnerId)]
    winner.score += 1 + s.pool.length
    s.lastPoolWin = s.pool.length
    s.removedRules.push(current, ...s.pool)
    s.pool = []
  } else {
    // Pool Extrem: beliebig viele Regelkarten sammeln sich an.
    s.pool.push(current)
  }
  replenishRules(s)
  s.phase = 'reveal'
}

function applyNextRound(s: GameState) {
  if (s.phase !== 'reveal') throw new Error('Keine Runde zum Abschließen')

  for (const p of s.played) {
    if (!p) continue
    // 'none'-Platzhalter (allein abgeworfener Joker) liegt bereits in der Ablage
    if (p.card.action !== 'none') s.discard.push(p.card)
    if (p.joker) s.discard.push(p.joker.card)
  }

  for (const player of s.players) {
    const missing = HAND_SIZE - player.hand.length
    if (missing > 0) player.hand.push(...drawCards(s, missing))
  }

  const n = s.players.length
  s.played = s.players.map(() => null)
  s.startIndex = (s.startIndex + 1) % n
  s.turnIndex = s.startIndex
  s.round++
  s.lastResolution = null

  const { targetScore } = s.options
  if (targetScore > 0) {
    const champion = s.players.find((p) => p.score >= targetScore)
    if (champion) {
      s.phase = 'gameOver'
      s.winnerId = champion.id
      return
    }
  }

  if (s.ruleDeck[0].black) {
    s.phase = 'blackRule'
    s.blackDone = s.players.map(() => false)
  } else {
    s.phase = 'playing'
  }
}

function applyBlackDiscard(s: GameState, ev: Extract<GameEvent, { type: 'blackDiscard' }>) {
  if (s.phase !== 'blackRule') throw new Error('Gerade ist kein Kartentausch möglich')
  const seat = seatOf(s, ev.playerId)
  if (s.blackDone[seat]) throw new Error('Bereits getauscht')

  const player = s.players[seat]
  const ids = new Set(ev.cardIds)
  if (ids.size !== ev.cardIds.length) throw new Error('Doppelte Karten')
  for (const id of ids) {
    if (!player.hand.some((c) => c.id === id)) throw new Error('Karte nicht auf der Hand')
  }
  const kept = player.hand.filter((c) => !ids.has(c.id))
  const dropped = player.hand.filter((c) => ids.has(c.id))
  s.discard.push(...dropped)
  player.hand = [...kept, ...drawCards(s, dropped.length)]
  s.blackDone[seat] = true

  if (s.blackDone.every(Boolean)) {
    // Schwarze Regelkarte ist ein Einmal-Effekt und wird aussortiert.
    s.removedRules.push(s.ruleDeck.shift()!)
    replenishRules(s)
    if (s.ruleDeck[0].black) {
      s.blackDone = s.players.map(() => false)
    } else {
      s.phase = 'playing'
      s.turnIndex = s.startIndex
    }
  }
}

export function applyEvent(state: GameState, ev: GameEvent): GameState {
  const s = structuredClone(state)
  switch (ev.type) {
    case 'play':
      applyPlay(s, ev)
      break
    case 'nextRound':
      applyNextRound(s)
      break
    case 'blackDiscard':
      applyBlackDiscard(s, ev)
      break
  }
  return s
}

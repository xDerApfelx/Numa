import type { GameEvent, GameState } from './engine'
import type { Rng } from './rng'
import { isJoker, type AnyCard, type Direction, type HandCard, type JokerCard, type RuleCard } from './types'

type PlayEvent = Extract<GameEvent, { type: 'play' }>
type BlackEvent = Extract<GameEvent, { type: 'blackDiscard' }>

function pick<T>(arr: T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)]
}

// Wie gut passt eine Karte zur Regel? (grobe V1-Heuristik)
function cardScore(card: HandCard, rule: RuleCard): number {
  let score = 0
  if (rule.color !== null && card.color === rule.color) score += 100
  if (card.value !== null) {
    if (rule.parity === 'even' && card.value % 2 === 0) score += 10
    if (rule.parity === 'odd' && card.value % 2 === 1) score += 10
    if (rule.range === 'high') score += card.value
    if (rule.range === 'low') score += 10 - card.value
    if (rule.range === 'mid') score += 5 - Math.abs(card.value - 5)
  }
  return score
}

function chooseDirection(card: HandCard, rule: RuleCard, rng: Rng): Direction {
  const neighbor: Direction = rng() < 0.5 ? 'left' : 'right'
  switch (card.action) {
    case 'plus':
      return rule.range === 'high' ? 'self' : neighbor
    case 'minus':
      return rule.range === 'low' ? 'self' : neighbor
    case 'shield':
    case 'mirror':
      return 'self'
    case 'copyColor':
    case 'copyValue':
    case 'swapColor':
      return neighbor
    default:
      return pick(['left', 'right', 'self'], rng)
  }
}

export function chooseBotMove(state: GameState, playerId: string, rng: Rng): PlayEvent {
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error(`Unbekannter Bot: ${playerId}`)
  const rule = state.ruleDeck[0]
  const preview = state.ruleDeck[1] ?? null

  const normals = player.hand.filter((c): c is HandCard => !isJoker(c))
  if (normals.length === 0) {
    // Nur-Joker-Hand: Joker wirkungslos abwerfen
    return { type: 'play', playerId, cardId: player.hand[0].id, direction: 'self', jokerId: null, jokerDirection: null }
  }

  const best = normals.reduce((a, b) => (cardScore(b, rule) > cardScore(a, rule) ? b : a))

  // Joker anhängen, wenn er aktivierbar wäre (50% Wahrscheinlichkeit)
  let jokerId: string | null = null
  let jokerDirection: Direction | null = null
  if (state.options.jokersEnabled) {
    const jokers = player.hand.filter((c): c is JokerCard => isJoker(c))
    const activatable = jokers.filter((j) =>
      j.joker === 'newRule'
        ? preview !== null && !preview.black && best.color !== null && best.color === preview.color
        : best.color !== null && best.color === rule.color,
    )
    if (activatable.length > 0 && rng() < 0.5) {
      const j = pick(activatable, rng)
      jokerId = j.id
      jokerDirection = j.joker === 'shiftAll' ? (rng() < 0.5 ? 'left' : 'right') : 'self'
    }
  }

  return {
    type: 'play',
    playerId,
    cardId: best.id,
    direction: chooseDirection(best, rule, rng),
    jokerId,
    jokerDirection,
  }
}

export function chooseBotBlackDiscard(state: GameState, playerId: string, rng: Rng): BlackEvent {
  void rng
  const player = state.players.find((p) => p.id === playerId)
  if (!player) throw new Error(`Unbekannter Bot: ${playerId}`)
  // Nach dem Tausch wird ruleDeck[1] die aktuelle und ruleDeck[2] die Vorschau.
  const keepColors = new Set(
    [state.ruleDeck[1]?.color, state.ruleDeck[2]?.color].filter((c): c is NonNullable<typeof c> => c != null),
  )
  const droppable = (c: AnyCard) =>
    !isJoker(c) && c.color !== null && keepColors.size > 0 && !keepColors.has(c.color)
  const cardIds = player.hand.filter(droppable).slice(0, 4).map((c) => c.id)
  return { type: 'blackDiscard', playerId, cardIds }
}

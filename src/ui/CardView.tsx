import { cardArtPath, ruleArtPath } from '../game/cards'
import type { ActionKind, AnyCard, Color, Direction, JokerKind, RuleCard } from '../game/types'

// Die Karten sind die echten Druckvorlagen aus PDF/, per tools/extract-cards.mjs
// als Vektor-SVG nach public/cards/ extrahiert. Die Grafik zeigt immer die
// aufgedruckte Karte; was eine Karte nach den Aktionen einer Runde tatsächlich
// zählt, blendet <CardView> als Zustands-Overlay darüber ein.

const BASE = import.meta.env.BASE_URL

export function artUrl(path: string): string {
  return `${BASE}cards/${path}.svg`
}

/** Markenfarben, direkt aus dem nu·ma-Logo auf der Kartenrückseite. */
export const COLOR_HEX: Record<Color, string> = {
  red: '#ec3959',
  green: '#24b457',
  blue: '#008295',
  yellow: '#f9ab2c',
}

export const COLOR_NAME: Record<Color, string> = {
  red: 'Rot',
  green: 'Grün',
  blue: 'Blau',
  yellow: 'Gelb',
}

export function actionLabel(action: ActionKind): string {
  switch (action) {
    case 'plus':
      return 'Wert um 1 erhöhen'
    case 'minus':
      return 'Wert um 1 senken'
    case 'shield':
      return 'Aktion abwehren'
    case 'mirror':
      return 'Aktion reflektieren'
    case 'swapColor':
      return 'Farbe tauschen'
    case 'copyColor':
      return 'Farbe kopieren'
    case 'copyValue':
      return 'Wert kopieren'
    case 'none':
      return 'ohne Wirkung'
  }
}

export function jokerLabel(joker: JokerKind): string {
  switch (joker) {
    case 'shiftAll':
      return 'Alle Karten verschieben'
    case 'newRule':
      return 'Neue Regelkarte'
    case 'secondWins':
      return 'Zweiter gewinnt'
    case 'onlyOwnAction':
      return 'Nur eigene Aktion zählt'
  }
}

export function ruleLabel(rule: RuleCard): string {
  if (rule.black) return 'Kartenhand erneuern'
  const parity = rule.parity === 'even' ? 'Gerade ' : rule.parity === 'odd' ? 'Ungerade ' : ''
  const range = rule.range === 'high' ? 'Hohe' : rule.range === 'low' ? 'Niedrige' : 'Mittlere'
  return `${parity}${range} Zahlen`
}

export function cardTitle(card: AnyCard): string {
  if (card.kind === 'joker') return `Joker: ${jokerLabel(card.joker)}`
  const color = card.color ? COLOR_NAME[card.color] : 'Farblos'
  const value = card.value ?? '?'
  return `${color} ${value} — ${actionLabel(card.action)}`
}

/** Aktueller Zustand einer Karte, falls Aktionen sie verändert haben. */
export interface CardState {
  color: Color | null
  value: number | null
}

export function CardView({
  card,
  ruleCard,
  state,
  back,
  arrow,
  width = 110,
  selected = false,
  dimmed = false,
  onClick,
  label,
}: {
  /** Handkarte (Vorderseite) */
  card?: AnyCard
  /** Regelkarte statt Handkarte */
  ruleCard?: RuleCard
  /** Ist-Zustand nach Aktionen — weicht er von der Karte ab, wird er eingeblendet */
  state?: CardState | null
  /** Rückseite mit Richtungspfeil zeigen */
  back?: boolean
  arrow?: Direction | null
  width?: number
  selected?: boolean
  dimmed?: boolean
  onClick?: () => void
  label?: string
}) {
  const height = Math.round((width * 96) / 66)

  let src: string
  let title: string
  if (back) {
    src = artUrl(ruleCard ? 'back-rule' : 'back-hand')
    title = 'Verdeckte Karte'
  } else if (ruleCard) {
    src = artUrl(ruleArtPath(ruleCard))
    title = `Regelkarte: ${ruleCard.color ? COLOR_NAME[ruleCard.color] + ', ' : ''}${ruleLabel(ruleCard)}`
  } else if (card) {
    src = artUrl(cardArtPath(card))
    title = cardTitle(card)
  } else {
    return <span className="card card-empty" style={{ width, height }} aria-hidden="true" />
  }

  // Der Pfeil auf der Rückseite zeigt im Original nach oben.
  const rotation = arrow === 'left' ? -90 : arrow === 'right' ? 90 : arrow === 'self' ? 180 : 0

  // Overlay nur, wenn die Karte gerade wirklich etwas anderes zählt als aufgedruckt.
  const printed = card && card.kind !== 'joker' ? card : null
  const changedColor = Boolean(state && printed && state.color !== printed.color)
  const changedValue = Boolean(state && printed && state.value !== printed.value)
  const modified = changedColor || changedValue

  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      className={[
        'card',
        selected && 'card-selected',
        dimmed && 'card-dimmed',
        onClick && 'card-clickable',
        modified && 'card-modified',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          width,
          height,
          '--card-state-color':
            state?.color != null ? COLOR_HEX[state.color] : modified ? 'var(--ink-dim)' : 'transparent',
        } as React.CSSProperties
      }
      onClick={onClick}
      title={label ?? title}
      type={onClick ? 'button' : undefined}
      aria-label={label ?? title}
    >
      <img
        className="card-art"
        src={src}
        alt=""
        draggable={false}
        style={rotation ? { transform: `rotate(${rotation}deg)` } : undefined}
      />
      {modified && (
        <span className="card-state" aria-hidden="true">
          {changedValue && <span className="card-state-value">{state!.value ?? '?'}</span>}
          {changedColor && !changedValue && <span className="card-state-dot" />}
        </span>
      )}
    </Tag>
  )
}

import { cardArtPath, ruleArtPath } from '../game/cards'
import type { ActionKind, AnyCard, Color, Direction, JokerKind, RuleCard } from '../game/types'
import { rotatedBounds } from './tableLayout'

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
  stateOffset,
  back,
  arrow,
  angleDeg,
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
  /** Richtung, in die der Ist-Wert neben die Karte rückt (Einheitsvektor) */
  stateOffset?: { x: number; y: number } | null
  /** Rückseite zeigen */
  back?: boolean
  /** Grobe Richtung in 90-Grad-Schritten (für Galerie und Vorschauen) */
  arrow?: Direction | null
  /** Genauer Drehwinkel in Grad — zeigt exakt auf den Zielplatz, schlägt `arrow` */
  angleDeg?: number | null
  width?: number
  selected?: boolean
  dimmed?: boolean
  onClick?: () => void
  label?: string
}) {
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
    return (
      <span
        className="card-slot"
        style={{ '--card-w-default': `${width}px` } as React.CSSProperties}
        aria-hidden="true"
      >
        <span className="card card-empty" />
      </span>
    )
  }

  // Der Pfeil auf der Rückseite zeigt im Original nach oben. Gedreht wird die
  // ganze Karte, damit sie wirklich auf den Zielplatz zeigt — dafür muss der
  // belegte Platz mitwachsen, sonst würde die Karte am Rand beschnitten.
  const rotation =
    angleDeg ?? (arrow === 'left' ? -90 : arrow === 'right' ? 90 : arrow === 'self' ? 180 : 0)
  const bounds = rotation ? rotatedBounds(66, 96, rotation) : null

  // Overlay nur, wenn die Karte gerade wirklich etwas anderes zählt als aufgedruckt.
  const printed = card && card.kind !== 'joker' ? card : null
  const changedColor = Boolean(state && printed && state.color !== printed.color)
  const changedValue = Boolean(state && printed && state.value !== printed.value)
  const modified = changedColor || changedValue

  const Tag = onClick ? 'button' : 'div'

  return (
    <span
      className="card-slot"
      style={
        {
          // Breite als Variable, damit die Stylesheets sie auf flachen
          // Viewports herunterskalieren können; die Höhe folgt dem
          // Seitenverhältnis der echten Karte (66 x 96 mm).
          '--card-w-default': `${width}px`,
          '--card-rot': `${rotation}deg`,
          // Platzbedarf der gedrehten Karte, als Vielfaches der Kartenbreite
          '--slot-fw': bounds ? bounds.width / 66 : 1,
          '--slot-fh': bounds ? bounds.height / 66 : 96 / 66,
          '--card-state-color':
            state?.color != null ? COLOR_HEX[state.color] : modified ? 'var(--ink-dim)' : 'transparent',
          // Verschiebt den Ist-Wert in den freien Raum neben der Karte
          '--state-dx': stateOffset?.x ?? 0,
          '--state-dy': stateOffset?.y ?? 0,
        } as React.CSSProperties
      }
    >
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
        onClick={onClick}
        title={label ?? title}
        type={onClick ? 'button' : undefined}
        aria-label={label ?? title}
      >
        <img className="card-art" src={src} alt="" draggable={false} />
      </Tag>

      {/* Der Ist-Wert liegt mittig über der Karte und dreht sich nicht mit —
          er soll auf einen Blick lesbar sein. */}
      {modified && (
        <span className="card-state" aria-hidden="true">
          {changedValue ? (
            <span className="card-state-value">{state!.value ?? '?'}</span>
          ) : (
            <span className="card-state-dot" />
          )}
        </span>
      )}
    </span>
  )
}

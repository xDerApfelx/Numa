import type { ActionKind, Color, Direction, JokerKind, RuleCard } from '../game/types'

// SVG-Karten im Stil der physischen Numa-Assets: dunkles Anthrazit, diagonale
// Farbfläche mit großer Ziffer, Aktions-Pill unten, Puzzle-Rückseite mit
// Richtungspfeil.

export const COLOR_HEX: Record<Color, string> = {
  red: '#e6403a',
  green: '#3fb54a',
  blue: '#2e9bd6',
  yellow: '#f5a028',
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
      return 'Wert +1'
    case 'minus':
      return 'Wert −1'
    case 'shield':
      return 'Schild'
    case 'mirror':
      return 'Spiegel'
    case 'swapColor':
      return 'Farbe tauschen'
    case 'copyColor':
      return 'Farbe kopieren'
    case 'copyValue':
      return 'Wert kopieren'
    case 'none':
      return '—'
  }
}

export function jokerLabel(joker: JokerKind): string {
  switch (joker) {
    case 'shiftAll':
      return 'Alle verschieben'
    case 'newRule':
      return 'Neue Regelkarte'
    case 'secondWins':
      return 'Zweiter gewinnt'
    case 'onlyOwnAction':
      return 'Nur eigene Aktion'
  }
}

export function ruleLabel(rule: RuleCard): string {
  if (rule.black) return 'Handkarten tauschen'
  const parity = rule.parity === 'even' ? 'Gerade ' : rule.parity === 'odd' ? 'Ungerade ' : ''
  const range = rule.range === 'high' ? 'Hohe' : rule.range === 'low' ? 'Niedrige' : 'Mittlere'
  return `${parity}${range} Zahlen`
}

const INK = '#f2efe9'
const CARD_BG = '#26232c'
const CARD_LINE = '#3b3743'
const COLORLESS_FILL = '#dcd8d0'

function ActionIcon({ action, x, y, s = 1 }: { action: ActionKind; x: number; y: number; s?: number }) {
  const t = `translate(${x} ${y}) scale(${s})`
  switch (action) {
    case 'plus':
      return (
        <g transform={t} stroke={INK} strokeWidth="2.4" strokeLinecap="round">
          <line x1="-5" y1="0" x2="5" y2="0" />
          <line x1="0" y1="-5" x2="0" y2="5" />
        </g>
      )
    case 'minus':
      return (
        <g transform={t} stroke={INK} strokeWidth="2.4" strokeLinecap="round">
          <line x1="-5" y1="0" x2="5" y2="0" />
        </g>
      )
    case 'shield':
      return (
        <g transform={t}>
          <path
            d="M0,-7 L6,-4.5 L6,1 Q6,6 0,8 Q-6,6 -6,1 L-6,-4.5 Z"
            fill="none"
            stroke={INK}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </g>
      )
    case 'mirror':
      return (
        <g transform={t} fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round">
          <line x1="0" y1="-7" x2="0" y2="7" strokeDasharray="2.5 2.5" />
          <path d="M-8,-4 L-3,0 L-8,4" />
          <path d="M8,-4 L3,0 L8,4" />
        </g>
      )
    case 'swapColor':
      return (
        <g transform={t} fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M-7,-2 A7,6 0 0 1 7,-2" />
          <path d="M7,2 A7,6 0 0 1 -7,2" />
          <path d="M4,-6 L7,-2 L2.5,-1" />
          <path d="M-4,6 L-7,2 L-2.5,1" />
        </g>
      )
    case 'copyColor':
      return (
        <g transform={t}>
          <path d="M0,-7 Q6,0 6,3.5 A6,6 0 1 1 -6,3.5 Q-6,0 0,-7 Z" fill="none" stroke={INK} strokeWidth="2" />
        </g>
      )
    case 'copyValue':
      return (
        <g transform={t} fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round">
          <rect x="-7" y="-7" width="10" height="10" rx="2" />
          <rect x="-3" y="-3" width="10" height="10" rx="2" />
        </g>
      )
    case 'none':
      return null
  }
}

function JokerIcon({ joker, x, y, s = 1 }: { joker: JokerKind; x: number; y: number; s?: number }) {
  const t = `translate(${x} ${y}) scale(${s})`
  switch (joker) {
    case 'shiftAll':
      return (
        <g transform={t} fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M-8,-4 L0,-4 M-2,-7 L2,-4 L-2,-1" />
          <path d="M8,4 L0,4 M2,1 L-2,4 L2,7" />
        </g>
      )
    case 'newRule':
      return (
        <g transform={t} fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round">
          <rect x="-7" y="-2" width="11" height="8" rx="1.5" />
          <rect x="-4" y="-6" width="11" height="8" rx="1.5" />
        </g>
      )
    case 'secondWins':
      return (
        <g transform={t}>
          <circle r="7.5" fill="none" stroke={INK} strokeWidth="2" />
          <text
            y="4"
            textAnchor="middle"
            fontFamily="var(--font-display)"
            fontWeight="700"
            fontSize="10"
            fill={INK}
          >
            2.
          </text>
        </g>
      )
    case 'onlyOwnAction':
      return (
        <g transform={t} stroke={INK} strokeWidth="2.6" strokeLinecap="round">
          <line x1="0" y1="-7" x2="0" y2="2" />
          <line x1="0" y1="7" x2="0" y2="7.01" />
        </g>
      )
  }
}

export interface CardFaceProps {
  color: Color | null
  value: number | null
  action: ActionKind
}

// Pfeil-Symbol der Rückseite (zeigt nach oben; Aufrufer rotiert per CSS).
function BackArrow() {
  return (
    <g stroke="var(--red)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M100 208 L100 84" />
      <polyline points="72,116 100,74 128,116" />
    </g>
  )
}

export function CardView({
  face,
  ruleCard,
  joker,
  back,
  arrow,
  width = 110,
  selected = false,
  dimmed = false,
  onClick,
  title,
}: {
  face?: CardFaceProps | null
  ruleCard?: RuleCard
  joker?: JokerKind
  back?: boolean
  arrow?: Direction | null
  width?: number
  selected?: boolean
  dimmed?: boolean
  onClick?: () => void
  title?: string
}) {
  const height = (width * 280) / 200

  let content: React.ReactNode = null
  if (back) {
    // Rückseite: Puzzle-Naht + großer Richtungspfeil
    const rotation = arrow === 'left' ? -90 : arrow === 'right' ? 90 : arrow === 'self' ? 180 : 0
    content = (
      <>
        <rect x="3" y="3" width="194" height="274" rx="16" fill={CARD_BG} stroke={CARD_LINE} strokeWidth="3" />
        <path
          d="M12 140 L70 140 Q78 128 90 138 Q100 148 112 138 Q122 128 130 140 L188 140"
          fill="none"
          stroke={CARD_LINE}
          strokeWidth="2.5"
        />
        <g transform={`rotate(${rotation} 100 140)`}>
          <BackArrow />
        </g>
        <text x="24" y="256" fontFamily="var(--font-display)" fontWeight="700" fontSize="20" fill="#514c5a">
          nu·ma
        </text>
      </>
    )
  } else if (ruleCard) {
    const fill = ruleCard.black ? '#111015' : COLOR_HEX[ruleCard.color!]
    content = (
      <>
        <rect x="3" y="3" width="194" height="274" rx="16" fill={CARD_BG} stroke={CARD_LINE} strokeWidth="3" />
        <rect x="16" y="16" width="168" height="192" rx="10" fill={fill} />
        {ruleCard.black ? (
          <g fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M64 92 L64 132 M64 92 L48 108 M64 92 L80 108" transform="rotate(180 64 112)" />
            <path d="M136 92 L136 132 M136 92 L120 108 M136 92 L152 108" />
          </g>
        ) : (
          <RuleGlyphs rule={ruleCard} />
        )}
        <text
          x="100"
          y="248"
          textAnchor="middle"
          fontFamily="var(--font-display)"
          fontWeight="700"
          fontSize={ruleLabel(ruleCard).length > 18 ? 17 : 20}
          fill={INK}
        >
          {ruleLabel(ruleCard)}
        </text>
      </>
    )
  } else if (joker) {
    content = (
      <>
        <rect x="3" y="3" width="194" height="274" rx="16" fill={CARD_BG} stroke="#8a63c9" strokeWidth="3" />
        <path d="M16 16 L128 16 L16 160 Z" fill="#8a63c9" />
        <text x="42" y="102" fontFamily="var(--font-display)" fontWeight="800" fontSize="86" fill={INK}>
          J
        </text>
        <JokerIcon joker={joker} x={140} y={190} s={2.4} />
        <rect x="16" y="228" width="168" height="34" rx="10" fill="#1c1a21" />
        <text
          x="100"
          y="250"
          textAnchor="middle"
          fontFamily="var(--font-body)"
          fontWeight="600"
          fontSize="15"
          fill={INK}
        >
          {jokerLabel(joker)}
        </text>
      </>
    )
  } else if (face) {
    const wedgeFill = face.color ? COLOR_HEX[face.color] : COLORLESS_FILL
    const numFill = face.color ? INK : '#26232c'
    const display = face.value === null ? '?' : String(face.value)
    content = (
      <>
        <rect x="3" y="3" width="194" height="274" rx="16" fill={CARD_BG} stroke={CARD_LINE} strokeWidth="3" />
        {/* Diagonale Farbfläche mit großer Ziffer — das Numa-Kartengesicht */}
        <path d="M16 16 L152 16 L16 190 Z" fill={wedgeFill} />
        <text
          x="38"
          y="118"
          fontFamily="var(--font-display)"
          fontWeight="800"
          fontSize="104"
          fill={numFill}
        >
          {display}
        </text>
        {/* kleine gespiegelte Ecke unten rechts */}
        <g transform="rotate(180 100 140)">
          <circle cx="32" cy="34" r="17" fill={wedgeFill} />
          <text
            x="32"
            y="42"
            textAnchor="middle"
            fontFamily="var(--font-display)"
            fontWeight="700"
            fontSize="24"
            fill={numFill}
          >
            {display}
          </text>
        </g>
        <rect x="16" y="228" width="168" height="34" rx="10" fill="#1c1a21" />
        <ActionIcon action={face.action} x={34} y={245} s={1.1} />
        <text x={52} y="250" fontFamily="var(--font-body)" fontWeight="600" fontSize="15" fill={INK}>
          {actionLabel(face.action)}
        </text>
      </>
    )
  }

  return (
    <svg
      viewBox="0 0 200 280"
      width={width}
      height={height}
      className={`card ${selected ? 'card-selected' : ''} ${dimmed ? 'card-dimmed' : ''} ${onClick ? 'card-clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
    >
      {title && <title>{title}</title>}
      {content}
    </svg>
  )
}

function RuleGlyphs({ rule }: { rule: RuleCard }) {
  const arrows: React.ReactNode[] = []
  const arrow = (x: number, up: boolean, key: string) => (
    <g key={key} transform={`translate(${x} 112) ${up ? '' : 'rotate(180)'}`} fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M0 34 L0 -28" />
      <polyline points="-20,-4 0,-32 20,-4" />
    </g>
  )
  if (rule.range === 'high') {
    arrows.push(arrow(72, true, 'a'), arrow(128, true, 'b'))
  } else if (rule.range === 'low') {
    arrows.push(arrow(72, false, 'a'), arrow(128, false, 'b'))
  } else {
    arrows.push(
      <g key="mid" fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
        <g transform="translate(100 74)">
          <path d="M0 -18 L0 22" />
          <polyline points="-16,4 0,24 16,4" />
        </g>
        <g transform="translate(100 152) rotate(180)">
          <path d="M0 -18 L0 22" />
          <polyline points="-16,4 0,24 16,4" />
        </g>
      </g>,
    )
  }
  return (
    <>
      {arrows}
      {rule.parity && (
        <g>
          <rect x="52" y="168" width="96" height="26" rx="13" fill="rgba(0,0,0,0.35)" />
          <text
            x="100"
            y="187"
            textAnchor="middle"
            fontFamily="var(--font-body)"
            fontWeight="600"
            fontSize="16"
            fill={INK}
          >
            {rule.parity === 'even' ? '2 · 4 · 6 · 8' : '1 · 3 · 5 · 7 · 9'}
          </text>
        </g>
      )}
    </>
  )
}

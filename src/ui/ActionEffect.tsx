import type { ResolutionStep } from '../game/resolve'
import type { ActionKind } from '../game/types'

// Kurze Einblendung über der betroffenen Karte, damit man beim Aufdecken
// sieht, was gerade passiert — Schild wehrt ab, Wert steigt, Farbe wandert.

export type EffectKind = ActionKind | 'blocked' | 'reflected' | 'joker' | 'suppressed'

export interface ActiveEffect {
  playerId: string
  kind: EffectKind
  tone: 'good' | 'bad' | 'neutral'
}

/** Welche Karte bekommt bei diesem Schritt die Einblendung? */
export function effectFor(step: ResolutionStep): ActiveEffect | null {
  switch (step.type) {
    case 'action':
      return { playerId: step.targetId, kind: step.action, tone: 'neutral' }
    case 'blocked':
      return { playerId: step.shieldOwnerId, kind: 'blocked', tone: 'good' }
    case 'reflected':
      return { playerId: step.mirrorOwnerId, kind: 'reflected', tone: 'good' }
    case 'fizzle':
      return {
        playerId: step.actorId,
        kind: step.reason === 'suppressed' ? 'suppressed' : step.action,
        tone: 'bad',
      }
    case 'jokerReveal':
      return step.active ? { playerId: step.playerId, kind: 'joker', tone: 'neutral' } : null
    default:
      // "Alle verschieben" und Regelkartenwechsel betreffen den ganzen Tisch
      return null
  }
}

function Glyph({ kind }: { kind: EffectKind }) {
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (kind) {
    case 'plus':
      return (
        <g {...stroke}>
          <line x1="20" y1="50" x2="80" y2="50" />
          <line x1="50" y1="20" x2="50" y2="80" />
        </g>
      )
    case 'minus':
      return (
        <g {...stroke}>
          <line x1="20" y1="50" x2="80" y2="50" />
        </g>
      )
    case 'shield':
    case 'blocked':
      return (
        <g {...stroke}>
          <path d="M50 16 L78 28 L78 52 Q78 74 50 86 Q22 74 22 52 L22 28 Z" />
        </g>
      )
    case 'mirror':
    case 'reflected':
      return (
        <g {...stroke}>
          <line x1="50" y1="16" x2="50" y2="84" strokeDasharray="8 8" />
          <path d="M30 34 L14 50 L30 66" />
          <path d="M70 34 L86 50 L70 66" />
        </g>
      )
    case 'swapColor':
      return (
        <g {...stroke}>
          <path d="M20 40 A30 24 0 0 1 80 40" />
          <path d="M80 60 A30 24 0 0 1 20 60" />
          <path d="M68 26 L82 40 L64 44" />
          <path d="M32 74 L18 60 L36 56" />
        </g>
      )
    case 'copyColor':
      return (
        <g {...stroke}>
          <path d="M50 16 Q76 46 76 60 A26 26 0 1 1 24 60 Q24 46 50 16 Z" />
        </g>
      )
    case 'copyValue':
      return (
        <g {...stroke}>
          <rect x="18" y="18" width="42" height="42" rx="7" />
          <rect x="40" y="40" width="42" height="42" rx="7" />
        </g>
      )
    case 'joker':
      return (
        <g {...stroke}>
          <path d="M62 20 L62 62 Q62 82 44 82 Q28 82 26 66" />
          <line x1="42" y1="20" x2="76" y2="20" />
        </g>
      )
    case 'suppressed':
    case 'none':
      return (
        <g {...stroke}>
          <circle cx="50" cy="50" r="32" />
          <line x1="28" y1="28" x2="72" y2="72" />
        </g>
      )
  }
}

export function ActionEffect({ effect }: { effect: ActiveEffect }) {
  return (
    <span className={`action-effect tone-${effect.tone}`} aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <Glyph kind={effect.kind} />
      </svg>
    </span>
  )
}

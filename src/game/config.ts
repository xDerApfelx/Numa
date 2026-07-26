import type { GameOptions } from './types'

// Die tatsächlichen Aktions-Häufigkeiten des physischen Spiels stammen jetzt
// direkt aus den Druck-PDFs (siehe deckData.ts) — 28x plus/minus/Schild und
// je 12x Spiegel/Farbe tauschen, gleichmäßig über die vier Farben verteilt.
export { ACTION_FREQUENCIES } from './deckData'

export const HAND_SIZE = 7

// 0 = Endlosspiel (kein Punkteziel) — Infinity wäre nicht JSON-serialisierbar
// und würde beim Senden über PeerJS verloren gehen.
export const TARGET_OPTIONS: readonly number[] = [3, 5, 7, 10, 0]

export const DEFAULT_OPTIONS: GameOptions = {
  targetScore: 5,
  jokersEnabled: true,
}

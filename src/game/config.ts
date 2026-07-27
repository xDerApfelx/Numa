import type { GameOptions } from './types'

// Die tatsächlichen Aktions-Häufigkeiten des physischen Spiels stammen jetzt
// direkt aus den Druck-PDFs (siehe deckData.ts) — 28x plus/minus/Schild und
// je 12x Spiegel/Farbe tauschen, gleichmäßig über die vier Farben verteilt.
export { ACTION_FREQUENCIES } from './deckData'

export const HAND_SIZE = 7

/**
 * Wertebereich einer Karte im Spiel. Aufgedruckt sind 1 bis 9, aber
 * "Wert ändern" darf darüber hinaus: eine 9 wird zur 10, eine 1 zur 0.
 * Die 0 zählt als gerade Zahl (mathematisch eindeutig) und kann über
 * "Niedrige Zahlen" auch gewinnen.
 */
export const MIN_VALUE = 0
export const MAX_VALUE = 10

// 0 = Endlosspiel (kein Punkteziel) — Infinity wäre nicht JSON-serialisierbar
// und würde beim Senden über PeerJS verloren gehen.
export const TARGET_OPTIONS: readonly number[] = [3, 5, 7, 10, 0]

export const DEFAULT_OPTIONS: GameOptions = {
  targetScore: 5,
  jokersEnabled: true,
}

// ---- Tempo ----
// Das Aufdecken soll nachvollziehbar sein: jede Karte und jede Aktion ist ein
// eigener, abgeschlossener Moment. Host und Oberfläche rechnen mit denselben
// Werten, damit der Host die Runde nicht abschließt, bevor die Animation durch
// ist.

/** Pause zwischen den einzelnen Karten beim Umdrehen. */
export const REVEAL_FLIP_MS = 800

/** Gesamtdauer eines Aktions-Schritts. */
export const REVEAL_STEP_MS = 3100

/** Innerhalb eines Schritts: erst ankündigen, dann nach dieser Zeit auswirken. */
export const REVEAL_EFFECT_DELAY_MS = 1200

/** Nach dem letzten Schritt: Zeit für Gewinner-Banner und Durchatmen. */
export const REVEAL_END_PAUSE_MS = 3600

/** Bedenkzeit der Bots, damit Züge nicht durchrauschen. */
export const BOT_THINK_MIN_MS = 1400
export const BOT_THINK_MAX_MS = 2600

/** Wie lange die komplette Aufdeck-Animation dauert. */
export function revealDurationMs(playerCount: number, stepCount: number): number {
  return playerCount * REVEAL_FLIP_MS + stepCount * REVEAL_STEP_MS + REVEAL_END_PAUSE_MS
}

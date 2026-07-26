import type { GameOptions, NumberAction } from './types'

// Platzhalter-Häufigkeiten für die dynamische Aktion→Zahl-Verteilung der 108
// Zahlenkarten. Bero liefert die im Team berechneten Zielwerte nach —
// dann nur diese Zahlen anpassen, Summe muss 108 bleiben.
export const ACTION_FREQUENCIES: Record<NumberAction, number> = {
  plus: 24,
  minus: 24,
  shield: 20,
  mirror: 16,
  swapColor: 24,
}

export const HAND_SIZE = 7

// 0 = Endlosspiel (kein Punkteziel) — Infinity wäre nicht JSON-serialisierbar
// und würde beim Senden über PeerJS verloren gehen.
export const TARGET_OPTIONS: readonly number[] = [3, 5, 7, 10, 0]

export const DEFAULT_OPTIONS: GameOptions = {
  targetScore: 5,
  jokersEnabled: true,
}

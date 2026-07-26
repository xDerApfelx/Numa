// Gemeinsame Typen der Numa-Spiellogik.
// Sitz-Konvention: players[] ist die Sitzreihenfolge im Uhrzeigersinn,
// linker Nachbar von Seat i = (i+1) % n, rechter = (i-1+n) % n.

export type Color = 'red' | 'green' | 'blue' | 'yellow'

export type NumberAction = 'plus' | 'minus' | 'shield' | 'mirror' | 'swapColor'

// 'none' nur für als Notlösung abgeworfene Joker (Nur-Joker-Hand)
export type ActionKind = NumberAction | 'copyColor' | 'copyValue' | 'none'

export type JokerKind = 'shiftAll' | 'newRule' | 'secondWins' | 'onlyOwnAction'

export type Direction = 'left' | 'right' | 'self'

export interface GameOptions {
  targetScore: number // Infinity = Endlosspiel
  jokersEnabled: boolean
}

export interface HandCard {
  id: string
  kind: 'number' | 'colorless' | 'numberless'
  color: Color | null // colorless => null
  value: number | null // numberless => null
  action: ActionKind // colorless => 'copyColor', numberless => 'copyValue'
}

export interface JokerCard {
  id: string
  kind: 'joker'
  joker: JokerKind
}

export type AnyCard = HandCard | JokerCard

export function isJoker(c: AnyCard): c is JokerCard {
  return c.kind === 'joker'
}

export type Range = 'high' | 'low' | 'mid'
export type Parity = 'even' | 'odd'

export interface RuleCard {
  id: string
  color: Color | null // black => null
  parity: Parity | null
  range: Range | null
  black: boolean
}

export const COLORS: Color[] = ['red', 'green', 'blue', 'yellow']
export const JOKER_KINDS: JokerKind[] = ['shiftAll', 'newRule', 'secondWins', 'onlyOwnAction']

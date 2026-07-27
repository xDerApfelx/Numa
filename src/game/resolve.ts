import { MAX_VALUE, MIN_VALUE } from './config'
import type { FinalCard } from './winner'
import type {
  ActionKind,
  Color,
  Direction,
  HandCard,
  JokerCard,
  JokerKind,
  RuleCard,
} from './types'

export interface PlayedCard {
  playerId: string
  card: HandCard
  direction: Direction
  joker: { card: JokerCard; direction: Direction } | null
}

export interface CardFace {
  color: Color | null
  value: number | null
}

export interface CardChange {
  playerId: string
  before: CardFace
  after: CardFace
}

export type FizzleReason = 'noValue' | 'noColor' | 'suppressed' | 'passive'

export type ResolutionStep =
  | { type: 'jokerReveal'; playerId: string; joker: JokerKind; active: boolean }
  | { type: 'shiftAll'; playerId: string; direction: Direction }
  | { type: 'ruleSwap'; playerId: string; newRuleId: string }
  | { type: 'action'; actorId: string; action: ActionKind; targetId: string; changes: CardChange[] }
  | { type: 'blocked'; actorId: string; action: ActionKind; targetId: string; shieldOwnerId: string }
  | {
      type: 'reflected'
      actorId: string
      action: ActionKind
      targetId: string
      mirrorOwnerId: string
      changes: CardChange[]
    }
  | { type: 'fizzle'; actorId: string; action: ActionKind; reason: FizzleReason }

export interface ResolutionResult {
  steps: ResolutionStep[]
  finalCards: FinalCard[] // je Seat die dort liegende Karte (nach Verschiebungen)
  secondWins: boolean
  ruleSwaps: number // wie oft "Neue Regelkarte" die aktuelle Regel weitergeschoben hat
  finalRule: RuleCard // Regel, gegen die der Stich gewertet wird (nach Swaps)
}

/**
 * Schritte, die beim Aufdecken einen eigenen Moment bekommen. Schild- und
 * Spiegelkarten wirken passiv und erzeugen für sich genommen nichts
 * Sichtbares — sie tauchen erst auf, wenn sie etwas abwehren. Host und
 * Oberfläche müssen dieselbe Liste verwenden, sonst laufen Animation und
 * Rundenwechsel auseinander.
 */
export function visibleSteps(steps: readonly ResolutionStep[]): ResolutionStep[] {
  return steps.filter((s) => !(s.type === 'fizzle' && s.reason === 'passive'))
}

// Sitz-Konvention: linker Nachbar von Seat i = (i+1) % n, rechter = (i-1+n) % n.
export function neighborSeat(i: number, dir: Direction, n: number): number {
  if (dir === 'self') return i
  return dir === 'left' ? (i + 1) % n : (i - 1 + n) % n
}

interface Slot {
  ownerId: string // Seat-Besitzer (ändert sich nie)
  card: HandCard // dort liegende Karte (kann durch shiftAll wandern)
  direction: Direction
  face: CardFace // aktueller (veränderlicher) Zustand der Karte
}

interface Protection {
  kind: 'shield' | 'mirror'
  /** Wer sich schützt */
  ownerSeat: number
  /** Aus dieser Richtung wird abgewehrt — nur Angriffe von diesem Platz */
  fromSeat: number
}

export function resolveRound(args: {
  played: PlayedCard[] // Index = Seat, in Sitzreihenfolge
  startIndex: number
  rule: RuleCard
  upcoming: RuleCard[] // Regelkarten nach der aktuellen: [Vorschau, danach, ...]
  jokersEnabled: boolean
}): ResolutionResult {
  const { played, startIndex, upcoming, jokersEnabled } = args
  const n = played.length
  const steps: ResolutionStep[] = []
  const seatOrder = Array.from({ length: n }, (_, k) => (startIndex + k) % n)

  let slots: Slot[] = played.map((p) => ({
    ownerId: p.playerId,
    card: p.card,
    direction: p.direction,
    face: { color: p.card.color, value: p.card.value },
  }))

  let rule = args.rule
  let secondWins = false
  let ruleSwaps = 0
  const suppressedSeats = new Set<number>()
  let onlyOwnSeats: Set<number> | null = null

  // Phase A: Joker, ab dem Startspieler. Der Joker ist nur aktiv, wenn die
  // aufgedruckte Farbe der Begleitkarte zur aktuellen Regelkarte passt
  // (beim "Neue Regelkarte"-Joker: zur Vorschau-Regelkarte; schwarze
  // Vorschau => inaktiv).
  if (jokersEnabled) {
    for (const seat of seatOrder) {
      const pj = played[seat].joker
      if (!pj) continue
      const printedColor = played[seat].card.color
      // Die aktuell sichtbare Vorschau (verschiebt sich mit jedem Regel-Swap).
      const preview: RuleCard | undefined = upcoming[ruleSwaps]
      let active: boolean
      if (pj.card.joker === 'newRule') {
        active =
          preview !== undefined && !preview.black && printedColor !== null && printedColor === preview.color
      } else {
        active = printedColor !== null && printedColor === rule.color
      }
      steps.push({ type: 'jokerReveal', playerId: played[seat].playerId, joker: pj.card.joker, active })
      if (!active) continue

      switch (pj.card.joker) {
        case 'secondWins':
          secondWins = true
          break
        case 'onlyOwnAction':
          onlyOwnSeats = onlyOwnSeats ?? new Set<number>()
          onlyOwnSeats.add(seat)
          break
        case 'newRule': {
          // Engine schiebt ihre Decks anhand von ruleSwaps selbst weiter; hier
          // brauchen wir die neue aktuelle Regel nur für nachfolgende
          // Joker-Aktivierungen und die Gewinner-Ermittlung.
          rule = preview!
          steps.push({ type: 'ruleSwap', playerId: played[seat].playerId, newRuleId: rule.id })
          ruleSwaps++
          break
        }
        case 'shiftAll': {
          const dir = pj.direction
          if (dir !== 'self') {
            const moved = slots.map((s) => ({ ...s }))
            for (let i = 0; i < n; i++) {
              const target = neighborSeat(i, dir, n)
              moved[target] = {
                ...slots[i],
                ownerId: slots[target].ownerId,
              }
            }
            slots = moved
          }
          steps.push({ type: 'shiftAll', playerId: played[seat].playerId, direction: dir })
          break
        }
      }
    }
  }

  if (onlyOwnSeats) {
    for (let i = 0; i < n; i++) {
      if (!onlyOwnSeats.has(i)) suppressedSeats.add(i)
    }
  }

  // Schutzregister nach eventuellen Verschiebungen: Schild und Spiegel wehren
  // Angriffe aus der Richtung ab, in die ihr Pfeil zeigt. Wer auf sich selbst
  // zeigt, wehrt nichts ab — man muss sich entscheiden, von welcher Seite man
  // einen Angriff erwartet.
  const protections: Protection[] = []
  for (const seat of seatOrder) {
    const slot = slots[seat]
    if (suppressedSeats.has(seat)) continue
    if (slot.direction === 'self') continue
    if (slot.card.action === 'shield' || slot.card.action === 'mirror') {
      protections.push({
        kind: slot.card.action,
        ownerSeat: seat,
        fromSeat: neighborSeat(seat, slot.direction, n),
      })
    }
  }

  const findProtection = (targetSeat: number, attackerSeat: number, kind: 'shield' | 'mirror') =>
    protections.find((p) => p.kind === kind && p.ownerSeat === targetSeat && p.fromSeat === attackerSeat)

  // Aufgedruckt sind 1 bis 9; durch "Wert ändern" kann eine Karte auf 0 fallen
  // oder auf 10 steigen. Die 0 ist mathematisch eine gerade Zahl und erfüllt
  // damit die Bedingung "Gerade Zahlen".
  const clamp = (v: number) => Math.max(MIN_VALUE, Math.min(MAX_VALUE, v))
  const face = (seat: number): CardFace => ({ ...slots[seat].face })

  // Phase B: Aktionen in Sitzreihenfolge ab dem Startspieler.
  for (const seat of seatOrder) {
    const slot = slots[seat]
    const action = slot.card.action
    const actorId = slot.ownerId

    if (action === 'shield' || action === 'mirror' || action === 'none') {
      steps.push({ type: 'fizzle', actorId, action, reason: 'passive' })
      continue
    }
    if (suppressedSeats.has(seat)) {
      steps.push({ type: 'fizzle', actorId, action, reason: 'suppressed' })
      continue
    }

    let targetSeat = neighborSeat(seat, slot.direction, n)
    let reflected: Protection | undefined

    // Nur ein Angriff auf jemand anderen kann abgewehrt werden — und nur,
    // wenn dessen Schild oder Spiegel genau in meine Richtung zeigt.
    if (targetSeat !== seat) {
      const shield = findProtection(targetSeat, seat, 'shield')
      if (shield) {
        steps.push({
          type: 'blocked',
          actorId,
          action,
          targetId: slots[targetSeat].ownerId,
          shieldOwnerId: slots[shield.ownerSeat].ownerId,
        })
        continue
      }
      const mirror = findProtection(targetSeat, seat, 'mirror')
      if (mirror) {
        reflected = mirror
        targetSeat = seat // Aktion trifft den Angreifer selbst
      }
    }

    // Effekt ausführen; sammelt Änderungen oder einen Fizzle-Grund.
    const changes: CardChange[] = []
    let fizzle: FizzleReason | null = null

    switch (action) {
      case 'plus':
      case 'minus': {
        const before = face(targetSeat)
        if (before.value === null) {
          fizzle = 'noValue'
          break
        }
        slots[targetSeat].face.value = clamp(before.value + (action === 'plus' ? 1 : -1))
        changes.push({ playerId: slots[targetSeat].ownerId, before, after: face(targetSeat) })
        break
      }
      case 'swapColor': {
        const beforeActor = face(seat)
        const beforeTarget = face(targetSeat)
        slots[seat].face.color = beforeTarget.color
        slots[targetSeat].face.color = beforeActor.color
        changes.push({ playerId: slots[seat].ownerId, before: beforeActor, after: face(seat) })
        if (targetSeat !== seat) {
          changes.push({ playerId: slots[targetSeat].ownerId, before: beforeTarget, after: face(targetSeat) })
        }
        break
      }
      case 'copyColor': {
        const src = slots[targetSeat].face.color
        if (src === null) {
          fizzle = 'noColor'
          break
        }
        const before = face(seat)
        slots[seat].face.color = src
        changes.push({ playerId: slots[seat].ownerId, before, after: face(seat) })
        break
      }
      case 'copyValue': {
        const src = slots[targetSeat].face.value
        if (src === null) {
          fizzle = 'noValue'
          break
        }
        const before = face(seat)
        slots[seat].face.value = src
        changes.push({ playerId: slots[seat].ownerId, before, after: face(seat) })
        break
      }
    }

    if (reflected) {
      steps.push({
        type: 'reflected',
        actorId,
        action,
        targetId: slots[neighborSeat(seat, slot.direction, n)].ownerId,
        mirrorOwnerId: slots[reflected.ownerSeat].ownerId,
        changes,
      })
    } else if (fizzle) {
      steps.push({ type: 'fizzle', actorId, action, reason: fizzle })
    } else {
      steps.push({ type: 'action', actorId, action, targetId: slots[targetSeat].ownerId, changes })
    }
  }

  const finalCards: FinalCard[] = slots.map((s) => ({
    playerId: s.ownerId,
    color: s.face.color,
    value: s.face.value,
  }))

  return { steps, finalCards, secondWins, ruleSwaps, finalRule: rule }
}

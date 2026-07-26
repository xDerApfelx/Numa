import type { Color, RuleCard } from './types'

export interface FinalCard {
  playerId: string
  color: Color | null
  value: number | null
}

export interface WinnerResult {
  winnerId: string | null
  tie: boolean
  ranking: string[] // zulässige Karten, beste zuerst (gleich gute in Eingabe-Reihenfolge)
}

// Offizielle Priorität: 1. Farbe (entfällt ersatzlos, wenn niemand sie bedient),
// 2. Parität (nur wenn mindestens eine zulässige Karte sie erfüllt),
// 3. Hoch/Niedrig/Mittel als Tiebreak. Wertlose Karten verlieren jeden
// Zahlenvergleich. secondWins: die zweitbeste Güte-Stufe gewinnt; bei geteiltem
// ersten Platz ist die nächste Stufe "Zweiter".
export function determineWinner(cards: FinalCard[], rule: RuleCard, secondWins: boolean): WinnerResult {
  const colorMatches = cards.filter((c) => rule.color !== null && c.color === rule.color)
  const eligible = colorMatches.length > 0 ? colorMatches : cards

  const parityOk = (c: FinalCard) =>
    rule.parity !== null && c.value !== null && (c.value % 2 === 0) === (rule.parity === 'even')

  const rangeScore = (c: FinalCard) => {
    if (c.value === null) return -Infinity
    switch (rule.range) {
      case 'high':
        return c.value
      case 'low':
        return -c.value
      case 'mid':
        return -Math.abs(c.value - 5)
      default:
        return 0
    }
  }

  // Güte-Stufe: erst Parität (wenn überhaupt jemand sie erfüllt), dann Range-Score.
  const anyParity = eligible.some(parityOk)
  const tier = (c: FinalCard): [number, number] => [anyParity && parityOk(c) ? 1 : 0, rangeScore(c)]

  const sorted = [...eligible].sort((a, b) => {
    const [pa, sa] = tier(a)
    const [pb, sb] = tier(b)
    return pb - pa || sb - sa
  })
  const ranking = sorted.map((c) => c.playerId)

  // In Güte-Gruppen einteilen (gleiche Stufe = geteilter Platz).
  const groups: FinalCard[][] = []
  for (const c of sorted) {
    const last = groups[groups.length - 1]
    if (last && tier(last[0])[0] === tier(c)[0] && tier(last[0])[1] === tier(c)[1]) {
      last.push(c)
    } else {
      groups.push([c])
    }
  }

  const winningGroup = secondWins ? groups[1] : groups[0]
  if (!winningGroup || winningGroup.length !== 1) {
    return { winnerId: null, tie: true, ranking }
  }
  return { winnerId: winningGroup[0].playerId, tie: false, ranking }
}

import {
  COLORLESS_VALUES,
  JOKER_CARDS,
  NUMBERED_CARDS,
  NUMBERLESS_COLORS,
  RULE_CARDS,
} from './deckData'
import { shuffle, type Rng } from './rng'
import { isJoker, type AnyCard, type HandCard, type RuleCard } from './types'

// Zieh-Deck: die tatsächliche Zusammensetzung des physischen Spiels —
// 108 Zahlenkarten (die Aktion-zu-Zahl-Zuordnung ist im Team ausbalanciert und
// steht fest in deckData.ts, generiert aus den Druck-PDFs), 12 zahlenlose,
// 18 farblose und optional 8 Joker. Fertig gemischt.
export function buildDrawDeck(rng: Rng, jokersEnabled: boolean): AnyCard[] {
  const deck: AnyCard[] = []
  const seen = new Map<string, number>()

  // Mehrfach-Exemplare derselben Karte brauchen verschiedene IDs.
  const uniqueId = (base: string) => {
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return `${base}#${n}`
  }

  for (const c of NUMBERED_CARDS) {
    deck.push({
      id: uniqueId(`n-${c.color}-${c.value}-${c.action}`),
      kind: 'number',
      color: c.color,
      value: c.value,
      action: c.action,
    } satisfies HandCard)
  }

  for (const value of COLORLESS_VALUES) {
    deck.push({
      id: uniqueId(`c-${value}`),
      kind: 'colorless',
      color: null,
      value,
      action: 'copyColor',
    })
  }

  for (const color of NUMBERLESS_COLORS) {
    deck.push({
      id: uniqueId(`q-${color}`),
      kind: 'numberless',
      color,
      value: null,
      action: 'copyValue',
    })
  }

  if (jokersEnabled) {
    for (const joker of JOKER_CARDS) {
      deck.push({ id: uniqueId(`j-${joker}`), kind: 'joker', joker })
    }
  }

  return shuffle(deck, rng)
}

export function buildRuleDeck(rng: Rng): RuleCard[] {
  return shuffle(
    RULE_CARDS.map((r) => ({ ...r })),
    rng,
  )
}

/** Pfad zur Regelkarten-Grafik unter public/cards/ (ohne Endung). */
export function ruleArtPath(rule: RuleCard): string {
  if (rule.black) return 'rule/black'
  return `rule/${rule.color}-${rule.parity ?? 'any'}-${rule.range}`
}

/**
 * Pfad zur Kartengrafik unter public/cards/ (ohne Endung). Die Grafik zeigt
 * die aufgedruckte Karte — durch Aktionen veränderte Werte werden in der
 * Oberfläche zusätzlich eingeblendet, nicht in die Grafik gerechnet.
 */
export function cardArtPath(card: AnyCard): string {
  if (isJoker(card)) return `joker/${card.joker}`
  if (card.art) return card.art
  switch (card.kind) {
    case 'colorless':
      return `colorless/${card.value}`
    case 'numberless':
      return `numberless/${card.color}`
    default:
      return `number/${card.color}-${card.value}-${card.action}`
  }
}

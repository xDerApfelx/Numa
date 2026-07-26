import { describe, expect, it } from 'vitest'
import { buildDrawDeck, buildRuleDeck, cardArtPath, ruleArtPath } from './cards'
import { mulberry32 } from './rng'

// Deck-Daten und Kartengrafiken werden beide von tools/extract-cards.mjs
// erzeugt. Diese Tests stellen sicher, dass sie zusammenpassen — sonst zeigt
// das Spiel im Browser kaputte Bilder.

const available = new Set(
  Object.keys(import.meta.glob('../../public/cards/**/*.svg')).map((p) =>
    p.replace('../../public/cards/', '').replace(/\.svg$/, ''),
  ),
)

describe('Kartengrafiken', () => {
  it('sind überhaupt vorhanden', () => {
    expect(available.size).toBeGreaterThan(140)
  })

  it('existieren für jede Karte im Zieh-Deck', () => {
    const deck = buildDrawDeck(mulberry32(1), true)
    const missing = [...new Set(deck.map(cardArtPath))].filter((p) => !available.has(p))
    expect(missing).toEqual([])
  })

  it('existieren für jede Regelkarte', () => {
    const rules = buildRuleDeck(mulberry32(1))
    const missing = [...new Set(rules.map(ruleArtPath))].filter((p) => !available.has(p))
    expect(missing).toEqual([])
  })

  it('existieren für Rückseiten und Startspieler-Marker', () => {
    for (const p of ['back-hand', 'back-rule', 'starter-front', 'starter-back']) {
      expect(available.has(p), p).toBe(true)
    }
  })

  it('haben eine intrinsische Größe, damit Browser sie zuverlässig skalieren', async () => {
    const files = import.meta.glob('../../public/cards/*.svg', { query: '?raw', import: 'default' })
    const load = files['../../public/cards/back-hand.svg']
    expect(load).toBeDefined()
    const svg = (await load!()) as string
    expect(svg).toMatch(/<svg[^>]+width="[\d.]+"[^>]+height="[\d.]+"[^>]+viewBox="/)
  })
})

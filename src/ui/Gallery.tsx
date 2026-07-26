import { buildDrawDeck, buildRuleDeck } from '../game/cards'
import { mulberry32 } from '../game/rng'
import { isJoker, type HandCard } from '../game/types'
import { CardView } from './CardView'

// Sichtprüfung aller Kartengrafiken: /?gallery
export function Gallery() {
  const deck = buildDrawDeck(mulberry32(1), true)
  const rules = buildRuleDeck(mulberry32(1))

  // Je Motiv nur ein Exemplar zeigen
  const seen = new Set<string>()
  const unique = deck.filter((c) => {
    const key = isJoker(c) ? `j-${c.joker}` : `${c.kind}-${c.color}-${c.value}-${c.action}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const section = (title: string, children: React.ReactNode) => (
    <section style={{ display: 'grid', gap: 10 }}>
      <h2 style={{ fontSize: 18 }}>{title}</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{children}</div>
    </section>
  )

  const numbered = unique.filter((c): c is HandCard => !isJoker(c) && c.kind === 'number')
  const special = unique.filter((c): c is HandCard => !isJoker(c) && c.kind !== 'number')
  const jokers = unique.filter(isJoker)

  return (
    <main style={{ padding: 28, display: 'grid', gap: 28 }}>
      <h1>
        Kartengalerie <span style={{ color: 'var(--ink-dim)', fontSize: 16 }}>({deck.length} Karten im Deck)</span>
      </h1>

      {section(`Rückseiten & Marker`, (
        <>
          <CardView back arrow="self" width={120} />
          <CardView back arrow="left" width={120} />
          <CardView back arrow="right" width={120} />
          <CardView ruleCard={rules[0]} back width={120} />
        </>
      ))}

      {section(`Regelkarten (${rules.length})`, rules.map((r) => <CardView key={r.id} ruleCard={r} width={120} />))}

      {section(`Joker (${jokers.length} Motive)`, jokers.map((c) => <CardView key={c.id} card={c} width={120} />))}

      {section(
        `Farblose & Zahlenlose (${special.length} Motive)`,
        special.map((c) => <CardView key={c.id} card={c} width={120} />),
      )}

      {section(
        `Zustands-Overlay (Karte zählt etwas anderes als aufgedruckt)`,
        numbered.slice(0, 4).map((c, i) => (
          <CardView
            key={'st' + c.id}
            card={c}
            state={{ color: i % 2 ? 'blue' : c.color, value: ((c.value ?? 1) % 9) + 1 }}
            width={120}
          />
        )),
      )}

      {section(`Zahlenkarten (${numbered.length} Motive)`, numbered.map((c) => <CardView key={c.id} card={c} width={96} />))}
    </main>
  )
}

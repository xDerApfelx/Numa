import { JOKER_KINDS, type ActionKind, type Color, type RuleCard } from '../game/types'
import { CardView } from './CardView'

// Interne Sichtprüfung aller Kartentypen: /?gallery
export function Gallery() {
  const colors: Color[] = ['red', 'green', 'blue', 'yellow']
  const actions: ActionKind[] = ['plus', 'minus', 'shield', 'mirror', 'swapColor']
  const rules: RuleCard[] = [
    { id: 'g1', color: 'yellow', parity: 'even', range: 'high', black: false },
    { id: 'g2', color: 'red', parity: null, range: 'low', black: false },
    { id: 'g3', color: 'blue', parity: 'odd', range: 'low', black: false },
    { id: 'g4', color: 'green', parity: null, range: 'mid', black: false },
    { id: 'g5', color: null, parity: null, range: null, black: true },
  ]
  return (
    <main style={{ padding: 32, display: 'grid', gap: 28 }}>
      <section style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {colors.map((c, i) => (
          <CardView key={c} face={{ color: c, value: i * 2 + 1, action: actions[i] }} />
        ))}
        <CardView face={{ color: null, value: 7, action: 'copyColor' }} />
        <CardView face={{ color: 'green', value: null, action: 'copyValue' }} />
      </section>
      <section style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {rules.map((r) => (
          <CardView key={r.id} ruleCard={r} />
        ))}
      </section>
      <section style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {JOKER_KINDS.map((j) => (
          <CardView key={j} joker={j} />
        ))}
      </section>
      <section style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <CardView back arrow="self" />
        <CardView back arrow="left" />
        <CardView back arrow="right" />
        <CardView back />
      </section>
    </main>
  )
}

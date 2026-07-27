import { describe, expect, it } from 'vitest'
import { seatPositions } from './tableLayout'

const at = (positions: ReturnType<typeof seatPositions>, seat: number) =>
  positions.find((p) => p.seat === seat)!

describe('seatPositions', () => {
  it('setzt dich immer unten in die Mitte', () => {
    for (const count of [2, 3, 4, 5, 6]) {
      for (let you = 0; you < count; you++) {
        const me = at(seatPositions(count, you), you)
        expect(me.xPct).toBeCloseTo(50, 5)
        expect(me.yPct).toBeGreaterThan(80) // unten
      }
    }
  })

  it('setzt den linken Nachbarn auf die linke und den rechten auf die rechte Seite', () => {
    const count = 4
    const you = 2
    const pos = seatPositions(count, you)
    const left = at(pos, (you + 1) % count)
    const right = at(pos, (you - 1 + count) % count)
    expect(left.xPct).toBeLessThan(20)
    expect(right.xPct).toBeGreaterThan(80)
  })

  it('markiert bei gerader Spielerzahl genau einen Gegenüber — und zwar oben', () => {
    for (const count of [2, 4, 6]) {
      const pos = seatPositions(count, 0)
      const opposite = pos.filter((p) => p.opposite)
      expect(opposite).toHaveLength(1)
      expect(opposite[0].seat).toBe(count / 2)
      expect(opposite[0].xPct).toBeCloseTo(50, 5)
      expect(opposite[0].yPct).toBeLessThan(20) // oben
    }
  })

  it('kennt bei ungerader Spielerzahl kein Gegenüber', () => {
    for (const count of [3, 5]) {
      expect(seatPositions(count, 0).filter((p) => p.opposite)).toHaveLength(0)
    }
  })

  it('verteilt alle Plätze eindeutig und gleichmäßig', () => {
    for (const count of [2, 3, 4, 5, 6]) {
      const pos = seatPositions(count, 0)
      expect(pos).toHaveLength(count)
      expect(new Set(pos.map((p) => p.seat)).size).toBe(count)
      expect(new Set(pos.map((p) => p.stepsFromYou)).size).toBe(count)
      // Alle liegen innerhalb der Arena
      for (const p of pos) {
        expect(p.xPct).toBeGreaterThanOrEqual(0)
        expect(p.xPct).toBeLessThanOrEqual(100)
        expect(p.yPct).toBeGreaterThanOrEqual(0)
        expect(p.yPct).toBeLessThanOrEqual(100)
      }
    }
  })

  it('hält die Mitte für Regelkarten frei', () => {
    for (const count of [2, 3, 4, 5, 6]) {
      for (const p of seatPositions(count, 0)) {
        const dx = (p.xPct - 50) / 40
        const dy = (p.yPct - 50) / 37
        expect(Math.hypot(dx, dy)).toBeCloseTo(1, 5) // sitzt auf dem Rand
      }
    }
  })
})

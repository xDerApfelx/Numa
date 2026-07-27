import { describe, expect, it } from 'vitest'
import { outwardAngle, pointingAngle, rotatedBounds, seatPositions } from './tableLayout'

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

  it('lässt die Karte exakt auf den Nachbarn zeigen, nicht nur in 90-Grad-Schritten', () => {
    const count = 6
    const you = 0
    const pos = seatPositions(count, you)
    const me = at(pos, you)
    const left = at(pos, 1)
    const angle = pointingAngle(me, left, 1400, 700)
    // schräg nach oben links: zwischen -90 (glatt links) und 0 (glatt hoch)
    expect(angle).toBeGreaterThan(-90)
    expect(angle).toBeLessThan(0)
    // und eben kein glatter 90-Grad-Wert
    expect(Math.abs(angle % 90)).toBeGreaterThan(1)
  })

  it('zeigt bei zwei Spielern genau geradeaus zum Gegenüber', () => {
    const pos = seatPositions(2, 0)
    expect(pointingAngle(at(pos, 0), at(pos, 1), 1000, 600)).toBeCloseTo(0, 5)
    expect(pointingAngle(at(pos, 1), at(pos, 0), 1000, 600)).toBeCloseTo(180, 5)
  })

  it('dreht "auf mich selbst" nach außen vom Tisch weg', () => {
    const pos = seatPositions(4, 0)
    // Du sitzt unten: der Pfeil zeigt nach unten, also aus dem Tisch heraus
    expect(outwardAngle(at(pos, 0), 1000, 600)).toBeCloseTo(180, 5)
    // Der Gegenüber sitzt oben: sein Pfeil zeigt nach oben
    expect(outwardAngle(at(pos, 2), 1000, 600)).toBeCloseTo(0, 5)
  })

  it('berücksichtigt das Seitenverhältnis der Arena', () => {
    const from = { xPct: 50, yPct: 50 }
    const to = { xPct: 100, yPct: 0 }
    // Bei gleichem Prozent-Versatz hängt der optische Winkel von der Fläche ab
    const breit = pointingAngle(from, to, 2000, 500)
    const hoch = pointingAngle(from, to, 500, 2000)
    expect(breit).not.toBeCloseTo(hoch, 1)
    expect(breit).toBeGreaterThan(hoch)
  })

  it('rechnet den Platzbedarf gedrehter Karten aus', () => {
    expect(rotatedBounds(66, 96, 0)).toEqual({ width: 66, height: 96 })
    const quer = rotatedBounds(66, 96, 90)
    expect(quer.width).toBeCloseTo(96, 5)
    expect(quer.height).toBeCloseTo(66, 5)
    // Schräg braucht mehr Platz als beide Seitenlängen
    const schraeg = rotatedBounds(66, 96, 45)
    expect(schraeg.width).toBeGreaterThan(96)
    expect(schraeg.height).toBeGreaterThan(96)
  })

  it('setzt alle Plätze auf den Rand und hält die Mitte für Regelkarten frei', () => {
    for (const count of [2, 3, 4, 5, 6]) {
      for (const p of seatPositions(count, 0, { rx: 48, ry: 48 })) {
        const dx = (p.xPct - 50) / 48
        const dy = (p.yPct - 50) / 48
        expect(Math.hypot(dx, dy)).toBeCloseTo(1, 5)
      }
    }
  })
})

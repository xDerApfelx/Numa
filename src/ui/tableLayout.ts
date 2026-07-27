/**
 * Sitzplätze auf einer Ellipse verteilen — du sitzt immer unten, die anderen
 * im Uhrzeigersinn drumherum, damit "links", "rechts" und "gegenüber" auf
 * einen Blick ablesbar sind.
 *
 * Bildschirm-Koordinaten: x nach rechts, y nach unten. Winkel 90° liegt damit
 * unten, 270° oben. Der linke Nachbar (Sitzplatz + 1, siehe Sitz-Konvention in
 * game/types.ts) landet auf der linken Bildschirmseite.
 */

export interface SeatPosition {
  seat: number
  /** Position in Prozent der Arena-Fläche */
  xPct: number
  yPct: number
  /** Sitzt exakt gegenüber (gibt es nur bei gerader Spielerzahl) */
  opposite: boolean
  /** Abstand zu dir im Uhrzeigersinn: 0 = du, 1 = linker Nachbar */
  stepsFromYou: number
}

export interface EllipseOptions {
  /** Halbachsen in Prozent der Arena */
  rx?: number
  ry?: number
}

export function seatPositions(
  count: number,
  youSeat: number,
  { rx = 40, ry = 37 }: EllipseOptions = {},
): SeatPosition[] {
  const out: SeatPosition[] = []
  for (let seat = 0; seat < count; seat++) {
    const stepsFromYou = (seat - youSeat + count) % count
    const angleDeg = 90 + (stepsFromYou * 360) / count
    const rad = (angleDeg * Math.PI) / 180
    out.push({
      seat,
      xPct: 50 + rx * Math.cos(rad),
      yPct: 50 + ry * Math.sin(rad),
      opposite: count % 2 === 0 && stepsFromYou === count / 2,
      stepsFromYou,
    })
  }
  return out
}

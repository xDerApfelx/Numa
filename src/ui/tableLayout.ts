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

/**
 * Drehwinkel für eine abgelegte Karte, damit ihr Pfeil genau auf den
 * Zielplatz zeigt. Der Pfeil zeigt auf einer ungedrehten Karte nach oben.
 *
 * Die Sitzpositionen sind Prozentwerte, die Arena ist aber breiter als hoch —
 * für den optischen Winkel müssen sie deshalb erst in Pixel umgerechnet
 * werden, sonst zeigt die Karte daneben.
 */
export function pointingAngle(
  from: { xPct: number; yPct: number },
  to: { xPct: number; yPct: number },
  arenaWidth: number,
  arenaHeight: number,
): number {
  const dx = ((to.xPct - from.xPct) / 100) * arenaWidth
  const dy = ((to.yPct - from.yPct) / 100) * arenaHeight
  if (dx === 0 && dy === 0) return 0
  return (Math.atan2(dy, dx) * 180) / Math.PI + 90
}

/**
 * Zeigt die Karte auf den Ablegenden selbst, dreht sie also vom Tischmittel-
 * punkt weg nach außen.
 */
export function outwardAngle(
  pos: { xPct: number; yPct: number },
  arenaWidth: number,
  arenaHeight: number,
): number {
  return pointingAngle({ xPct: 50, yPct: 50 }, pos, arenaWidth, arenaHeight)
}

/** Platzbedarf einer gedrehten Karte — sonst würde sie am Rand beschnitten. */
export function rotatedBounds(width: number, height: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180
  const c = Math.abs(Math.cos(rad))
  const s = Math.abs(Math.sin(rad))
  return { width: width * c + height * s, height: width * s + height * c }
}

// Die Plätze liegen auf dem Rand des Sitzfelds; dass die Karten nicht über
// die Spielfläche hinausragen, regelt die Einrückung des Felds im Stylesheet.
export function seatPositions(
  count: number,
  youSeat: number,
  { rx = 48, ry = 48 }: EllipseOptions = {},
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

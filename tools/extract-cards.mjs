// Extrahiert die Kartengrafiken aus den Druck-PDFs in PDF/ als Vektor-SVG
// nach public/cards/ und generiert src/game/deckData.ts (die echte, im Team
// ausbalancierte Deck-Zusammensetzung).
//
//   node tools/extract-cards.mjs
//
// Braucht das Dev-Dependency "mupdf". Muss nur neu laufen, wenn sich die
// Druckdateien ändern.

import * as mupdf from 'mupdf'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PDF_DIR = path.join(root, 'PDF')
const OUT_DIR = path.join(root, 'public', 'cards')

// Die Druckdateien haben Hash-Präfixe; wir finden sie über das Suffix.
function findPdf(suffix) {
  const hit = fs.readdirSync(PDF_DIR).find((f) => f.toLowerCase().endsWith(suffix))
  if (!hit) throw new Error(`PDF nicht gefunden: *${suffix}`)
  return path.join(PDF_DIR, hit)
}

const FILES = {
  faces: findPdf('aktionskarten_vorderseite.pdf'),
  handBack: findPdf('aktionskarten_rueckseite.pdf'),
  rules: findPdf('regelkarten_vorderseite.pdf'),
  ruleBack: findPdf('regelkarten_rueckseite.pdf'),
  starterFront: findPdf('startspieler_vorderseite.pdf'),
  starterBack: findPdf('startspieler_rueckseite.pdf'),
}

// Endformat 66x96 mm. Die Vorderseiten der Handkarten liegen mit 2 mm
// Beschnittzugabe vor (70x100 mm) und werden auf das Endformat beschnitten.
const MM = 72 / 25.4
const TRIM_W = 66 * MM
const TRIM_H = 96 * MM

const docCache = new Map()
function open(file) {
  if (!docCache.has(file)) {
    docCache.set(file, mupdf.Document.openDocument(fs.readFileSync(file), 'application/pdf'))
  }
  return docCache.get(file)
}

function pageToSvg(file, pageNo) {
  const page = open(file).loadPage(pageNo)
  const buf = new mupdf.Buffer()
  // text=path bettet die Schrift als Pfade ein — die SVGs sind damit
  // eigenständig und brauchen keine Font-Dateien.
  const writer = new mupdf.DocumentWriter(buf, 'svg', 'text=path')
  const dev = writer.beginPage(page.getBounds())
  page.run(dev, mupdf.Matrix.identity)
  writer.endPage()
  writer.close()
  return { svg: buf.asString(), bounds: page.getBounds() }
}

// Beschneidet mittig auf das Endformat und rundet Koordinaten auf zwei
// Nachkommastellen (spart Bytes, unterhalb der sichtbaren Genauigkeit).
function normalizeSvg(raw, bounds) {
  const pageW = bounds[2] - bounds[0]
  const pageH = bounds[3] - bounds[1]
  const dx = (pageW - TRIM_W) / 2
  const dy = (pageH - TRIM_H) / 2
  const vb = [dx.toFixed(3), dy.toFixed(3), TRIM_W.toFixed(3), TRIM_H.toFixed(3)].join(' ')
  // width/height müssen gesetzt bleiben: ohne intrinsische Größe skalieren
  // manche Browser ein <img src="…svg"> nicht zuverlässig.
  const attrs = `width="${TRIM_W.toFixed(3)}" height="${TRIM_H.toFixed(3)}" viewBox="${vb}"`

  return raw
    .replace(/-?\d+\.\d+/g, (x) => String(Math.round(parseFloat(x) * 100) / 100))
    .replace(/(<svg[^>]*?)\swidth="[^"]*"\sheight="[^"]*"\sviewBox="[^"]*"/, `$1 ${attrs}`)
    .replace(/>\s+</g, '><')
    .trim()
}

// Mehrere SVGs teilen sich Element-IDs (clip_1, clip_2 …). Beim Ausliefern
// als eigenständige Dateien ist das unkritisch, beim späteren Inlinen nicht —
// deshalb bekommen die IDs pro Karte ein Präfix.
function namespaceIds(svg, key) {
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
  let out = svg
  for (const id of new Set(ids)) {
    const safe = id.replace(/[^\w-]/g, '')
    const next = `${key}_${safe}`
    out = out
      .replaceAll(`id="${id}"`, `id="${next}"`)
      .replaceAll(`#${id})`, `#${next})`)
      .replaceAll(`href="#${id}"`, `href="#${next}"`)
  }
  return out
}

function writeCard(relPath, file, pageNo) {
  const { svg, bounds } = pageToSvg(file, pageNo)
  const key = relPath.replace(/[^\w]/g, '')
  const finished = namespaceIds(normalizeSvg(svg, bounds), key)
  const full = path.join(OUT_DIR, relPath + '.svg')
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, finished)
  return finished.length
}

// ---- Seiteninhalte bestimmen ----

function pageInfo(file, pageNo) {
  const page = open(file).loadPage(pageNo)
  const st = JSON.parse(page.toStructuredText('preserve-whitespace').asJSON())
  const texts = []
  for (const b of st.blocks ?? []) {
    for (const l of b.lines ?? []) {
      const t = (l.text ?? '').trim()
      if (t) texts.push(t)
    }
  }
  const pix = page.toPixmap(mupdf.Matrix.scale(0.4, 0.4), mupdf.ColorSpace.DeviceRGB, false, true)
  const px = pix.getPixels()
  const w = pix.getWidth()
  const n = pix.getNumberOfComponents()
  const o = (6 * w + 6) * n
  return { text: texts.join(' | '), rgb: [px[o], px[o + 1], px[o + 2]] }
}

const COLOR_BY_RGB = [
  { color: 'red', rgb: [231, 57, 87] },
  { color: 'green', rgb: [48, 171, 83] },
  { color: 'blue', rgb: [0, 131, 151] },
  { color: 'yellow', rgb: [247, 170, 43] },
]

function nearestColor([r, g, b]) {
  let best = null
  let bestD = Infinity
  for (const c of COLOR_BY_RGB) {
    const d = (c.rgb[0] - r) ** 2 + (c.rgb[1] - g) ** 2 + (c.rgb[2] - b) ** 2
    if (d < bestD) {
      bestD = d
      best = c.color
    }
  }
  return bestD < 3000 ? best : null
}

function actionFromText(t) {
  if (/senken/.test(t)) return 'minus'
  if (/erhöhen/.test(t)) return 'plus'
  if (/abwehren/.test(t)) return 'shield'
  if (/reflektieren/.test(t)) return 'mirror'
  if (/Farbe tauschen/.test(t)) return 'swapColor'
  if (/Farbe kopieren/.test(t)) return 'copyColor'
  if (/Wert kopieren/.test(t)) return 'copyValue'
  return null
}

// Die acht Joker liegen am Ende der Datei, je zwei pro Typ, ihre Beschriftung
// ist als Pfad gesetzt und daher nicht auslesbar — Reihenfolge aus der
// Sichtprüfung der gerenderten Seiten.
const JOKER_ORDER = ['secondWins', 'shiftAll', 'onlyOwnAction', 'newRule']

// ---- Extraktion ----

fs.rmSync(OUT_DIR, { recursive: true, force: true })

const numbered = [] // { color, value, action } — 108 Einträge inkl. Kopien
const colorless = [] // { value } — 18
const numberless = [] // { color } — 12
const jokers = [] // { joker } — 8
const written = new Set()
let bytes = 0

const faceCount = open(FILES.faces).countPages()
if (faceCount !== 146) throw new Error(`Erwarte 146 Handkarten-Seiten, gefunden: ${faceCount}`)

for (let p = 0; p < faceCount; p++) {
  if (p >= 138) {
    const joker = JOKER_ORDER[Math.floor((p - 138) / 2)]
    jokers.push({ joker })
    const rel = `joker/${joker}`
    if (!written.has(rel)) {
      bytes += writeCard(rel, FILES.faces, p)
      written.add(rel)
    }
    continue
  }

  const { text, rgb } = pageInfo(FILES.faces, p)
  const action = actionFromText(text)
  const color = nearestColor(rgb)
  const valueMatch = text.match(/\|\s*(\d)\s*\|/) ?? text.match(/(\d)\s*\|\s*\1/)
  const value = valueMatch ? Number(valueMatch[1]) : null

  if (action === 'copyColor') {
    if (value === null) throw new Error(`Farblose Karte ohne Wert auf Seite ${p}`)
    colorless.push({ value })
    const rel = `colorless/${value}`
    if (!written.has(rel)) {
      bytes += writeCard(rel, FILES.faces, p)
      written.add(rel)
    }
  } else if (action === 'copyValue') {
    if (!color) throw new Error(`Zahlenlose Karte ohne Farbe auf Seite ${p}`)
    numberless.push({ color })
    const rel = `numberless/${color}`
    if (!written.has(rel)) {
      bytes += writeCard(rel, FILES.faces, p)
      written.add(rel)
    }
  } else {
    if (!action || !color || value === null) {
      throw new Error(`Seite ${p} nicht erkannt: action=${action} color=${color} value=${value}`)
    }
    numbered.push({ color, value, action })
    const rel = `number/${color}-${value}-${action}`
    if (!written.has(rel)) {
      bytes += writeCard(rel, FILES.faces, p)
      written.add(rel)
    }
  }
}

// Regelkarten: 7 Bedingungen x 4 Farben in fester Reihenfolge, dann 2 schwarze
const RULE_CONDITIONS = [
  { parity: null, range: 'low' },
  { parity: null, range: 'high' },
  { parity: 'even', range: 'high' },
  { parity: 'odd', range: 'high' },
  { parity: 'even', range: 'low' },
  { parity: 'odd', range: 'low' },
  { parity: null, range: 'mid' },
]
const RULE_COLORS = ['red', 'green', 'blue', 'yellow']

const ruleCount = open(FILES.rules).countPages()
if (ruleCount !== 30) throw new Error(`Erwarte 30 Regelkarten-Seiten, gefunden: ${ruleCount}`)

const rules = []
for (let p = 0; p < 30; p++) {
  if (p >= 28) {
    const rel = `rule/black`
    if (!written.has(rel)) {
      bytes += writeCard(rel, FILES.rules, p)
      written.add(rel)
    }
    rules.push({ id: `r-black-${p - 28}`, color: null, parity: null, range: null, black: true })
    continue
  }
  const cond = RULE_CONDITIONS[Math.floor(p / 4)]
  const color = RULE_COLORS[p % 4]
  // Dateiname muss zu ruleArtPath() in src/game/cards.ts passen
  bytes += writeCard(`rule/${color}-${cond.parity ?? 'any'}-${cond.range}`, FILES.rules, p)
  rules.push({ id: `r-${color}-${Math.floor(p / 4)}`, color, ...cond, black: false })
}

bytes += writeCard('back-hand', FILES.handBack, 0)
bytes += writeCard('back-rule', FILES.ruleBack, 0)
bytes += writeCard('starter-front', FILES.starterFront, 0)
bytes += writeCard('starter-back', FILES.starterBack, 0)

// ---- deckData.ts schreiben ----

const freq = {}
for (const c of numbered) freq[c.action] = (freq[c.action] ?? 0) + 1

const ts = `// AUTOMATISCH GENERIERT von tools/extract-cards.mjs — nicht von Hand ändern.
// Quelle: die Druck-PDFs in PDF/. Dies ist die im Team ausbalancierte
// Zuordnung von Aktion zu Farbe/Zahl aus dem physischen Spiel.
import type { Color, JokerKind, NumberAction, Parity, Range } from './types'

export interface NumberedCardData {
  color: Color
  value: number
  action: NumberAction
}

/** Die ${numbered.length} Zahlenkarten inklusive Mehrfach-Exemplaren. */
export const NUMBERED_CARDS: readonly NumberedCardData[] = ${JSON.stringify(numbered)}

/** Werte der ${colorless.length} farblosen Karten (Aktion immer "Farbe kopieren"). */
export const COLORLESS_VALUES: readonly number[] = ${JSON.stringify(colorless.map((c) => c.value))}

/** Farben der ${numberless.length} zahlenlosen Karten (Aktion immer "Wert kopieren"). */
export const NUMBERLESS_COLORS: readonly Color[] = ${JSON.stringify(numberless.map((c) => c.color))}

/** Die ${jokers.length} Joker. */
export const JOKER_CARDS: readonly JokerKind[] = ${JSON.stringify(jokers.map((j) => j.joker))}

export interface RuleCardData {
  id: string
  color: Color | null
  parity: Parity | null
  range: Range | null
  black: boolean
}

/** Die ${rules.length} Regelkarten. */
export const RULE_CARDS: readonly RuleCardData[] = ${JSON.stringify(rules)}

/** Tatsächliche Häufigkeit je Aktion auf den ${numbered.length} Zahlenkarten. */
export const ACTION_FREQUENCIES: Readonly<Record<NumberAction, number>> = ${JSON.stringify(freq)}
`

fs.writeFileSync(path.join(root, 'src', 'game', 'deckData.ts'), ts)

console.log(`Zahlenkarten:   ${numbered.length}`)
console.log(`Farblose:       ${colorless.length}`)
console.log(`Zahlenlose:     ${numberless.length}`)
console.log(`Joker:          ${jokers.length}`)
console.log(`Regelkarten:    ${rules.length}`)
console.log(`SVG-Dateien:    ${written.size + 4}  (${(bytes / 1024 / 1024).toFixed(2)} MB)`)
console.log(`Häufigkeiten:   ${JSON.stringify(freq)}`)

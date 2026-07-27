import { useEffect, useMemo, useRef, useState } from 'react'
import {
  REVEAL_EFFECT_DELAY_MS,
  REVEAL_FLIP_MS,
  REVEAL_STEP_MS,
} from '../game/config'
import { visibleSteps, type ResolutionStep } from '../game/resolve'
import { isJoker, type AnyCard, type Direction, type HandCard } from '../game/types'
import type { NumaClient } from '../net/client'
import type { NumaHost } from '../net/host'
import type { PublicState } from '../net/protocol'
import { ActionEffect, effectFor } from './ActionEffect'
import { actionLabel, CardView, jokerLabel, ruleLabel, type CardState } from './CardView'
import { outwardAngle, pointingAngle, seatPositions } from './tableLayout'
import { useElementSize } from './useElementSize'

/** Je Sitzplatz: die dort liegende Karte und was sie aktuell zählt. */
type FaceMap = Record<string, { card: HandCard; state: CardState }>

/** Fortschritt der Aufdeck-Animation. */
interface RevealProgress {
  /** Wie viele Karten sind schon umgedreht */
  flipped: number
  /** Wie viele Schritte sind angekündigt (Beschriftung sichtbar) */
  announced: number
  /** Wie viele Schritte haben sich schon ausgewirkt (Werte geändert) */
  applied: number
  done: boolean
}

const IDLE: RevealProgress = { flipped: 0, announced: 0, applied: 0, done: false }

/**
 * Spielt das Aufdecken als Zeitplan ab: erst drehen sich die Karten
 * nacheinander um, dann bekommt jede Aktion erst eine Ankündigung und kurz
 * darauf ihre Auswirkung. So ist jeder Zug ein eigener Moment.
 */
function useRevealProgress(active: boolean, roundKey: number, playerCount: number, stepCount: number) {
  const [progress, setProgress] = useState<RevealProgress>(IDLE)

  useEffect(() => {
    if (!active) {
      setProgress(IDLE)
      return
    }
    setProgress(IDLE)

    const timers: ReturnType<typeof setTimeout>[] = []
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms))

    for (let i = 1; i <= playerCount; i++) {
      at(i * REVEAL_FLIP_MS, () => setProgress((p) => ({ ...p, flipped: i })))
    }

    const stepsStart = playerCount * REVEAL_FLIP_MS
    for (let k = 0; k < stepCount; k++) {
      at(stepsStart + k * REVEAL_STEP_MS, () => setProgress((p) => ({ ...p, announced: k + 1 })))
      at(stepsStart + k * REVEAL_STEP_MS + REVEAL_EFFECT_DELAY_MS, () =>
        setProgress((p) => ({ ...p, applied: k + 1 })),
      )
    }
    at(stepsStart + stepCount * REVEAL_STEP_MS, () => setProgress((p) => ({ ...p, done: true })))

    return () => timers.forEach(clearTimeout)
  }, [active, roundKey, playerCount, stepCount])

  return progress
}

export function GameTable({
  pub,
  hand,
  youId,
  host,
  client,
  onLeave,
}: {
  pub: PublicState
  hand: AnyCard[]
  youId: string
  host: NumaHost | null
  client: NumaClient | null
  onLeave: () => void
}) {
  const playerCount = pub.players.length
  const youSeat = Math.max(0, pub.players.findIndex((p) => p.id === youId))
  const you = pub.players[youSeat]
  const nameOf = (id: string) => pub.players.find((p) => p.id === id)?.name ?? id

  // ---- Zug-Auswahl ----
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [jokerId, setJokerId] = useState<string | null>(null)
  const [direction, setDirection] = useState<Direction | null>(null)
  const [jokerDirection, setJokerDirection] = useState<Direction>('self')
  const [blackSelection, setBlackSelection] = useState<Set<string>>(new Set())

  const myTurn = pub.phase === 'playing' && pub.players[pub.turnIndex]?.id === youId && !you?.hasPlayed
  const selectedCard = hand.find((c) => c.id === selectedId) ?? null
  const selectedJoker = hand.find((c) => c.id === jokerId) ?? null
  const onlyJokersInHand = hand.length > 0 && hand.every((c) => isJoker(c))
  const needsJokerDirection = selectedJoker && isJoker(selectedJoker) && selectedJoker.joker === 'shiftAll'

  useEffect(() => {
    // Auswahl zurücksetzen, wenn eine neue Runde beginnt oder der Zug raus ist
    setSelectedId(null)
    setJokerId(null)
    setDirection(null)
    setJokerDirection('self')
    setBlackSelection(new Set())
  }, [pub.round, pub.phase, you?.hasPlayed])

  const send = (fn: () => void) => {
    try {
      fn()
    } catch {
      // Engine hat den Zug abgelehnt — der nächste State-Broadcast räumt auf
    }
  }

  const playCard = () => {
    if (!selectedCard || !direction) return
    const ev = {
      cardId: selectedCard.id,
      direction,
      jokerId,
      jokerDirection: jokerId ? (needsJokerDirection ? jokerDirection : 'self') : null,
    }
    if (host) {
      send(() => host.applyLocal({ type: 'play', playerId: youId, ...ev }))
    } else {
      client?.send({ t: 'play', ...ev })
    }
  }

  const sendBlackDiscard = () => {
    const cardIds = [...blackSelection]
    if (host) {
      send(() => host.applyLocal({ type: 'blackDiscard', playerId: youId, cardIds }))
    } else {
      client?.send({ t: 'blackDiscard', cardIds })
    }
  }

  // ---- Aufdecken ----
  const steps = useMemo(() => visibleSteps(pub.resolution?.steps ?? []), [pub.resolution])
  const revealing = pub.phase === 'reveal'
  const progress = useRevealProgress(revealing, pub.round, playerCount, steps.length)

  // Karten drehen sich in Sitzreihenfolge ab dem Startspieler um
  const flipOrder = useMemo(
    () => Array.from({ length: playerCount }, (_, k) => (pub.startIndex + k) % playerCount),
    [playerCount, pub.startIndex],
  )
  const isFaceUp = (seat: number) => revealing && flipOrder.indexOf(seat) < progress.flipped

  // Zustand je Sitzplatz nach den bereits ausgewirkten Schritten
  const faces: FaceMap = useMemo(() => {
    const map: FaceMap = {}
    if (!pub.revealed) return map
    const seatIds = pub.players.map((p) => p.id)
    pub.revealed.forEach((p, seat) => {
      map[seatIds[seat]] = { card: p.card, state: { color: p.card.color, value: p.card.value } }
    })
    for (let k = 0; k < Math.min(progress.applied, steps.length); k++) {
      const s = steps[k]
      if (s.type === 'shiftAll' && s.direction !== 'self') {
        const n = seatIds.length
        const rotated: FaceMap = {}
        seatIds.forEach((id, seat) => {
          const target = s.direction === 'left' ? (seat + 1) % n : (seat - 1 + n) % n
          rotated[seatIds[target]] = map[id]
        })
        Object.assign(map, rotated)
      } else if (s.type === 'action' || s.type === 'reflected') {
        for (const ch of s.changes) {
          const entry = map[ch.playerId]
          if (entry) map[ch.playerId] = { ...entry, state: { color: ch.after.color, value: ch.after.value } }
        }
      }
    }
    return map
  }, [pub.revealed, pub.players, steps, progress.applied])

  const currentStep = revealing && progress.announced > 0 ? steps[progress.announced - 1] : null
  // Der Effekt läuft, sobald sich der angekündigte Schritt ausgewirkt hat
  const activeEffect =
    currentStep && progress.applied === progress.announced ? effectFor(currentStep) : null

  const caption = (s: ResolutionStep | null): string => {
    if (!s) return progress.flipped < playerCount ? 'Aufdecken …' : 'Und jetzt der Reihe nach …'
    switch (s.type) {
      case 'jokerReveal':
        return `${nameOf(s.playerId)}: Joker „${jokerLabel(s.joker)}“ ${s.active ? 'ist aktiv!' : 'verfällt'}`
      case 'shiftAll':
        return `Alle Karten wandern nach ${s.direction === 'left' ? 'links' : 'rechts'}`
      case 'ruleSwap':
        return 'Die Regelkarte wird ausgetauscht!'
      case 'action':
        return s.actorId === s.targetId
          ? `${nameOf(s.actorId)}: ${actionLabel(s.action)}`
          : `${nameOf(s.actorId)}: ${actionLabel(s.action)} → ${nameOf(s.targetId)}`
      case 'blocked':
        return `${nameOf(s.shieldOwnerId)} wehrt die Aktion von ${nameOf(s.actorId)} ab`
      case 'reflected':
        return `${nameOf(s.mirrorOwnerId)} spiegelt die Aktion zurück auf ${nameOf(s.actorId)}`
      case 'fizzle':
        return s.reason === 'suppressed'
          ? `${nameOf(s.actorId)}: Aktion wird unterdrückt`
          : `${nameOf(s.actorId)}: ${actionLabel(s.action)} verpufft`
    }
  }

  // Anzeige-Regel: während des Aufdeckens die Regel, gegen die gewertet wird
  const shownRule = revealing && pub.resolution ? pub.resolution.finalRule : pub.rule

  const highlightIds = new Set<string>()
  if (currentStep) {
    if ('actorId' in currentStep) highlightIds.add(currentStep.actorId)
    if ('targetId' in currentStep) highlightIds.add(currentStep.targetId)
    if ('playerId' in currentStep) highlightIds.add(currentStep.playerId)
  }

  const seatColor = (id: string) => {
    // Sitzfarben aus der Numa-Palette (Logo-Farben plus das Joker-Violett)
    const palette = ['#ec3959', '#008295', '#24b457', '#f9ab2c', '#9867ab', '#a49fab']
    return palette[pub.players.findIndex((p) => p.id === id) % palette.length]
  }

  const positions = useMemo(() => seatPositions(playerCount, youSeat), [playerCount, youSeat])

  // Echte Pixelmaße der Spielfläche — nur damit zeigen die Karten wirklich auf
  // den Nachbarn statt bloß grob nach links oder rechts.
  const arenaRef = useRef<HTMLDivElement>(null)
  const arena = useElementSize(arenaRef)

  /** Winkel, in dem die Karte von `seat` aus in `direction` zeigen muss. */
  const cardAngle = (seat: number, direction: Direction): number => {
    if (!arena.width || !arena.height) return 0
    const from = positions[seat]
    if (!from) return 0
    if (direction === 'self') return outwardAngle(from, arena.width, arena.height)
    const targetSeat =
      direction === 'left' ? (seat + 1) % playerCount : (seat - 1 + playerCount) % playerCount
    return pointingAngle(from, positions[targetSeat], arena.width, arena.height)
  }

  /** Richtung vom Sitzplatz zur Tischmitte — dorthin rückt der Ist-Wert. */
  const towardCenter = (seat: number) => {
    const pos = positions[seat]
    if (!pos || !arena.width) return null
    const dx = ((50 - pos.xPct) / 100) * arena.width
    const dy = ((50 - pos.yPct) / 100) * arena.height
    const len = Math.hypot(dx, dy) || 1
    return { x: dx / len, y: dy / len }
  }

  /** Mittelpunkt eines Sitzplatzes in Pixeln, für die Verbindungslinie. */
  const seatPoint = (playerId: string) => {
    const seat = pub.players.findIndex((p) => p.id === playerId)
    const pos = positions[seat]
    if (!pos) return null
    return { x: (pos.xPct / 100) * arena.width, y: (pos.yPct / 100) * arena.height }
  }

  // Beim Aufdecken den Blick führen: Verbindung vom Handelnden zur Zielkarte
  const connector = (() => {
    if (!currentStep || !arena.width) return null
    let fromId: string | null = null
    let toId: string | null = null
    if (currentStep.type === 'action' && currentStep.actorId !== currentStep.targetId) {
      fromId = currentStep.actorId
      toId = currentStep.targetId
    } else if (currentStep.type === 'blocked') {
      fromId = currentStep.actorId
      toId = currentStep.shieldOwnerId
    } else if (currentStep.type === 'reflected') {
      fromId = currentStep.mirrorOwnerId
      toId = currentStep.actorId
    }
    if (!fromId || !toId) return null
    const a = seatPoint(fromId)
    const b = seatPoint(toId)
    return a && b ? { a, b } : null
  })()

  // ---- Spielende ----
  if (pub.phase === 'gameOver') {
    const ranking = [...pub.players].sort((a, b) => b.score - a.score)
    return (
      <main className="screen">
        <h1 style={{ fontSize: 40 }}>{nameOf(pub.winnerId ?? '')} gewinnt!</h1>
        <div className="panel" style={{ width: 'min(92vw, 380px)', display: 'grid', gap: 8 }}>
          {ranking.map((p, i) => (
            <div key={p.id} className="player-row">
              <span style={{ color: 'var(--ink-dim)', width: 20 }}>{i + 1}.</span>
              <span className="player-name">
                {p.name}
                {p.id === youId && <span className="you-tag"> (du)</span>}
              </span>
              <strong>{p.score}</strong>
            </div>
          ))}
        </div>
        {host ? (
          <button className="btn btn-primary" onClick={() => host.backToLobby()}>
            Zurück zur Lobby
          </button>
        ) : (
          <p className="waiting-note">Der Host kann eine neue Runde starten …</p>
        )}
        <button className="btn btn-small" onClick={onLeave}>
          Verlassen
        </button>
      </main>
    )
  }

  const stagedCards = [selectedCard, selectedJoker].filter(Boolean) as AnyCard[]

  const renderSeatCard = (seat: number) => {
    const player = pub.players[seat]
    const isYou = player.id === youId

    // Eigene Auswahl liegt schon auf dem Tisch, bevor sie abgeschickt wird —
    // sobald eine Richtung gewählt ist, dreht sie sich schon mal dorthin.
    if (isYou && myTurn && stagedCards.length > 0) {
      return (
        <div className="seat-cards staged">
          {stagedCards.map((c, i) => (
            <CardView
              key={c.id}
              card={c}
              width={110}
              angleDeg={
                i === 0
                  ? direction
                    ? cardAngle(seat, direction)
                    : 0
                  : needsJokerDirection
                    ? cardAngle(seat, jokerDirection)
                    : 0
              }
            />
          ))}
        </div>
      )
    }

    // Auch nach dem Aufdecken bleibt die Karte in ihre Richtung gedreht —
    // sonst wäre nicht mehr erkennbar, auf wen sie gezeigt hat.
    if (pub.revealed && isFaceUp(seat)) {
      const entry = faces[player.id]
      const played = pub.revealed[seat]
      return (
        <div className="seat-cards">
          {entry && (
            <CardView
              width={110}
              card={entry.card}
              state={entry.state}
              stateOffset={towardCenter(seat)}
              angleDeg={played ? cardAngle(seat, played.direction) : 0}
            />
          )}
          {played?.joker && (
            <CardView width={72} card={played.joker.card} angleDeg={cardAngle(seat, played.joker.direction)} />
          )}
        </div>
      )
    }

    if (player.playedBack) {
      return (
        <div className="seat-cards">
          <CardView width={110} back angleDeg={cardAngle(seat, player.playedBack.direction)} />
          {player.playedBack.jokerDirection !== null && (
            <CardView width={72} back angleDeg={cardAngle(seat, player.playedBack.jokerDirection)} />
          )}
        </div>
      )
    }
    return (
      <div className="seat-cards">
        <CardView width={110} />
      </div>
    )
  }

  return (
    <main className="table-screen">
      <header className="table-header">
        <span className="round-chip">Runde {pub.round}</span>
        <span className="round-chip dim">
          {pub.options.targetScore > 0 ? `Ziel: ${pub.options.targetScore} Regelkarten` : 'Endlosspiel'}
        </span>

        {/* Was gerade passiert, steht in der Kopfzeile — dort ist Platz frei
            und es nimmt dem Spieltisch keine Höhe weg. */}
        <div className="table-status">
          {revealing && !progress.done && <span className="step-caption">{caption(currentStep)}</span>}
          {revealing &&
            progress.done &&
            (pub.lastWinnerId ? (
              <span className="round-banner win">
                {nameOf(pub.lastWinnerId)} gewinnt die Runde
                {pub.lastPoolWin > 0
                  ? ` und räumt ${pub.lastPoolWin} Pool-Karte${pub.lastPoolWin > 1 ? 'n' : ''} ab!`
                  : '!'}
              </span>
            ) : (
              <span className="round-banner tie">Unentschieden — Regelkarte wandert in den Pool</span>
            ))}
          {pub.phase === 'playing' && (
            <span className="step-caption dim">
              {myTurn
                ? onlyJokersInHand
                  ? 'Nur Joker auf der Hand — wirf einen ab'
                  : selectedCard
                    ? 'Wohin zeigt der Pfeil?'
                    : 'Du bist dran — wähle eine Karte'
                : `${nameOf(pub.players[pub.turnIndex]?.id ?? '')} ist dran …`}
            </span>
          )}
        </div>

        <button className="btn btn-small" style={{ marginLeft: 'auto' }} onClick={onLeave}>
          Verlassen
        </button>
      </header>

      <div className={`table-arena seats-${playerCount}`}>
        {/* Die Sitze liegen in einem eingerückten Feld, damit die Karten am
            oberen und unteren Rand vollständig Platz haben. */}
        <div className="seat-field" ref={arenaRef}>
        {/* Führt den Blick beim Aufdecken vom Handelnden zur betroffenen Karte */}
        {connector && (
          <svg className="table-connector" viewBox={`0 0 ${arena.width} ${arena.height}`} aria-hidden="true">
            <defs>
              <marker id="conn-tip" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                <path d="M0 0 L9 4.5 L0 9 Z" fill="var(--accent)" />
              </marker>
            </defs>
            <line
              x1={connector.a.x}
              y1={connector.a.y}
              x2={connector.b.x}
              y2={connector.b.y}
              markerEnd="url(#conn-tip)"
            />
          </svg>
        )}

        {/* Der Effekt sitzt mitten auf der Verbindungslinie — da schaut man
            beim Aufdecken ohnehin hin. Ohne Linie liegt er auf der Karte. */}
        {activeEffect &&
          (() => {
            const target = seatPoint(activeEffect.playerId)
            if (!target) return null
            const at = connector
              ? { x: (connector.a.x + connector.b.x) / 2, y: (connector.a.y + connector.b.y) / 2 }
              : target
            return (
              <div className="effect-layer" style={{ left: at.x, top: at.y }}>
                <ActionEffect effect={activeEffect} />
              </div>
            )
          })()}

        {positions.map((pos) => {
          const player = pub.players[pos.seat]
          const isYou = player.id === youId
          const isTurn = pub.phase === 'playing' && pos.seat === pub.turnIndex

          // Während eines Aufdeck-Schritts treten Unbeteiligte zurück
          const faded = revealing && currentStep !== null && !highlightIds.has(player.id)
          return (
            <div
              key={player.id}
              className={[
                'seat',
                isYou && 'seat-you',
                isTurn && 'turn',
                highlightIds.has(player.id) && 'highlight',
                faded && 'faded',
                pos.opposite && 'opposite',
                // Namen liegen immer außen am Kreis, nie zur Tischmitte hin
                pos.yPct < 50 && 'name-above',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%` }}
            >
              <div className={`seat-stack${isYou && myTurn && selectedCard ? ' picking' : ''}`}>
                {isYou && myTurn && selectedCard ? (
                  // Karte bleibt in der Mitte, die Richtungen liegen drumherum
                  <div className="picker">
                    <div className="pick-card">{renderSeatCard(pos.seat)}</div>
                    <button
                      className={`btn btn-small pick-left ${direction === 'left' ? 'toggle on' : ''}`}
                      onClick={() => setDirection('left')}
                    >
                      ◀ Links
                    </button>
                    <button
                      className={`btn btn-small pick-right ${direction === 'right' ? 'toggle on' : ''}`}
                      onClick={() => setDirection('right')}
                    >
                      Rechts ▶
                    </button>
                    <div className="pick-actions">
                      <button
                        className={`btn btn-small ${direction === 'self' ? 'toggle on' : ''}`}
                        onClick={() => setDirection('self')}
                      >
                        ▼ Auf mich
                      </button>
                      {needsJokerDirection && (
                        <>
                          <span className="joker-note">Joker</span>
                          <button
                            className={`btn btn-small ${jokerDirection === 'left' ? 'toggle on' : ''}`}
                            onClick={() => setJokerDirection('left')}
                          >
                            ◀
                          </button>
                          <button
                            className={`btn btn-small ${jokerDirection === 'right' ? 'toggle on' : ''}`}
                            onClick={() => setJokerDirection('right')}
                          >
                            ▶
                          </button>
                        </>
                      )}
                      <button
                        className="btn btn-small pick-undo"
                        title="Auswahl zurücknehmen"
                        onClick={() => {
                          setSelectedId(null)
                          setJokerId(null)
                          setDirection(null)
                        }}
                      >
                        ✕
                      </button>
                      <button className="btn btn-primary btn-small" disabled={!direction} onClick={playCard}>
                        Karte legen
                      </button>
                    </div>
                  </div>
                ) : (
                  renderSeatCard(pos.seat)
                )}
              </div>

              <div className="seat-info">
                <svg width="16" height="20" viewBox="0 0 20 24" aria-hidden="true">
                  <path d="M10 1 L17 20 Q10 25 3 20 Z" fill={seatColor(player.id)} />
                </svg>
                <span className="player-name">
                  {player.name}
                  {isYou && <span className="you-tag"> (du)</span>}
                </span>
                <span className="score-chip">{player.score}</span>
                {isTurn && <TurnDot />}
              </div>
            </div>
          )
        })}
        </div>

        {/* Nur die Regelkarten stehen in der Tischmitte — Beschriftungen
            würden sonst mit den Sitzplätzen kollidieren. */}
        <div className="table-core">
          <div className="rule-area">
            <div className="rule-current">
              <CardView width={112} ruleCard={shownRule} label={`Regelkarte: ${ruleLabel(shownRule)}`} />
            </div>
            <div className="rule-side">
              <div className="rule-preview">
                {pub.preview ? (
                  <CardView width={74} ruleCard={pub.preview} dimmed label={`Vorschau: ${ruleLabel(pub.preview)}`} />
                ) : (
                  <CardView width={74} />
                )}
              </div>
              {pub.poolSize > 0 && (
                <div className="pool-badge" title="Regelkarten im Pool (Pool Extrem)">
                  Pool {pub.poolSize}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <section className="hand-area">
        <div className="hand">
          {hand
            .filter((c) => c.id !== selectedId && c.id !== jokerId)
            .map((c) => {
              const jokerPickable = myTurn && !onlyJokersInHand && selectedCard && pub.options.jokersEnabled
              if (isJoker(c)) {
                return (
                  <CardView
                    key={c.id}
                    width={92}
                    card={c}
                    dimmed={!myTurn || (!onlyJokersInHand && !jokerPickable)}
                    onClick={
                      myTurn
                        ? () => {
                            if (onlyJokersInHand) setSelectedId(c.id)
                            else if (selectedCard) setJokerId(c.id)
                          }
                        : undefined
                    }
                  />
                )
              }
              return (
                <CardView
                  key={c.id}
                  width={92}
                  card={c}
                  dimmed={!myTurn}
                  onClick={myTurn ? () => setSelectedId(c.id) : undefined}
                />
              )
            })}
        </div>
      </section>

      {pub.phase === 'blackRule' && (
        <div className="modal-backdrop">
          <div className="panel black-modal">
            <h2>Schwarze Regelkarte</h2>
            <p style={{ color: 'var(--ink-dim)' }}>
              Wirf beliebig viele Handkarten ab — du ziehst genauso viele nach.
            </p>
            {pub.blackDone[youSeat] ? (
              <p className="waiting-note">Warten auf die anderen …</p>
            ) : (
              <>
                <div className="hand modal-hand">
                  {hand.map((c) => (
                    <CardView
                      key={c.id}
                      width={72}
                      card={c}
                      selected={blackSelection.has(c.id)}
                      onClick={() =>
                        setBlackSelection((prev) => {
                          const next = new Set(prev)
                          if (next.has(c.id)) next.delete(c.id)
                          else next.add(c.id)
                          return next
                        })
                      }
                    />
                  ))}
                </div>
                <button className="btn btn-primary" onClick={sendBlackDiscard}>
                  {blackSelection.size > 0 ? `${blackSelection.size} Karte(n) tauschen` : 'Nichts tauschen'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

/** Der rote Punkt des Logos als Zug-Anzeige */
function TurnDot() {
  return <span className="turn-dot" aria-label="ist am Zug" />
}

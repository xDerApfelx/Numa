import { useEffect, useMemo, useState } from 'react'
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
import { actionLabel, CardView, jokerLabel, type CardState } from './CardView'
import { seatPositions } from './tableLayout'

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

    // Eigene Auswahl liegt schon auf dem Tisch, bevor sie abgeschickt wird
    if (isYou && myTurn && stagedCards.length > 0) {
      return (
        <div className="seat-cards staged">
          {stagedCards.map((c) => (
            <CardView key={c.id} card={c} width={78} />
          ))}
        </div>
      )
    }

    if (pub.revealed && isFaceUp(seat)) {
      const entry = faces[player.id]
      const playedJoker = pub.revealed[seat]?.joker
      return (
        <div className="seat-cards">
          {entry && <CardView width={78} card={entry.card} state={entry.state} />}
          {playedJoker && <CardView width={52} card={playedJoker.card} />}
        </div>
      )
    }

    if (player.playedBack) {
      return (
        <div className="seat-cards">
          <CardView width={78} back arrow={player.playedBack.direction} />
          {player.playedBack.jokerDirection !== null && (
            <CardView width={52} back arrow={player.playedBack.jokerDirection} />
          )}
        </div>
      )
    }
    return (
      <div className="seat-cards">
        <CardView width={78} />
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
        <span className="round-chip dim">Nachziehstapel: {pub.drawCount}</span>
        <button className="btn btn-small" style={{ marginLeft: 'auto' }} onClick={onLeave}>
          Verlassen
        </button>
      </header>

      <div className="table-arena">
        {positions.map((pos) => {
          const player = pub.players[pos.seat]
          const isYou = player.id === youId
          const isTurn = pub.phase === 'playing' && pos.seat === pub.turnIndex
          const effect = activeEffect?.playerId === player.id ? activeEffect : null
          return (
            <div
              key={player.id}
              className={[
                'seat',
                isYou && 'seat-you',
                isTurn && 'turn',
                highlightIds.has(player.id) && 'highlight',
                pos.opposite && 'opposite',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%` }}
            >
              <div className="seat-stack">
                {renderSeatCard(pos.seat)}
                {effect && <ActionEffect effect={effect} />}
                {isYou && myTurn && selectedCard && (
                  <div className="seat-controls">
                    <div className="direction-row">
                      {(
                        [
                          ['left', '◀ Links'],
                          ['self', 'Auf mich'],
                          ['right', 'Rechts ▶'],
                        ] as [Direction, string][]
                      ).map(([dir, label]) => (
                        <button
                          key={dir}
                          className={`btn btn-small ${direction === dir ? 'toggle on' : ''}`}
                          onClick={() => setDirection(dir)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {needsJokerDirection && (
                      <div className="direction-row">
                        <span className="joker-note">Joker richtet sich auf</span>
                        <button
                          className={`btn btn-small ${jokerDirection === 'left' ? 'toggle on' : ''}`}
                          onClick={() => setJokerDirection('left')}
                        >
                          ◀ Links
                        </button>
                        <button
                          className={`btn btn-small ${jokerDirection === 'right' ? 'toggle on' : ''}`}
                          onClick={() => setJokerDirection('right')}
                        >
                          Rechts ▶
                        </button>
                      </div>
                    )}
                    <button className="btn btn-primary btn-small" disabled={!direction} onClick={playCard}>
                      Karte legen
                    </button>
                  </div>
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

        <div className="table-core">
          <div className="rule-area">
            <div className="rule-current">
              <span className="field-label">Regelkarte</span>
              <CardView width={112} ruleCard={shownRule} />
            </div>
            <div className="rule-side">
              <div className="rule-preview">
                <span className="field-label">Vorschau</span>
                {pub.preview ? <CardView width={74} ruleCard={pub.preview} dimmed /> : <CardView width={74} />}
              </div>
              {pub.poolSize > 0 && (
                <div className="pool-badge" title="Regelkarten im Pool (Pool Extrem)">
                  Pool {pub.poolSize}
                </div>
              )}
            </div>
          </div>

          {revealing && <p className="step-caption">{caption(currentStep)}</p>}
          {revealing && progress.done && (
            pub.lastWinnerId ? (
              <div className="round-banner win">
                {nameOf(pub.lastWinnerId)} gewinnt die Runde
                {pub.lastPoolWin > 0
                  ? ` und räumt ${pub.lastPoolWin} Pool-Karte${pub.lastPoolWin > 1 ? 'n' : ''} ab!`
                  : '!'}
              </div>
            ) : (
              <div className="round-banner tie">Unentschieden — die Regelkarte wandert in den Pool</div>
            )
          )}
          {pub.phase === 'playing' && (
            <p className="step-caption dim">
              {myTurn
                ? onlyJokersInHand
                  ? 'Nur Joker auf der Hand — wirf einen ab'
                  : selectedCard
                    ? 'Wohin zeigt der Pfeil?'
                    : 'Du bist dran — wähle eine Karte'
                : `${nameOf(pub.players[pub.turnIndex]?.id ?? '')} ist dran …`}
            </p>
          )}
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
        {myTurn && selectedCard && (
          <button
            className="btn btn-small hand-undo"
            onClick={() => {
              setSelectedId(null)
              setJokerId(null)
              setDirection(null)
            }}
          >
            Auswahl zurücknehmen
          </button>
        )}
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

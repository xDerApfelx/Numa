import { useEffect, useMemo, useState } from 'react'
import type { ResolutionStep } from '../game/resolve'
import { isJoker, type AnyCard, type Direction, type JokerCard } from '../game/types'
import type { NumaClient } from '../net/client'
import type { NumaHost } from '../net/host'
import type { PublicState } from '../net/protocol'
import { actionLabel, CardView, jokerLabel, type CardFaceProps } from './CardView'

const STEP_MS = 1100

type FaceMap = Record<string, CardFaceProps>

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
  const youSeat = Math.max(0, pub.players.findIndex((p) => p.id === youId))
  const you = pub.players[youSeat]
  const nameOf = (id: string) => pub.players.find((p) => p.id === id)?.name ?? id

  // ---- Zug-Auswahl ----
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [jokerId, setJokerId] = useState<string | null>(null)
  const [blackSelection, setBlackSelection] = useState<Set<string>>(new Set())

  const myTurn = pub.phase === 'playing' && pub.players[pub.turnIndex]?.id === youId && !you?.hasPlayed
  const selectedCard = hand.find((c) => c.id === selectedId) ?? null
  const selectedJoker = hand.find((c) => c.id === jokerId) ?? null
  const onlyJokersInHand = hand.length > 0 && hand.every((c) => isJoker(c))

  useEffect(() => {
    // Auswahl zurücksetzen, wenn eine neue Runde beginnt oder der Zug raus ist
    setSelectedId(null)
    setJokerId(null)
    setBlackSelection(new Set())
  }, [pub.round, pub.phase, you?.hasPlayed])

  const send = (fn: () => void) => {
    try {
      fn()
    } catch {
      // Engine hat den Zug abgelehnt — der nächste State-Broadcast räumt auf
    }
  }

  const playCard = (direction: Direction, jokerDirection: Direction | null) => {
    if (!selectedCard) return
    const ev = {
      cardId: selectedCard.id,
      direction,
      jokerId,
      jokerDirection,
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

  // ---- Reveal-Animation: Steps nacheinander abspielen ----
  const steps = useMemo(
    () => (pub.resolution?.steps ?? []).filter((s) => !(s.type === 'fizzle' && s.reason === 'passive')),
    [pub.resolution],
  )
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    setStepIndex(0)
    if (pub.phase !== 'reveal' || steps.length === 0) return
    const t = setInterval(() => {
      setStepIndex((i) => {
        if (i >= steps.length) {
          clearInterval(t)
          return i
        }
        return i + 1
      })
    }, STEP_MS)
    return () => clearInterval(t)
  }, [pub.phase, pub.round, steps])

  // Karten-Gesichter je Spieler nach den ersten `stepIndex` Steps
  const faces: FaceMap = useMemo(() => {
    const map: FaceMap = {}
    if (!pub.revealed) return map
    const seatIds = pub.players.map((p) => p.id)
    pub.revealed.forEach((p, seat) => {
      map[seatIds[seat]] = { color: p.card.color, value: p.card.value, action: p.card.action }
    })
    for (let k = 0; k < Math.min(stepIndex, steps.length); k++) {
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
          map[ch.playerId] = { ...map[ch.playerId], color: ch.after.color, value: ch.after.value }
        }
      }
    }
    return map
  }, [pub.revealed, pub.players, steps, stepIndex])

  const revealDone = pub.phase === 'reveal' && stepIndex >= steps.length
  const currentStep = pub.phase === 'reveal' && stepIndex > 0 ? steps[stepIndex - 1] : null

  const caption = (s: ResolutionStep | null): string => {
    if (!s) return 'Aufdecken …'
    switch (s.type) {
      case 'jokerReveal':
        return `${nameOf(s.playerId)}: Joker „${jokerLabel(s.joker)}" ${s.active ? 'ist aktiv!' : 'verfällt'}`
      case 'shiftAll':
        return `Alle Karten wandern nach ${s.direction === 'left' ? 'links' : 'rechts'}`
      case 'ruleSwap':
        return 'Die Regelkarte wird ausgetauscht!'
      case 'action':
        return s.actorId === s.targetId
          ? `${nameOf(s.actorId)}: ${actionLabel(s.action)}`
          : `${nameOf(s.actorId)}: ${actionLabel(s.action)} → ${nameOf(s.targetId)}`
      case 'blocked':
        return `${nameOf(s.shieldOwnerId)} blockt die Aktion von ${nameOf(s.actorId)}`
      case 'reflected':
        return `${nameOf(s.mirrorOwnerId)} spiegelt die Aktion zurück auf ${nameOf(s.actorId)}`
      case 'fizzle':
        return s.reason === 'suppressed'
          ? `${nameOf(s.actorId)}: Aktion wird unterdrückt`
          : `${nameOf(s.actorId)}: ${actionLabel(s.action)} verpufft`
    }
  }

  // Anzeige-Regel: während des Reveals die Regel, gegen die gewertet wird
  const shownRule = pub.phase === 'reveal' && pub.resolution ? pub.resolution.finalRule : pub.rule

  const highlightIds = new Set<string>()
  if (currentStep) {
    if ('actorId' in currentStep) highlightIds.add(currentStep.actorId)
    if ('targetId' in currentStep) highlightIds.add(currentStep.targetId)
    if ('playerId' in currentStep) highlightIds.add(currentStep.playerId)
  }

  // Gegner in Sitzreihenfolge ab deinem linken Nachbarn
  const opponents = pub.players
    .map((_, i) => pub.players[(youSeat + 1 + i) % pub.players.length])
    .slice(0, pub.players.length - 1)

  const seatColor = (id: string) => {
    const palette = ['#e6403a', '#2e9bd6', '#3fb54a', '#f5a028', '#8a63c9', '#a49fab']
    return palette[pub.players.findIndex((p) => p.id === id) % palette.length]
  }

  const renderPlayed = (playerId: string) => {
    const seat = pub.players.findIndex((p) => p.id === playerId)
    const player = pub.players[seat]
    if (pub.revealed) {
      const face = faces[playerId]
      const playedJoker = pub.revealed[seat]?.joker
      return (
        <div className={`played-slot ${highlightIds.has(playerId) ? 'highlight' : ''}`}>
          {face && <CardView width={86} face={face} />}
          {playedJoker && <CardView width={50} joker={playedJoker.card.joker} />}
        </div>
      )
    }
    if (player?.playedBack) {
      return (
        <div className="played-slot">
          <CardView width={86} back arrow={player.playedBack.direction} />
          {player.playedBack.jokerDirection !== null && <CardView width={50} back arrow={player.playedBack.jokerDirection} />}
        </div>
      )
    }
    return <div className="played-slot empty" />
  }

  const winnerBanner = () => {
    if (!revealDone) return null
    if (pub.lastWinnerId) {
      return (
        <div className="round-banner win">
          {nameOf(pub.lastWinnerId)} gewinnt die Runde
          {pub.lastPoolWin > 0 ? ` und räumt ${pub.lastPoolWin} Pool-Karte${pub.lastPoolWin > 1 ? 'n' : ''} ab!` : '!'}
        </div>
      )
    }
    return <div className="round-banner tie">Unentschieden — die Regelkarte wandert in den Pool</div>
  }

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

      <section className="opponents">
        {opponents.map((p) => {
          const seat = pub.players.findIndex((q) => q.id === p.id)
          const isTurn = pub.phase === 'playing' && seat === pub.turnIndex
          return (
            <div key={p.id} className={`opponent ${isTurn ? 'turn' : ''}`}>
              {renderPlayed(p.id)}
              <div className="opponent-info">
                <svg width="18" height="22" viewBox="0 0 20 24" aria-hidden="true">
                  <path d="M10 1 L17 20 Q10 25 3 20 Z" fill={seatColor(p.id)} />
                </svg>
                <span className="player-name">{p.name}</span>
                <span className="score-chip">{p.score}</span>
                <span className="hand-chip">{p.handCount} 🂠</span>
              </div>
              {isTurn && <TurnArrow />}
            </div>
          )
        })}
      </section>

      <section className="table-center">
        <div className="rule-area">
          <div className="rule-current">
            <span className="field-label">Regelkarte</span>
            <CardView width={120} ruleCard={shownRule} />
          </div>
          <div className="rule-preview">
            <span className="field-label">Vorschau</span>
            {pub.preview ? <CardView width={82} ruleCard={pub.preview} dimmed /> : <div className="played-slot empty" />}
          </div>
          {pub.poolSize > 0 && (
            <div className="pool-badge" title="Regelkarten im Pool (Pool Extrem)">
              Pool: {pub.poolSize}
            </div>
          )}
        </div>
        {pub.phase === 'reveal' && <p className="step-caption">{caption(currentStep)}</p>}
        {winnerBanner()}
        {pub.phase === 'playing' && (
          <p className="step-caption dim">
            {myTurn
              ? onlyJokersInHand
                ? 'Nur Joker auf der Hand — wirf einen ab'
                : 'Du bist dran — wähle eine Karte'
              : `${nameOf(pub.players[pub.turnIndex]?.id ?? '')} ist dran …`}
          </p>
        )}
      </section>

      <section className="you-area">
        <div className={`you-info ${myTurn ? 'turn' : ''}`}>
          {renderPlayed(youId)}
          <div className="opponent-info">
            <svg width="18" height="22" viewBox="0 0 20 24" aria-hidden="true">
              <path d="M10 1 L17 20 Q10 25 3 20 Z" fill={seatColor(youId)} />
            </svg>
            <span className="player-name">{you?.name} (du)</span>
            <span className="score-chip">{you?.score}</span>
          </div>
          {myTurn && <TurnArrow />}
        </div>

        <div className="hand">
          {hand.map((c) =>
            isJoker(c) ? (
              <CardView
                key={c.id}
                width={96}
                joker={c.joker}
                selected={jokerId === c.id || selectedId === c.id}
                dimmed={!myTurn || (!onlyJokersInHand && !selectedCard) || !pub.options.jokersEnabled}
                onClick={
                  myTurn
                    ? () => {
                        if (onlyJokersInHand) {
                          setSelectedId(selectedId === c.id ? null : c.id)
                        } else if (selectedCard) {
                          setJokerId(jokerId === c.id ? null : c.id)
                        }
                      }
                    : undefined
                }
                title={jokerLabel(c.joker)}
              />
            ) : (
              <CardView
                key={c.id}
                width={96}
                face={{ color: c.color, value: c.value, action: c.action }}
                selected={selectedId === c.id}
                dimmed={!myTurn}
                onClick={myTurn ? () => setSelectedId(selectedId === c.id ? null : c.id) : undefined}
                title={actionLabel(c.action)}
              />
            ),
          )}
        </div>

        {myTurn && selectedCard && (
          <DirectionPicker
            jokerSelected={selectedJoker && isJoker(selectedJoker) ? selectedJoker : null}
            onPlay={playCard}
          />
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
                      face={isJoker(c) ? undefined : { color: c.color, value: c.value, action: c.action }}
                      joker={isJoker(c) ? c.joker : undefined}
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

// Das Signatur-Motiv als Zug-Anzeige: der rote Pfeil des Logos
function TurnArrow() {
  return (
    <svg className="turn-arrow" width="16" height="26" viewBox="0 0 20 32" aria-hidden="true">
      <path d="M10 30 L10 8" stroke="var(--red)" strokeWidth="4" strokeLinecap="round" fill="none" />
      <polyline
        points="3,13 10,4 17,13"
        stroke="var(--red)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function DirectionPicker({
  jokerSelected,
  onPlay,
}: {
  jokerSelected: JokerCard | null
  onPlay: (direction: Direction, jokerDirection: Direction | null) => void
}) {
  const [direction, setDirection] = useState<Direction | null>(null)
  const [jokerDirection, setJokerDirection] = useState<Direction>('self')

  const needsJokerDirection = jokerSelected?.joker === 'shiftAll'

  return (
    <div className="direction-picker panel">
      <span className="field-label">Pfeil ausrichten</span>
      <div className="direction-row">
        {(
          [
            ['left', '◀ Linker Nachbar'],
            ['self', 'Auf dich selbst'],
            ['right', 'Rechter Nachbar ▶'],
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
      {jokerSelected && (
        <div className="direction-row">
          <span style={{ color: 'var(--ink-dim)', fontSize: 13 }}>
            Joker „{jokerLabel(jokerSelected.joker)}" wird mitgespielt
          </span>
          {needsJokerDirection && (
            <>
              <button
                className={`btn btn-small ${jokerDirection === 'left' ? 'toggle on' : ''}`}
                onClick={() => setJokerDirection('left')}
              >
                ◀ Joker links
              </button>
              <button
                className={`btn btn-small ${jokerDirection === 'right' ? 'toggle on' : ''}`}
                onClick={() => setJokerDirection('right')}
              >
                Joker rechts ▶
              </button>
            </>
          )}
        </div>
      )}
      <button
        className="btn btn-primary"
        disabled={direction === null}
        onClick={() => direction && onPlay(direction, jokerSelected ? (needsJokerDirection ? jokerDirection : 'self') : null)}
      >
        Karte legen
      </button>
    </div>
  )
}

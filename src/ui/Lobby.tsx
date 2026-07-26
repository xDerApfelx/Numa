import { useState } from 'react'
import { TARGET_OPTIONS } from '../game/config'
import type { NumaHost } from '../net/host'
import type { LobbySnapshot } from '../net/protocol'
import { Logo } from './Logo'

const MAX_PLAYERS = 6

function inviteLink(code: string): string {
  const url = new URL(window.location.href)
  url.search = `?join=${code}`
  return url.toString()
}

export function Lobby({
  lobby,
  youId,
  host,
  onLeave,
}: {
  lobby: LobbySnapshot
  youId: string
  host: NumaHost | null
  onLeave: () => void
}) {
  const isHost = host !== null
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(lobby.code))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard nicht verfügbar — Code steht ja sichtbar da
    }
  }

  const canStart = isHost && lobby.players.length >= 2

  return (
    <main className="screen">
      <Logo size={40} />

      <section className="panel lobby-panel">
        <div className="room-code-box">
          <span className="field-label">Raum-Code</span>
          <button className="room-code" onClick={copy} title="Einladungslink kopieren">
            {lobby.code}
          </button>
          <span className="room-hint">{copied ? 'Link kopiert!' : 'Klicken kopiert den Einladungslink'}</span>
        </div>

        <ul className="player-list">
          {lobby.players.map((p) => (
            <li key={p.id} className="player-row">
              <span className={`player-dot ${p.isBot ? 'bot' : ''}`} aria-hidden="true" />
              <span className="player-name">
                {p.name}
                {p.id === youId && <span className="you-tag"> (du)</span>}
                {p.id === lobby.hostId && <span className="host-tag"> · Host</span>}
              </span>
              {isHost && p.isBot && (
                <button className="btn btn-small" onClick={() => host.removeBot(p.id)}>
                  Entfernen
                </button>
              )}
            </li>
          ))}
          {lobby.players.length < MAX_PLAYERS && isHost && (
            <li className="player-row">
              <button className="btn btn-small" onClick={() => host.addBot()}>
                + Bot hinzufügen
              </button>
            </li>
          )}
        </ul>

        <div className="lobby-options">
          <div>
            <label className="field-label" htmlFor="target">
              Punkteziel
            </label>
            <select
              id="target"
              disabled={!isHost}
              value={lobby.options.targetScore}
              onChange={(e) =>
                host?.setOptions({ ...lobby.options, targetScore: Number(e.target.value) })
              }
            >
              {TARGET_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t === 0 ? 'Endlos (ohne Ziel)' : `${t} Regelkarten`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="field-label">Joker</span>
            <button
              className={`btn toggle ${lobby.options.jokersEnabled ? 'on' : ''}`}
              disabled={!isHost}
              onClick={() => host?.setOptions({ ...lobby.options, jokersEnabled: !lobby.options.jokersEnabled })}
              aria-pressed={lobby.options.jokersEnabled}
            >
              {lobby.options.jokersEnabled ? 'Mit Jokern' : 'Ohne Joker'}
            </button>
          </div>
        </div>

        {isHost ? (
          <button className="btn btn-primary" disabled={!canStart} onClick={() => host.start()}>
            {canStart ? 'Spiel starten' : 'Mindestens 2 Spieler nötig'}
          </button>
        ) : (
          <p className="waiting-note">Warten, bis der Host startet …</p>
        )}
      </section>

      <button className="btn btn-small" onClick={onLeave}>
        Verlassen
      </button>
    </main>
  )
}

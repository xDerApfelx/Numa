import { useState } from 'react'
import { normalizeRoomCode } from '../net/roomCode'
import { Logo } from './Logo'

function initialJoinCode(): string {
  const params = new URLSearchParams(window.location.search)
  return normalizeRoomCode(params.get('join') ?? '')
}

export function Home({
  onCreate,
  onJoin,
  busy,
}: {
  onCreate: (name: string) => void
  onJoin: (code: string, name: string) => void
  busy: boolean
}) {
  const [name, setName] = useState(() => localStorage.getItem('numa-name') ?? '')
  const [code, setCode] = useState(initialJoinCode)

  const remember = () => {
    localStorage.setItem('numa-name', name.trim())
  }

  const canAct = name.trim().length > 0 && !busy

  return (
    <main className="screen">
      <Logo size={72} />
      <p style={{ color: 'var(--ink-dim)', margin: 0, textAlign: 'center' }}>
        Bluffen, kopieren, verschieben — wer liest den Tisch am besten?
      </p>

      <div className="panel" style={{ width: 'min(92vw, 380px)', display: 'grid', gap: 18 }}>
        <div>
          <label className="field-label" htmlFor="name">
            Dein Name
          </label>
          <input
            id="name"
            value={name}
            maxLength={20}
            placeholder="z. B. Bero"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <button
          className="btn btn-primary"
          disabled={!canAct}
          onClick={() => {
            remember()
            onCreate(name.trim())
          }}
        >
          Raum erstellen
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--ink-dim)' }}>
          <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          oder
          <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        </div>

        <div>
          <label className="field-label" htmlFor="code">
            Raum-Code
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              id="code"
              value={code}
              placeholder="ABCDE"
              maxLength={5}
              style={{ fontFamily: 'var(--font-code)', letterSpacing: '0.3em', textTransform: 'uppercase' }}
              onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canAct && code.length === 5) {
                  remember()
                  onJoin(code, name.trim())
                }
              }}
            />
            <button
              className="btn"
              disabled={!canAct || code.length !== 5}
              onClick={() => {
                remember()
                onJoin(code, name.trim())
              }}
            >
              Beitreten
            </button>
          </div>
        </div>
      </div>

      {busy && <p style={{ color: 'var(--ink-dim)' }}>Verbinde …</p>}
    </main>
  )
}

import type { NumaHost } from '../net/host'
import type { LobbySnapshot } from '../net/protocol'
import { Logo } from './Logo'

// Platzhalter — vollständige Lobby folgt.
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
  void youId
  void host
  void onLeave
  return (
    <main className="screen">
      <Logo size={40} />
      <div className="panel">Raum {lobby.code}</div>
    </main>
  )
}

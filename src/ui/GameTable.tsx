import type { AnyCard } from '../game/types'
import type { NumaClient } from '../net/client'
import type { NumaHost } from '../net/host'
import type { PublicState } from '../net/protocol'

// Platzhalter — vollständiger Spieltisch folgt.
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
  void hand
  void youId
  void host
  void client
  void onLeave
  return (
    <main className="screen">
      <div className="panel">Runde {pub.round}</div>
    </main>
  )
}

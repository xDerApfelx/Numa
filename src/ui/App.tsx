import { useEffect, useRef, useState } from 'react'
import type { AnyCard } from '../game/types'
import { NumaClient } from '../net/client'
import { NumaHost, HOST_PLAYER_ID } from '../net/host'
import type { LobbySnapshot, PublicState } from '../net/protocol'
import { GameTable } from './GameTable'
import { Gallery } from './Gallery'
import { Home } from './Home'
import { Lobby } from './Lobby'

export function App() {
  const isGallery = new URLSearchParams(window.location.search).has('gallery')
  const hostRef = useRef<NumaHost | null>(null)
  const clientRef = useRef<NumaClient | null>(null)
  const [lobby, setLobby] = useState<LobbySnapshot | null>(null)
  const [youId, setYouId] = useState('')
  const [pub, setPub] = useState<PublicState | null>(null)
  const [hand, setHand] = useState<AnyCard[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 5000)
    return () => clearTimeout(t)
  }, [error])

  const reset = () => {
    hostRef.current?.destroy()
    clientRef.current?.destroy()
    hostRef.current = null
    clientRef.current = null
    setLobby(null)
    setPub(null)
    setHand([])
    setYouId('')
  }

  const createRoom = async (name: string) => {
    setBusy(true)
    try {
      const host = await NumaHost.create(name)
      hostRef.current = host
      host.onLobby = (l) => {
        setLobby(l)
        setPub(null)
      }
      host.onState = (p, h) => {
        setPub(p)
        setHand(h)
      }
      host.onError = setError
      setYouId(HOST_PLAYER_ID)
      host.broadcastLobby()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Raum konnte nicht erstellt werden')
      reset()
    } finally {
      setBusy(false)
    }
  }

  const joinRoom = async (code: string, name: string) => {
    setBusy(true)
    try {
      const client = await NumaClient.join(code, name)
      clientRef.current = client
      client.onLobby = (l, you) => {
        setLobby(l)
        setYouId(you)
        setPub(null)
      }
      client.onState = (p, h) => {
        setPub(p)
        setHand(h)
      }
      client.onError = setError
      client.onDisconnect = () => {
        reset()
        setError('Verbindung zum Host verloren')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Beitritt fehlgeschlagen')
      reset()
    } finally {
      setBusy(false)
    }
  }

  const leave = () => reset()

  let screen
  if (isGallery) {
    return <Gallery />
  }
  if (pub) {
    screen = (
      <GameTable
        pub={pub}
        hand={hand}
        youId={youId}
        host={hostRef.current}
        client={clientRef.current}
        onLeave={leave}
      />
    )
  } else if (lobby) {
    screen = <Lobby lobby={lobby} youId={youId} host={hostRef.current} onLeave={leave} />
  } else {
    screen = <Home onCreate={createRoom} onJoin={joinRoom} busy={busy} />
  }

  return (
    <>
      {screen}
      {error && (
        <div className="error-toast" role="alert">
          {error}
        </div>
      )}
    </>
  )
}

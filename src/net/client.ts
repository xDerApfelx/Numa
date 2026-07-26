import Peer, { type DataConnection } from 'peerjs'
import type { AnyCard } from '../game/types'
import type { C2H, H2C, LobbySnapshot, PublicState } from './protocol'
import { normalizeRoomCode, roomCodeToPeerId } from './roomCode'

// Dünner Client: verbindet sich mit dem Host-Peer, schickt Züge, empfängt
// Lobby- und State-Snapshots.
export class NumaClient {
  onLobby: ((lobby: LobbySnapshot, youId: string) => void) | null = null
  onState: ((pub: PublicState, hand: AnyCard[]) => void) | null = null
  onError: ((message: string) => void) | null = null
  onDisconnect: (() => void) | null = null

  private constructor(
    private peer: Peer,
    private conn: DataConnection,
  ) {}

  static join(codeInput: string, name: string): Promise<NumaClient> {
    return new Promise((resolve, reject) => {
      const code = normalizeRoomCode(codeInput)
      if (code.length !== 5) {
        reject(new Error('Der Raum-Code hat 5 Zeichen'))
        return
      }
      const peer = new Peer()
      let settled = false
      const fail = (err: unknown) => {
        if (settled) return
        settled = true
        peer.destroy()
        reject(err instanceof Error ? err : new Error('Verbindung fehlgeschlagen'))
      }
      peer.on('error', (err) => {
        const type = (err as { type?: string }).type
        if (type === 'peer-unavailable') {
          fail(new Error('Raum nicht gefunden — stimmt der Code?'))
        } else {
          fail(err)
        }
      })
      peer.on('open', () => {
        const conn = peer.connect(roomCodeToPeerId(code), { reliable: true })
        conn.on('open', () => {
          if (settled) return
          settled = true
          const client = new NumaClient(peer, conn)
          client.wire()
          client.send({ t: 'hello', name })
          resolve(client)
        })
        conn.on('error', fail)
      })
    })
  }

  private wire() {
    this.conn.on('data', (data) => {
      const msg = data as H2C
      switch (msg.t) {
        case 'lobby':
          this.onLobby?.(msg.lobby, msg.youId)
          break
        case 'state':
          this.onState?.(msg.pub, msg.hand)
          break
        case 'err':
          this.onError?.(msg.message)
          break
      }
    })
    this.conn.on('close', () => this.onDisconnect?.())
    this.peer.on('disconnected', () => this.onDisconnect?.())
  }

  send(msg: C2H) {
    this.conn.send(msg)
  }

  destroy() {
    this.peer.destroy()
  }
}

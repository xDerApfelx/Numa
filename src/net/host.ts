import Peer, { type DataConnection } from 'peerjs'
import { chooseBotBlackDiscard, chooseBotMove } from '../game/bots'
import { applyEvent, createGame, type GameEvent, type GameState } from '../game/engine'
import {
  BOT_THINK_MAX_MS,
  BOT_THINK_MIN_MS,
  DEFAULT_OPTIONS,
  revealDurationMs,
} from '../game/config'
import { mulberry32 } from '../game/rng'
import { visibleSteps } from '../game/resolve'
import type { AnyCard, GameOptions } from '../game/types'
import { toPublicState, type C2H, type H2C, type LobbyPlayer, type LobbySnapshot, type PublicState } from './protocol'
import { makeRoomCode, roomCodeToPeerId } from './roomCode'

export const HOST_PLAYER_ID = 'host'
const MAX_PLAYERS = 6

// setTimeout in Hintergrund-Tabs wird von Chrome auf bis zu 1x/Minute
// gedrosselt — die Bots würden quälend langsam, sobald der Host den Tab
// wechselt. Timer in einem Dedicated Worker unterliegen dieser Drosselung
// nicht, deshalb laufen die Bot-Verzögerungen dort.
type CancelableTimer = (ms: number, fn: () => void) => () => void

function makeWorkerTimer(): CancelableTimer {
  try {
    const src = 'onmessage=(e)=>{setTimeout(()=>postMessage(e.data.id), e.data.ms)}'
    const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })))
    let nextId = 1
    const pending = new Map<number, () => void>()
    worker.onmessage = (e: MessageEvent<number>) => {
      const fn = pending.get(e.data)
      pending.delete(e.data)
      fn?.()
    }
    return (ms, fn) => {
      const id = nextId++
      pending.set(id, fn)
      worker.postMessage({ id, ms })
      return () => pending.delete(id)
    }
  } catch {
    return (ms, fn) => {
      const t = setTimeout(fn, ms)
      return () => clearTimeout(t)
    }
  }
}

// Der Host ist die Autorität: er besitzt die Engine, validiert alle Züge,
// simuliert die Bots und broadcastet nach jeder Änderung den öffentlichen
// Zustand plus die jeweils private Hand.
export class NumaHost {
  readonly code: string
  readonly peer: Peer
  options: GameOptions = { ...DEFAULT_OPTIONS }
  state: GameState | null = null

  onLobby: ((lobby: LobbySnapshot) => void) | null = null
  onState: ((pub: PublicState, hand: AnyCard[]) => void) | null = null
  onError: ((message: string) => void) | null = null

  private players: LobbyPlayer[]
  private conns = new Map<string, DataConnection>()
  private botRng = mulberry32(Date.now() >>> 0)
  private timer: CancelableTimer = makeWorkerTimer()
  private cancelBotTimer: (() => void) | null = null
  private botCounter = 0

  private constructor(hostName: string, code: string, peer: Peer) {
    this.code = code
    this.peer = peer
    this.players = [{ id: HOST_PLAYER_ID, name: hostName, isBot: false, connected: true }]
  }

  static create(hostName: string): Promise<NumaHost> {
    return new Promise((resolve, reject) => {
      let attempts = 0
      const tryOpen = () => {
        const code = makeRoomCode()
        const peer = new Peer(roomCodeToPeerId(code))
        peer.on('open', () => {
          const host = new NumaHost(hostName, code, peer)
          host.wire()
          resolve(host)
        })
        peer.on('error', (err) => {
          peer.destroy()
          if ((err as { type?: string }).type === 'unavailable-id' && attempts++ < 3) {
            tryOpen() // Code-Kollision: neuen Code würfeln
          } else {
            reject(err)
          }
        })
      }
      tryOpen()
    })
  }

  private wire() {
    this.peer.on('connection', (conn) => {
      conn.on('data', (data) => this.handleMessage(conn, data as C2H))
      conn.on('close', () => this.handleDisconnect(conn))
      conn.on('error', () => this.handleDisconnect(conn))
    })
  }

  destroy() {
    this.cancelBotTimer?.()
    this.peer.destroy()
  }

  private handleMessage(conn: DataConnection, msg: C2H) {
    const playerId = conn.peer
    try {
      switch (msg.t) {
        case 'hello': {
          if (this.state) {
            this.sendTo(conn, { t: 'err', message: 'Das Spiel läuft bereits' })
            return
          }
          if (this.players.length >= MAX_PLAYERS) {
            this.sendTo(conn, { t: 'err', message: 'Der Raum ist voll' })
            return
          }
          const name = msg.name.trim().slice(0, 20) || 'Spieler'
          if (!this.players.some((p) => p.id === playerId)) {
            this.players.push({ id: playerId, name, isBot: false, connected: true })
          }
          this.conns.set(playerId, conn)
          this.broadcastLobby()
          break
        }
        case 'play':
          this.applyAndBroadcast({
            type: 'play',
            playerId,
            cardId: msg.cardId,
            direction: msg.direction,
            jokerId: msg.jokerId,
            jokerDirection: msg.jokerDirection,
          })
          break
        case 'blackDiscard':
          this.applyAndBroadcast({ type: 'blackDiscard', playerId, cardIds: msg.cardIds })
          break
      }
    } catch (e) {
      this.sendTo(conn, { t: 'err', message: e instanceof Error ? e.message : 'Ungültiger Zug' })
      this.pushState() // Zustand erneut senden, damit die UI konsistent bleibt
    }
  }

  private handleDisconnect(conn: DataConnection) {
    const playerId = conn.peer
    this.conns.delete(playerId)
    if (!this.state) {
      this.players = this.players.filter((p) => p.id !== playerId)
      this.broadcastLobby()
      return
    }
    // Während des Spiels: getrennte Spieler übernimmt ein Bot, damit die
    // Runde nicht hängen bleibt.
    const lobbyPlayer = this.players.find((p) => p.id === playerId)
    if (lobbyPlayer) lobbyPlayer.connected = false
    const player = this.state.players.find((p) => p.id === playerId)
    if (player && !player.isBot) {
      player.isBot = true
      this.pushState()
      this.scheduleBots()
    }
  }

  // ---- Lobby-Verwaltung (von der Host-UI aufgerufen) ----

  addBot() {
    if (this.state || this.players.length >= MAX_PLAYERS) return
    const names = ['Robo-Rita', 'Blechbert', 'Klaus-o-Mat', 'Zufalls-Zoe', 'Schaltkreis-Susi']
    const id = `bot-${++this.botCounter}`
    this.players.push({ id, name: names[(this.botCounter - 1) % names.length], isBot: true, connected: true })
    this.broadcastLobby()
  }

  removeBot(id: string) {
    if (this.state) return
    this.players = this.players.filter((p) => !(p.id === id && p.isBot))
    this.broadcastLobby()
  }

  setOptions(options: GameOptions) {
    if (this.state) return
    this.options = options
    this.broadcastLobby()
  }

  start() {
    if (this.state || this.players.length < 2) return
    this.state = createGame(
      this.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot })),
      this.options,
      Date.now() >>> 0,
    )
    this.pushState()
    this.scheduleBots()
  }

  backToLobby() {
    this.state = null
    // Getrennte Spieler aus der Liste werfen, Bots bleiben
    this.players = this.players.filter((p) => p.connected)
    this.broadcastLobby()
  }

  // ---- Spielzüge ----

  // Zug der Host-UI selbst
  applyLocal(ev: GameEvent) {
    this.applyAndBroadcast(ev)
  }

  private applyAndBroadcast(ev: GameEvent) {
    if (!this.state) throw new Error('Kein laufendes Spiel')
    this.state = applyEvent(this.state, ev)
    this.pushState()
    this.scheduleBots()
  }

  // Treibt Bots und den automatischen Runden-Abschluss nach der
  // Reveal-Animation an.
  private scheduleBots() {
    this.cancelBotTimer?.()
    this.cancelBotTimer = null
    const s = this.state
    if (!s) return

    const later = (ms: number, fn: () => void) => {
      this.cancelBotTimer = this.timer(ms, () => {
        this.cancelBotTimer = null
        try {
          fn()
        } catch (err) {
          // Bot-Zug fehlgeschlagen — sichtbar machen, Zustand erneut senden
          // und die Schleife nicht sterben lassen.
          console.error('[numa-host] Bot-Zug fehlgeschlagen:', err)
          this.pushState()
          this.scheduleBots()
        }
      })
    }

    if (s.phase === 'playing') {
      const current = s.players[s.turnIndex]
      if (current.isBot) {
        const think = BOT_THINK_MIN_MS + this.botRng() * (BOT_THINK_MAX_MS - BOT_THINK_MIN_MS)
        later(think, () => this.applyAndBroadcast(chooseBotMove(this.state!, current.id, this.botRng)))
      }
    } else if (s.phase === 'reveal') {
      // Erst weiter, wenn die Aufdeck-Animation der Spieler durch ist —
      // dieselbe Rechnung nutzt die Oberfläche für ihren Ablauf.
      const steps = visibleSteps(s.lastResolution?.steps ?? []).length
      later(revealDurationMs(s.players.length, steps), () =>
        this.applyAndBroadcast({ type: 'nextRound' }),
      )
    } else if (s.phase === 'blackRule') {
      const idx = s.players.findIndex((p, i) => p.isBot && !s.blackDone[i])
      if (idx >= 0) {
        later(1100, () =>
          this.applyAndBroadcast(chooseBotBlackDiscard(this.state!, this.state!.players[idx].id, this.botRng)),
        )
      }
    }
  }

  // ---- Broadcasts ----

  private lobbySnapshot(): LobbySnapshot {
    return { code: this.code, players: this.players, options: this.options, hostId: HOST_PLAYER_ID }
  }

  broadcastLobby() {
    const lobby = this.lobbySnapshot()
    this.onLobby?.(lobby)
    for (const [playerId, conn] of this.conns) {
      this.sendTo(conn, { t: 'lobby', lobby, youId: playerId })
    }
  }

  private pushState() {
    const s = this.state
    if (!s) return
    const pub = toPublicState(s)
    const handOf = (playerId: string) => s.players.find((p) => p.id === playerId)?.hand ?? []
    this.onState?.(pub, handOf(HOST_PLAYER_ID))
    for (const [playerId, conn] of this.conns) {
      this.sendTo(conn, { t: 'state', pub, hand: handOf(playerId) })
    }
  }

  private sendTo(conn: DataConnection, msg: H2C) {
    try {
      conn.send(msg)
    } catch {
      // Verbindung ist gerade weggebrochen — close-Handler räumt auf
    }
  }
}

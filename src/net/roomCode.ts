// 5-Zeichen-Raum-Code ohne verwechselbare Zeichen (0/O, 1/I).
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 5

export function makeRoomCode(rng: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_ALPHABET[Math.floor(rng() * ROOM_ALPHABET.length)]
  }
  return code
}

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z2-9]/g, '')
}

// Der Code ist direkt die PeerJS-Peer-ID (mit Präfix gegen Kollisionen mit
// fremden PeerJS-Cloud-Nutzern).
export function roomCodeToPeerId(code: string): string {
  return `numa-w7q-${code}`
}

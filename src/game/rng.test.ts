import { describe, expect, it } from 'vitest'
import { mulberry32, shuffle } from './rng'
import { ACTION_FREQUENCIES } from './config'

describe('mulberry32', () => {
  it('liefert für gleichen Seed die gleiche Sequenz', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = [a(), a(), a(), a()]
    const seqB = [b(), b(), b(), b()]
    expect(seqA).toEqual(seqB)
  })

  it('liefert für verschiedene Seeds verschiedene Sequenzen', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()])
  })

  it('liefert Werte in [0, 1)', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('shuffle', () => {
  it('ist eine Permutation des Eingabe-Arrays und mutiert das Original nicht', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const copy = [...input]
    const out = shuffle(input, mulberry32(3))
    expect(input).toEqual(copy)
    expect(out).not.toBe(input)
    expect([...out].sort((x, y) => x - y)).toEqual(copy)
  })

  it('ist deterministisch je Seed', () => {
    const input = ['a', 'b', 'c', 'd', 'e']
    expect(shuffle(input, mulberry32(9))).toEqual(shuffle(input, mulberry32(9)))
  })

  it('mischt tatsächlich (verschiedene Seeds ergeben irgendwann andere Ordnung)', () => {
    const input = Array.from({ length: 20 }, (_, i) => i)
    const a = shuffle(input, mulberry32(1))
    const b = shuffle(input, mulberry32(2))
    expect(a).not.toEqual(b)
  })
})

describe('config', () => {
  it('ACTION_FREQUENCIES summiert zu 108', () => {
    const sum = Object.values(ACTION_FREQUENCIES).reduce((a, b) => a + b, 0)
    expect(sum).toBe(108)
  })
})

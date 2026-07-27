import { useEffect, useState, type RefObject } from 'react'

/**
 * Misst ein Element und aktualisiert bei Größenänderung. Die Kartenwinkel
 * hängen vom Seitenverhältnis der Spielfläche ab — ohne echte Pixelmaße
 * würden die Karten am Nachbarn vorbeizeigen.
 */
export function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return size
}

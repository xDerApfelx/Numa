// nu·ma-Wortmarke: zwei versetzte Zeilen mit dem roten Richtungspfeil
// dazwischen — das Signatur-Motiv der Kartenrückseiten.
export function Logo({ size = 64 }: { size?: number }) {
  return (
    <span className="logo" style={{ fontSize: size }} aria-label="numa">
      <svg className="logo-arrow" viewBox="0 0 34 130" aria-hidden="true">
        <path
          d="M17 128 L17 18"
          stroke="var(--red)"
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
        />
        <polyline
          points="3,32 17,10 31,32"
          stroke="var(--red)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      <span className="nu">nu</span>
      <span className="ma">
        m<span className="a">a</span>
      </span>
    </span>
  )
}

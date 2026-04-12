// Logo do Vallen Reposição
// Triângulo branco + V rosa + diamante rosa na base
export function LogoVR({ size = 48 }) {
  const h = Math.round(size * 1.3)
  return (
    <svg width={size} height={h} viewBox="0 0 48 62" fill="none" aria-label="Vallen Reposição">
      {/* Triângulo branco */}
      <polygon points="24,3 47,48 1,48" fill="white" />
      {/* V rosa dentro do triângulo */}
      <polyline
        points="13,26 24,41 35,26"
        stroke="#ec4899"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Diamante rosa na base */}
      <polygon points="24,59 31,52 24,45 17,52" fill="#ec4899" />
    </svg>
  )
}

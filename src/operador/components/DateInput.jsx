import { useState } from 'react'

// Campo de data DIGITÁVEL (DD/MM/AAAA) — melhor no iOS que o <input type="date">.
// Máscara automática + correção: se a data for inválida (ex.: 31/02, mês 13),
// sugere a data válida mais próxima pra tocar. value/onChange usam ISO 'YYYY-MM-DD'.
const pad = (n) => String(n).padStart(2, '0')
const daysInMonth = (m, y) => new Date(y, m, 0).getDate() // m: 1-12
const isoToBR = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }

function mascara(d) {
  const p = []
  if (d.length > 0) p.push(d.slice(0, 2))
  if (d.length >= 3) p.push(d.slice(2, 4))
  if (d.length >= 5) p.push(d.slice(4))
  return p.join('/')
}

// Corrige dia/mês fora do intervalo. Retorna {iso, display, corrigido}
function corrigir(dd, mm, yyyy) {
  const m = Math.min(12, Math.max(1, mm))
  const y = yyyy
  const d = Math.min(daysInMonth(m, y), Math.max(1, dd))
  return { iso: `${y}-${pad(m)}-${pad(d)}`, display: `${pad(d)}/${pad(m)}/${y}`, corrigido: d !== dd || m !== mm }
}

export function DateInput({ value, onChange, className, placeholder = 'DD/MM/AAAA' }) {
  // texto é LOCAL (não re-sincroniza com value a cada tecla — isso apagava o que
  // estava sendo digitado). O pai reseta remontando via `key`.
  const [texto, setTexto] = useState(isoToBR(value))
  const [sug, setSug]     = useState(null)
  const [info, setInfo]   = useState(null)

  function processar(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, 8)
    setTexto(mascara(digits))
    setSug(null); setInfo(null)

    // Aceita DDMMAA (6) ou DDMMAAAA (8)
    let dd, mm, yyyy
    if (digits.length === 8) { dd = +digits.slice(0, 2); mm = +digits.slice(2, 4); yyyy = +digits.slice(4, 8) }
    else if (digits.length === 6) { dd = +digits.slice(0, 2); mm = +digits.slice(2, 4); yyyy = 2000 + +digits.slice(4, 6) }
    else { onChange(''); return }

    const c = corrigir(dd, mm, yyyy)
    if (c.corrigido) {
      onChange('')
      setSug(c)
    } else {
      onChange(c.iso)
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
      const dt = new Date(yyyy, mm - 1, dd)
      const dias = Math.round((dt - hoje) / 86400000)
      setInfo(dias < 0 ? `⚠️ já venceu há ${-dias} dia(s)` : dias === 0 ? 'vence hoje' : `vence em ${dias} dia(s)`)
    }
  }

  function aceitarSugestao() {
    setTexto(sug.display); setSug(null); processar(sug.display)
  }

  return (
    <div className="w-full">
      <input value={texto} onChange={e => processar(e.target.value)} inputMode="numeric" placeholder={placeholder} className={className} />
      {sug && (
        <button type="button" onClick={aceitarSugestao}
          className="mt-1 w-full text-center text-sm bg-orange-500/15 border border-orange-500/40 text-orange-300 rounded-xl px-3 py-2">
          Data inválida. Quis dizer <b className="text-orange-200">{sug.display}</b>? Tocar para usar
        </button>
      )}
      {info && <p className="text-center text-xs text-vallen-muted mt-1">{info}</p>}
    </div>
  )
}

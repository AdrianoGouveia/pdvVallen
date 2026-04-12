import { useEffect, useState, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../../lib/supabase'

export function PixMesa({ cart, total, unidadeId, clienteId, onSuccess, onVoltar }) {
  const [fase, setFase]       = useState('criando')
  const [qrCode, setQrCode]   = useState('')
  const [pedidoId, setPedidoId] = useState(null)
  const [efiTxid, setEfiTxid] = useState(null)
  const [provider, setProvider] = useState(null)
  const [copied, setCopied]   = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [erro, setErro]       = useState('')

  useEffect(() => {
    fetch('/api/criar-pagamento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart, total, unidadeId, clienteId, tipo: 'pix' }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setQrCode(data.qrCode)
        setPedidoId(data.pedidoId)
        setProvider(data.provider)
        if (data.efiTxid) setEfiTxid(data.efiTxid)
        setFase('aguardando')
      })
      .catch(e => { setErro(e.message); setFase('erro') })
  }, [])

  const handleSuccess = useCallback(() => onSuccess(pedidoId), [pedidoId, onSuccess])

  useEffect(() => {
    if (fase !== 'aguardando' || !pedidoId) return
    const timer = setInterval(() => setSegundos(s => s + 1), 1000)

    const channel = supabase.channel(`mesa-pedido-${pedidoId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `id=eq.${pedidoId}` },
        p => { if (p.new?.status === 'aprovado') handleSuccess() })
      .subscribe()

    const poll = setInterval(async () => {
      try {
        if (provider === 'efi_pix') {
          const r = await fetch('/api/verificar-pix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedidoId, efiTxid }) })
          const d = await r.json()
          if (d.pago) handleSuccess()
        } else {
          const { data } = await supabase.from('pedidos').select('status').eq('id', pedidoId).single()
          if (data?.status === 'aprovado') handleSuccess()
        }
      } catch (_) {}
    }, 3000)

    return () => { clearInterval(timer); clearInterval(poll); supabase.removeChannel(channel) }
  }, [fase, pedidoId, provider, efiTxid, handleSuccess])

  const mm = String(Math.floor(segundos / 60)).padStart(2, '0')
  const ss = String(segundos % 60).padStart(2, '0')

  if (fase === 'criando') return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 border-4 border-vallen-green border-t-transparent rounded-full animate-spin" />
      <p className="text-vallen-muted text-sm">Gerando QR Code...</p>
    </div>
  )

  if (fase === 'erro') return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
      <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 w-full">
        <p className="text-red-400 text-sm text-center font-mono break-all">{erro}</p>
      </div>
      <button onClick={onVoltar} className="w-full py-3 bg-vallen-card border border-vallen-border text-vallen-white rounded-xl">
        ← Voltar
      </button>
    </div>
  )

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      <div className="flex flex-col items-center px-6 py-6 gap-5">
        <div className="bg-white p-4 rounded-2xl shadow-lg">
          <QRCodeSVG value={qrCode} size={220} bgColor="#fff" fgColor="#000" level="M" />
        </div>

        <div className="text-center">
          <p className="text-4xl font-black text-vallen-green">R$ {total.toFixed(2)}</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
            <p className="text-sm text-vallen-muted">Aguardando... {mm}:{ss}</p>
          </div>
        </div>

        <button onClick={() => { navigator.clipboard.writeText(qrCode); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
          className="w-full py-3 rounded-xl border border-vallen-border text-vallen-muted hover:text-vallen-white text-sm transition-colors">
          {copied ? '✓ Copiado!' : 'Copiar código PIX'}
        </button>

        <p className="text-xs text-vallen-gray text-center">
          Abra o app do seu banco e escaneie o QR Code.<br />Confirmação automática.
        </p>

        <button onClick={onVoltar} className="text-sm text-vallen-muted hover:text-vallen-white">
          ← Voltar
        </button>
      </div>
    </div>
  )
}

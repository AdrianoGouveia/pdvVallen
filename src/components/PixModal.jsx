import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'

const EDGE_URL = '/api/criar-pagamento'
const POLL_MS  = 3000

export function PixModal({ items, total, unidadeId, onPaymentSuccess, onClose }) {
  const [fase, setFase]         = useState('criando')
  const [qrCode, setQrCode]     = useState('')
  const [pedidoId, setPedidoId] = useState(null)
  const [provider, setProvider] = useState(null)
  const [efiTxid, setEfiTxid]   = useState(null)
  const [copied, setCopied]     = useState(false)
  const [erro, setErro]         = useState('')
  const [segundos, setSegundos] = useState(0)

  // 1. Criar cobrança ao abrir
  useEffect(() => {
    async function criarCobranca() {
      try {
        const res  = await fetch(EDGE_URL, {
          method : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body   : JSON.stringify({ items, total, unidadeId, tipo: 'pix' }),
        })
        const data = await res.json()
        if (!res.ok || data.error) throw new Error(data.error || 'Erro ao criar cobrança')

        setQrCode(data.qrCode)
        setPedidoId(data.pedidoId)
        setProvider(data.provider)
        if (data.efiTxid) setEfiTxid(data.efiTxid)
        setFase('aguardando')
      } catch (e) {
        setErro(e.message)
        setFase('erro')
      }
    }
    criarCobranca()
  }, [])

  // 2. Polling — EFI PIX: checa direto na API EFI | Asaas: checa Supabase
  useEffect(() => {
    if (fase !== 'aguardando' || !pedidoId) return

    const timer = setInterval(() => setSegundos(s => s + 1), 1000)

    const poll = setInterval(async () => {
      try {
        if (provider === 'efi_pix') {
          // Polling ativo: consulta EFI diretamente e atualiza Supabase se pago
          const res  = await fetch('/api/verificar-pix', {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify({ pedidoId, efiTxid }),
          })
          const data = await res.json()
          if (data.pago) {
            clearInterval(poll)
            clearInterval(timer)
            onPaymentSuccess()
          }
        } else {
          // Asaas: webhook atualiza Supabase, só precisa monitorar a tabela
          const { data } = await supabase
            .from('pedidos').select('status').eq('id', pedidoId).single()
          if (data?.status === 'aprovado') {
            clearInterval(poll)
            clearInterval(timer)
            onPaymentSuccess()
          }
        }
      } catch (_) { /* ignora erros de rede temporários */ }
    }, POLL_MS)

    return () => { clearInterval(poll); clearInterval(timer) }
  }, [fase, pedidoId, provider, efiTxid, onPaymentSuccess])

  function handleCopiar() {
    navigator.clipboard.writeText(qrCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const minutos = String(Math.floor(segundos / 60)).padStart(2, '0')
  const segs    = String(segundos % 60).padStart(2, '0')

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="bg-vallen-card border border-vallen-border rounded-xl w-full max-w-md p-6 shadow-2xl">

        <div className="text-center mb-5">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310419663030100181/bfwXvEbkbq6M7kWytZDaKG/v3_logo_fundo_preto_85834ede.webp"
            alt="Vallen Market"
            className="w-[50vw] max-w-[220px] h-auto object-contain mx-auto mb-3"
          />
          <h2 className="text-xl font-bold text-vallen-white">Pagamento via PIX</h2>
        </div>

        {fase === 'criando' && (
          <div className="flex flex-col items-center py-10 gap-4">
            <div className="w-10 h-10 border-4 border-vallen-green border-t-transparent rounded-full animate-spin" />
            <p className="text-vallen-muted text-sm">Gerando QR Code...</p>
          </div>
        )}

        {fase === 'aguardando' && (
          <>
            <div className="flex justify-center mb-4">
              <div className="bg-white p-3 rounded-xl">
                <QRCodeSVG value={qrCode} size={200} bgColor="#fff" fgColor="#000" level="M" />
              </div>
            </div>

            <div className="text-center mb-4">
              <p className="text-3xl font-bold text-vallen-green">R$ {total.toFixed(2)}</p>
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                <p className="text-sm text-vallen-muted">
                  Aguardando pagamento... {minutos}:{segs}
                </p>
              </div>
            </div>

            <button
              onClick={handleCopiar}
              className="w-full py-2 mb-4 rounded-lg border border-vallen-border text-vallen-muted hover:text-vallen-white text-sm transition-colors"
            >
              {copied ? '✓ Código copiado!' : 'Copiar código PIX'}
            </button>

            <p className="text-xs text-vallen-gray text-center mb-4">
              Abra o app do seu banco, escaneie o QR Code ou cole o código.<br/>
              O pagamento é confirmado automaticamente.
            </p>
          </>
        )}

        {fase === 'erro' && (
          <div className="py-6">
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-4">
              <p className="text-red-400 text-sm text-center font-mono break-all">{erro}</p>
            </div>
            <button onClick={onClose} className="w-full py-3 bg-vallen-border hover:bg-vallen-gray text-vallen-white font-bold rounded-lg">
              Fechar
            </button>
          </div>
        )}

        {fase !== 'erro' && (
          <button onClick={onClose} className="w-full py-2 text-sm text-vallen-muted hover:text-vallen-white transition-colors">
            Cancelar
          </button>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'

const EDGE_URL  = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/criar-link-cartao`
const CHECK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verificar-cobranca-cartao`
const POLL_MS   = 4000
const EXPIRA_EM = 10 * 60  // 10 minutos em segundos

export function CardModal({ items, total, unidadeId, onPaymentSuccess, onClose, onVoltar }) {
  const [fase, setFase]           = useState('criando')   // criando | aguardando | expirado | erro
  const [linkPagamento, setLink]  = useState('')
  const [pedidoId, setPedidoId]   = useState(null)
  const [chargeId, setChargeId]   = useState(null)
  const [erro, setErro]           = useState('')
  const [segundos, setSegundos]   = useState(0)
  const [restante, setRestante]   = useState(EXPIRA_EM)
  const pollRef                   = useRef(null)
  const timerRef                  = useRef(null)
  const expiryRef                 = useRef(null)

  // Criar link ao abrir
  useEffect(() => {
    async function criar() {
      try {
        const res = await fetch(EDGE_URL, {
          method : 'POST',
          headers: {
            'Content-Type' : 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ items, total, unidadeId }),
        })
        const data = await res.json()
        if (!res.ok || data.error) throw new Error(data.error || 'Erro ao gerar link')

        setLink(data.linkPagamento)
        setPedidoId(data.pedidoId)
        setChargeId(data.chargeId)
        setFase('aguardando')
      } catch (e) {
        setErro(e.message)
        setFase('erro')
      }
    }
    criar()
  }, [])

  // Polling + timers quando aguardando
  useEffect(() => {
    if (fase !== 'aguardando' || !chargeId) return

    // Contador de espera (subindo)
    timerRef.current = setInterval(() => setSegundos(s => s + 1), 1000)

    // Contador de expiração (descendo)
    expiryRef.current = setInterval(() => {
      setRestante(r => {
        if (r <= 1) {
          clearInterval(expiryRef.current)
          setFase('expirado')
          return 0
        }
        return r - 1
      })
    }, 1000)

    // Polling de status via edge function
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(CHECK_URL, {
          method : 'POST',
          headers: {
            'Content-Type' : 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ pedidoId, chargeId }),
        })
        const data = await res.json()
        if (data.pago) {
          clearInterval(pollRef.current)
          clearInterval(timerRef.current)
          clearInterval(expiryRef.current)
          onPaymentSuccess()
        }
      } catch (_) { /* silencia erros de rede temporários */ }
    }, POLL_MS)

    return () => {
      clearInterval(pollRef.current)
      clearInterval(timerRef.current)
      clearInterval(expiryRef.current)
    }
  }, [fase, chargeId, pedidoId, onPaymentSuccess])

  const minEspera   = String(Math.floor(segundos / 60)).padStart(2, '0')
  const segEspera   = String(segundos % 60).padStart(2, '0')
  const minRestante = String(Math.floor(restante / 60)).padStart(2, '0')
  const segRestante = String(restante % 60).padStart(2, '0')

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="bg-vallen-card border border-vallen-border rounded-xl w-full max-w-md p-6 shadow-2xl">

        {/* Header */}
        <div className="text-center mb-5">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310419663030100181/bfwXvEbkbq6M7kWytZDaKG/v3_logo_fundo_preto_85834ede.webp"
            alt="Vallen Market"
            className="h-8 w-auto object-contain mx-auto mb-3"
          />
          <h2 className="text-xl font-bold text-vallen-white">Pagamento via Cartão</h2>
        </div>

        {/* FASE: criando */}
        {fase === 'criando' && (
          <div className="flex flex-col items-center py-10 gap-4">
            <div className="w-10 h-10 border-4 border-vallen-green border-t-transparent rounded-full animate-spin" />
            <p className="text-vallen-muted text-sm">Gerando link de pagamento...</p>
          </div>
        )}

        {/* FASE: aguardando */}
        {fase === 'aguardando' && (
          <>
            {/* Instrução */}
            <div className="flex items-start gap-3 bg-blue-950/40 border border-blue-800/40 rounded-lg p-3 mb-4">
              <span className="text-xl mt-0.5">📱</span>
              <p className="text-xs text-blue-200 leading-relaxed">
                Escaneie o QR Code com a câmera do celular.
                Você será levado à página de pagamento para inserir os dados do cartão.
              </p>
            </div>

            {/* QR Code */}
            <div className="flex justify-center mb-4">
              <div className="bg-white p-3 rounded-xl">
                <QRCodeSVG value={linkPagamento} size={200} bgColor="#fff" fgColor="#000" level="M" />
              </div>
            </div>

            {/* Valor */}
            <div className="text-center mb-4">
              <p className="text-3xl font-bold text-vallen-green">R$ {total.toFixed(2)}</p>
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                <p className="text-sm text-vallen-muted">
                  Aguardando pagamento... {minEspera}:{segEspera}
                </p>
              </div>
            </div>

            {/* Expiração */}
            <div className="flex items-center justify-center gap-2 text-xs text-vallen-gray mb-4">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Link expira em {minRestante}:{segRestante}</span>
            </div>

            <p className="text-xs text-vallen-gray text-center mb-4">
              Aceitamos crédito e débito. Parcelas disponíveis no link.
            </p>
          </>
        )}

        {/* FASE: expirado */}
        {fase === 'expirado' && (
          <div className="py-6 text-center space-y-4">
            <div className="text-5xl">⏰</div>
            <p className="text-vallen-white font-semibold">Link expirado</p>
            <p className="text-vallen-muted text-sm">O tempo para pagamento esgotou.</p>
            <button
              onClick={onVoltar}
              className="w-full py-3 bg-vallen-green hover:bg-vallen-greenLight text-white font-bold rounded-lg"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* FASE: erro */}
        {fase === 'erro' && (
          <div className="py-6 space-y-4">
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
              <p className="text-red-400 text-sm text-center font-mono break-all">{erro}</p>
            </div>
            <button
              onClick={onVoltar}
              className="w-full py-3 bg-vallen-border hover:bg-vallen-gray text-vallen-white font-bold rounded-lg"
            >
              Voltar
            </button>
          </div>
        )}

        {(fase === 'aguardando' || fase === 'criando') && (
          <button onClick={onClose} className="w-full py-2 text-sm text-vallen-muted hover:text-vallen-white transition-colors">
            Cancelar
          </button>
        )}
      </div>
    </div>
  )
}

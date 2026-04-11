import { useMemo, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { gerarPixPayload } from '../utils/pixPayload'
import { supabase } from '../lib/supabase'

export function PixModal({ items, total, onPaymentSuccess, onClose }) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const txId = useMemo(() =>
    'VALLEN' + Date.now().toString().slice(-8),
  [])

  const payload = useMemo(() => gerarPixPayload({
    chave:  import.meta.env.VITE_PIX_CHAVE  || 'mercado@vallen.com.br',
    nome:   import.meta.env.VITE_PIX_NOME   || 'Mercado Vallen',
    cidade: import.meta.env.VITE_PIX_CIDADE || 'SAO PAULO',
    valor:  total,
    txId,
  }), [total, txId])

  async function handleSimularPagamento() {
    setLoading(true)
    setError('')

    try {
      // Baixa no estoque via RPC para cada item do carrinho
      for (const item of items) {
        const { error: rpcError } = await supabase.rpc('baixar_estoque', {
          p_produto_id: item.id,
          p_quantidade: item.quantidade,
        })
        if (rpcError) throw new Error(`Estoque insuficiente: ${item.nome}`)
      }

      // Registra o pedido
      const { data: pedido, error: pedidoError } = await supabase
        .from('pedidos')
        .insert({ total })
        .select()
        .single()
      if (pedidoError) throw pedidoError

      // Registra os itens
      const itensPedido = items.map(i => ({
        pedido_id:      pedido.id,
        produto_id:     i.id,
        quantidade:     i.quantidade,
        preco_unitario: i.preco,
      }))
      const { error: itensError } = await supabase
        .from('itens_pedido')
        .insert(itensPedido)
      if (itensError) throw itensError

      onPaymentSuccess()
    } catch (err) {
      setError(err.message || 'Erro ao processar pagamento.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="bg-vallen-card border border-vallen-border rounded-xl w-full max-w-md p-6 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-5">
          <img
            src="/icons/icon-192.png"
            alt="Vallen"
            className="w-10 h-10 mx-auto mb-2 rounded-lg"
            onError={e => e.target.style.display = 'none'}
          />
          <h2 className="text-xl font-bold text-vallen-white">Pagamento via PIX</h2>
          <p className="text-sm text-vallen-muted mt-1">
            Abra seu banco e escaneie o QR Code
          </p>
        </div>

        {/* QR Code */}
        <div className="flex justify-center mb-4">
          <div className="bg-white p-3 rounded-xl">
            <QRCodeSVG
              value={payload}
              size={200}
              bgColor="#ffffff"
              fgColor="#000000"
              level="M"
            />
          </div>
        </div>

        {/* Total */}
        <div className="text-center mb-4">
          <p className="text-3xl font-bold text-vallen-green">
            R$ {total.toFixed(2)}
          </p>
          <p className="text-xs text-vallen-muted mt-1 font-mono break-all px-2">
            {txId}
          </p>
        </div>

        {/* Copia e Cola */}
        <button
          onClick={() => navigator.clipboard.writeText(payload)}
          className="w-full py-2 mb-3 rounded-lg border border-vallen-border text-vallen-muted hover:text-vallen-white text-sm"
        >
          Copiar código PIX
        </button>

        {error && (
          <p className="text-red-400 text-sm text-center mb-2">{error}</p>
        )}

        {/* Simular pagamento */}
        <button
          onClick={handleSimularPagamento}
          disabled={loading}
          className="w-full py-3 bg-vallen-green hover:bg-vallen-greenLight text-white font-bold rounded-lg disabled:opacity-50 mb-2"
        >
          {loading ? 'Processando...' : '✓ Simular Pagamento Aprovado'}
        </button>

        <button
          onClick={onClose}
          className="w-full py-2 text-sm text-vallen-muted hover:text-vallen-white"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

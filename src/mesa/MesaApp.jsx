import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Scanner }      from './components/Scanner.jsx'
import { CarrinhoMesa } from './components/CarrinhoMesa.jsx'
import { PixMesa }      from './components/PixMesa.jsx'
import { SucessoMesa }  from './components/SucessoMesa.jsx'

// tela: scanner | carrinho | pix | maquininha | sucesso
export default function MesaApp() {
  const { id }            = useParams()
  const [unidade, setUnidade] = useState(null)
  const [cart, setCart]   = useState([])
  const [tela, setTela]   = useState('scanner')
  const [pedidoId, setPedidoId] = useState(null)

  useEffect(() => {
    supabase.from('unidades').select('*').eq('codigo', id).single()
      .then(({ data }) => setUnidade(data))
  }, [id])

  function addItem(produto) {
    setCart(prev => {
      const i = prev.findIndex(x => x.id === produto.id)
      if (i >= 0) {
        const u = [...prev]; u[i] = { ...u[i], quantidade: u[i].quantidade + 1 }; return u
      }
      return [...prev, { ...produto, quantidade: 1 }]
    })
  }

  const total = cart.reduce((a, i) => a + i.preco * i.quantidade, 0)

  if (tela === 'sucesso') return <SucessoMesa total={total} onDone={() => { setCart([]); setTela('scanner') }} />

  return (
    <div className="flex flex-col h-dvh bg-vallen-dark text-vallen-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-vallen-black border-b border-vallen-border flex-shrink-0">
        <img src="https://d2xsxph8kpxj0f.cloudfront.net/310419663030100181/bfwXvEbkbq6M7kWytZDaKG/v3_logo_fundo_preto_85834ede.webp"
          className="h-8" alt="Vallen" />
        {unidade && <span className="text-xs text-vallen-muted border border-vallen-border rounded px-2 py-1">{unidade.nome}</span>}
        {cart.length > 0 && tela === 'scanner' && (
          <button onClick={() => setTela('carrinho')}
            className="flex items-center gap-1.5 bg-vallen-green text-white px-3 py-1.5 rounded-lg text-sm font-medium">
            🛒 {cart.length} · R$ {total.toFixed(2)}
          </button>
        )}
      </header>

      {/* Telas */}
      {tela === 'scanner' && (
        <Scanner unidadeId={unidade?.id} onScan={addItem} onCartPress={() => setTela('carrinho')} />
      )}
      {tela === 'carrinho' && (
        <CarrinhoMesa
          cart={cart} setCart={setCart}
          onVoltar={() => setTela('scanner')}
          onPix={() => setTela('pix')}
          onMaquininha={() => setTela('maquininha')}
        />
      )}
      {tela === 'pix' && (
        <PixMesa
          cart={cart} total={total} unidadeId={unidade?.id}
          onSuccess={(pid) => { setPedidoId(pid); setTela('sucesso') }}
          onVoltar={() => setTela('carrinho')}
        />
      )}
      {tela === 'maquininha' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
          <div className="text-6xl">💳</div>
          <h2 className="text-2xl font-bold text-center">Pague na maquininha</h2>
          <div className="bg-vallen-card border border-vallen-border rounded-2xl px-10 py-6 text-center">
            <p className="text-sm text-vallen-muted mb-1">Valor total</p>
            <p className="text-5xl font-black text-vallen-green">R$ {total.toFixed(2)}</p>
          </div>
          <p className="text-vallen-muted text-center text-sm">
            Use a maquininha de cartão disponível na mesa.<br/>Crédito, débito ou contactless.
          </p>
          <button onClick={() => { setCart([]); setTela('sucesso') }}
            className="w-full max-w-xs py-4 bg-vallen-green text-white font-bold rounded-xl text-lg">
            Pagamento confirmado ✓
          </button>
          <button onClick={() => setTela('carrinho')}
            className="text-sm text-vallen-muted hover:text-vallen-white">
            ← Voltar
          </button>
        </div>
      )}
    </div>
  )
}

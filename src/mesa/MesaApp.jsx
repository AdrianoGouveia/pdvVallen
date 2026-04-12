import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { tocarSucessoPagamento } from './utils/audio.js'
import { CadastroModal } from './components/CadastroModal.jsx'
import { LojaMesa }      from './components/LojaMesa.jsx'
import { Scanner }       from './components/Scanner.jsx'
import { CarrinhoMesa }  from './components/CarrinhoMesa.jsx'
import { PixMesa }       from './components/PixMesa.jsx'
import { SucessoMesa }   from './components/SucessoMesa.jsx'

// tela: loja | scanner | carrinho | pix | maquininha | sucesso
export default function MesaApp() {
  const { id } = useParams()
  const [unidade, setUnidade]   = useState(null)
  const [cart, setCart]         = useState([])
  const [tela, setTela]         = useState('loja')
  const [totalFinal, setTotalFinal] = useState(0) // capturado antes de limpar o cart
  const [salvandoMaq, setSalvandoMaq] = useState(false)

  const [cliente, setCliente] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mesa_cliente') || 'null') } catch { return null }
  })

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

  function resetar() {
    setCart([])
    setTela('loja')
    setTotalFinal(0)
  }

  // Chamado pelo PIX após confirmação
  function handlePixSucesso(pid) {
    setTotalFinal(total)
    setCart([])
    setTela('sucesso')
  }

  // Maquininha: cria pedido pendente no Supabase e vai para sucesso
  async function confirmarMaquininha() {
    const totalAtual = total
    setSalvandoMaq(true)
    try {
      await supabase.from('pedidos').insert({
        total: totalAtual,
        status: 'aguardando',
        provider: 'maquininha',
        unidade_id: unidade?.id ?? null,
      })
      // Baixar estoque
      for (const item of cart) {
        await supabase.rpc('decrementar_estoque', { produto_id: item.id, qtd: item.quantidade })
      }
    } catch (_) {}
    tocarSucessoPagamento()
    setTotalFinal(totalAtual)
    setCart([])
    setSalvandoMaq(false)
    setTela('sucesso')
  }

  if (tela === 'sucesso') return (
    <SucessoMesa total={totalFinal} cliente={cliente} onDone={resetar} />
  )

  return (
    <div className="flex flex-col h-dvh bg-vallen-dark text-vallen-white">

      {!cliente && <CadastroModal onConcluido={setCliente} />}

      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-vallen-black border-b border-vallen-border flex-shrink-0">
        <div className="flex items-center gap-3">
          {tela !== 'loja' && (
            <button
              onClick={() => setTela(
                tela === 'scanner'    ? 'loja'     :
                tela === 'carrinho'   ? 'scanner'  :
                tela === 'pix' || tela === 'maquininha' ? 'carrinho' : 'loja'
              )}
              className="text-vallen-muted hover:text-vallen-white text-xl px-1"
            >
              ←
            </button>
          )}
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310419663030100181/bfwXvEbkbq6M7kWytZDaKG/v3_logo_fundo_preto_85834ede.webp"
            className="h-7" alt="Vallen"
          />
        </div>

        <div className="flex items-center gap-3">
          {unidade && (
            <span className="text-xs text-vallen-muted border border-vallen-border rounded px-2 py-1">
              {unidade.nome}
            </span>
          )}
          {cart.length > 0 && tela !== 'carrinho' && tela !== 'pix' && tela !== 'maquininha' && (
            <button
              onClick={() => setTela('carrinho')}
              className="flex items-center gap-1.5 bg-vallen-green text-white px-3 py-1.5 rounded-xl text-xs font-bold">
              🛒 {cart.reduce((a, i) => a + i.quantidade, 0)} · R$ {total.toFixed(2)}
            </button>
          )}
        </div>
      </header>

      {/* Telas */}
      {tela === 'loja' && (
        <LojaMesa
          cart={cart}
          onAddToCart={addItem}
          onIniciarScanner={() => setTela('scanner')}
          onVerCarrinho={() => setTela('carrinho')}
        />
      )}

      {tela === 'scanner' && (
        <Scanner
          cart={cart}
          setCart={setCart}
          onScan={addItem}
          onFinalizar={() => setTela('carrinho')}
          onVoltar={() => setTela('loja')}
        />
      )}

      {tela === 'carrinho' && (
        <CarrinhoMesa
          cart={cart}
          setCart={setCart}
          cliente={cliente}
          onVoltar={() => setTela('scanner')}
          onPix={() => setTela('pix')}
          onMaquininha={() => setTela('maquininha')}
        />
      )}

      {tela === 'pix' && (
        <PixMesa
          cart={cart}
          total={total}
          unidadeId={unidade?.id}
          onSuccess={handlePixSucesso}
          onVoltar={() => setTela('carrinho')}
        />
      )}

      {tela === 'maquininha' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
          <div className="text-6xl">💳</div>
          <h2 className="text-2xl font-bold text-center">Pague na maquininha</h2>
          <div className="bg-vallen-card border border-vallen-border rounded-2xl px-10 py-6 text-center w-full max-w-xs">
            <p className="text-sm text-vallen-muted mb-1">Valor total</p>
            <p className="text-5xl font-black text-vallen-green">R$ {total.toFixed(2)}</p>
          </div>
          <p className="text-vallen-muted text-center text-sm">
            Use a maquininha de cartão disponível na mesa.<br />Crédito, débito ou contactless.
          </p>
          <button
            onClick={confirmarMaquininha}
            disabled={salvandoMaq}
            className="w-full max-w-xs py-4 bg-vallen-green hover:bg-vallen-greenLight disabled:opacity-60 text-white font-bold rounded-2xl text-lg transition-colors">
            {salvandoMaq ? 'Registrando...' : '✓ Já paguei na maquininha'}
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

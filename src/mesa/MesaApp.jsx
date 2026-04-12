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
  const [unidade, setUnidade]       = useState(null)
  const [cart, setCart]             = useState([])
  const [tela, setTela]             = useState('loja')
  const [totalFinal, setTotalFinal] = useState(0)
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

  function handlePixSucesso() {
    setTotalFinal(total)
    setCart([])
    setTela('sucesso')
  }

  async function confirmarMaquininha() {
    const totalAtual = total
    setSalvandoMaq(true)
    try {
      await supabase.from('pedidos').insert({
        total: totalAtual,
        status: 'aguardando',
        provider: 'maquininha',
        unidade_id: unidade?.id ?? null,
        ...(cliente?.id ? { cliente_id: cliente.id } : {}),
      })
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

  // Número WhatsApp do suporte
  const whatsappNum = unidade?.whatsapp?.replace(/\D/g, '')
  const whatsappUrl = whatsappNum ? `https://wa.me/55${whatsappNum}` : null

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
                tela === 'scanner'  ? 'loja'    :
                tela === 'carrinho' ? 'scanner' :
                tela === 'pix' || tela === 'maquininha' ? 'carrinho' : 'loja'
              )}
              className="text-vallen-muted hover:text-vallen-white text-xl px-1"
            >
              ←
            </button>
          )}
          <img src="/logo.png" className="h-14 w-auto object-contain" alt="Vallen" />
        </div>

        <div className="flex items-center gap-2">
          {unidade && (
            <span className="text-xs text-vallen-muted border border-vallen-border rounded px-2 py-1">
              {unidade.nome}
            </span>
          )}
          {cart.length > 0 && tela !== 'carrinho' && tela !== 'pix' && tela !== 'maquininha' && (
            <button onClick={() => setTela('carrinho')}
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
          cliente={cliente}
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
          clienteId={cliente?.id}
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
          <button onClick={confirmarMaquininha} disabled={salvandoMaq}
            className="w-full max-w-xs py-4 bg-vallen-green hover:bg-vallen-greenLight disabled:opacity-60 text-white font-bold rounded-2xl text-lg transition-colors">
            {salvandoMaq ? 'Registrando...' : '✓ Já paguei na maquininha'}
          </button>
          <button onClick={() => setTela('carrinho')}
            className="text-sm text-vallen-muted hover:text-vallen-white">
            ← Voltar
          </button>
        </div>
      )}

      {/* Botão flutuante WhatsApp */}
      {whatsappUrl && tela !== 'sucesso' && (
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
          className="fixed bottom-5 right-4 z-40 flex items-center gap-2 bg-[#25D366] hover:bg-[#20ba5a] text-white px-4 py-3 rounded-full shadow-2xl transition-all">
          <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          <span className="text-sm font-bold">Suporte</span>
        </a>
      )}
    </div>
  )
}

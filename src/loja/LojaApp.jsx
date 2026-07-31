import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { tocarSucessoPagamento } from '../mesa/utils/audio.js'
import { CadastroModal } from '../mesa/components/CadastroModal.jsx'
import { LojaMesa }      from '../mesa/components/LojaMesa.jsx'
import { Scanner }       from '../mesa/components/Scanner.jsx'
import { CarrinhoMesa }  from '../mesa/components/CarrinhoMesa.jsx'
import { PixMesa }       from '../mesa/components/PixMesa.jsx'
import { MaquininhaMesa } from '../mesa/components/MaquininhaMesa.jsx'
import { SucessoMesa }   from '../mesa/components/SucessoMesa.jsx'
import { SelecaoLoja }   from './components/SelecaoLoja.jsx'
import { InstallPrompt } from './components/InstallPrompt.jsx'

// Pagamento na maquininha física: pronto no código, ligar quando a conta
// PagBank + terminal estiverem validados. (Ver MaquininhaMesa/PedidosRepository.)
const HABILITAR_MAQUININHA = false

const LOJA_KEY    = 'loja_unidade'   // codigo da última unidade usada
const SUCESSO_KEY = 'loja_sucesso'   // persiste tela de sucesso em reload

// telas: scanner | loja | carrinho | pix | maquininha | sucesso
export default function LojaApp() {
  const { codigo: codigoParam } = useParams()

  const [codigo, setCodigo] = useState(() => codigoParam || localStorage.getItem(LOJA_KEY) || null)
  const [unidade, setUnidade] = useState(null)
  const [carregandoLoja, setCarregandoLoja] = useState(true)

  const [cart, setCart] = useState([])
  const [tela, setTela] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SUCESSO_KEY) || 'null')?.tela ?? 'scanner' } catch { return 'scanner' }
  })
  const [totalFinal, setTotalFinal] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SUCESSO_KEY) || 'null')?.totalFinal ?? 0 } catch { return 0 }
  })
  const [cliente, setCliente] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mesa_cliente') || 'null') } catch { return null }
  })
  const [showCadastro, setShowCadastro] = useState(false)
  const pendingRef = useRef(null) // ação a executar após o cadastro (ex.: ir p/ pix)

  // ── Resolução da loja ──────────────────────────────────────────────────────
  useEffect(() => {
    if (codigoParam) {
      localStorage.setItem(LOJA_KEY, codigoParam)
      setCodigo(codigoParam)
    }
  }, [codigoParam])

  // iOS: o teclado não encolhe o viewport → o layout h-dvh estoura. Amarra a altura
  // do app à área realmente visível (VisualViewport) e trava o scroll do documento.
  // Escopado ao /loja (só enquanto montado) pra não afetar totem/admin/reposição.
  useEffect(() => {
    const vv = window.visualViewport
    const root = document.documentElement
    document.body.classList.add('loja-locked')
    const sync = () => { if (vv) root.style.setProperty('--app-h', `${vv.height}px`) }
    sync()
    vv?.addEventListener('resize', sync)
    vv?.addEventListener('scroll', sync)
    return () => {
      vv?.removeEventListener('resize', sync)
      vv?.removeEventListener('scroll', sync)
      document.body.classList.remove('loja-locked')
      root.style.removeProperty('--app-h')
    }
  }, [])

  useEffect(() => {
    if (!codigo) { setCarregandoLoja(false); return }
    let ativo = true
    setCarregandoLoja(true)
    supabase.from('unidades').select('*').eq('codigo', codigo).eq('ativo', true).maybeSingle()
      .then(({ data }) => {
        if (!ativo) return
        if (data) setUnidade(data)
        else { localStorage.removeItem(LOJA_KEY); setCodigo(null); setUnidade(null) } // código inválido → seletor
        setCarregandoLoja(false)
      })
    return () => { ativo = false }
  }, [codigo])

  function selecionarLoja(cod) {
    localStorage.setItem(LOJA_KEY, cod)
    setCodigo(cod)
  }

  // ── Carrinho ────────────────────────────────────────────────────────────────
  function addItem(produto) {
    setCart(prev => {
      const i = prev.findIndex(x => x.id === produto.id)
      if (i >= 0) {
        const u = [...prev]; u[i] = { ...u[i], quantidade: u[i].quantidade + 1 }; return u
      }
      return [...prev, { ...produto, quantidade: 1 }]
    })
    // Cadastro NÃO é pedido ao escanear — só no checkout, e só se houver item +18.
  }

  const total = cart.reduce((a, i) => a + i.preco * i.quantidade, 0)

  // ── Cadastro sob demanda ─────────────────────────────────────────────────────
  // acao recebe o cliente (recém-cadastrado ou existente) para checar idade sem
  // depender do estado assíncrono `cliente`.
  function exigirCliente(acao) {
    if (cliente) { acao(cliente); return }
    pendingRef.current = acao
    setShowCadastro(true)
  }

  function onCadastroConcluido(c) {
    setCliente(c)
    setShowCadastro(false)
    const fn = pendingRef.current
    pendingRef.current = null
    if (fn) fn(c)
  }

  // Avança ao PIX, mas nunca com item +18 e cliente menor de idade.
  function irCheckout(c) {
    const bloqueado = cart.some(i => i.restrito_idade) && c?.is18 === false
    if (bloqueado) { setTela('carrinho'); return } // mantém no carrinho mostrando o bloqueio +18
    setTela('pix')
  }

  function fecharCadastro() {
    // Cancelou o cadastro → descarta ação pendente (fica no carrinho)
    pendingRef.current = null
    setShowCadastro(false)
  }

  // ── Pagamento ────────────────────────────────────────────────────────────────
  function resetar() {
    sessionStorage.removeItem(SUCESSO_KEY)
    setCart([])
    setTela('scanner')
    setTotalFinal(0)
  }

  function handlePixSucesso() {
    const t = total
    sessionStorage.setItem(SUCESSO_KEY, JSON.stringify({ tela: 'sucesso', totalFinal: t }))
    setTotalFinal(t)
    setCart([])
    setTela('sucesso')
  }

  function handleMaquininhaSucesso() {
    const t = total
    tocarSucessoPagamento()
    sessionStorage.setItem(SUCESSO_KEY, JSON.stringify({ tela: 'sucesso', totalFinal: t }))
    setTotalFinal(t)
    setCart([])
    setTela('sucesso')
  }

  function voltar() {
    setTela(
      tela === 'loja'      ? 'scanner'  :
      tela === 'carrinho'  ? 'scanner'  :
      tela === 'pix'       ? 'carrinho' :
      tela === 'maquininha'? 'carrinho' : 'scanner'
    )
  }

  // ── Sucesso (renderiza antes de resolver loja: sobrevive a reload) ───────────
  if (tela === 'sucesso') return (
    <SucessoMesa total={totalFinal} cliente={cliente} onDone={resetar} />
  )

  // ── Estados de resolução da loja ─────────────────────────────────────────────
  if (carregandoLoja) return (
    <div className="flex flex-col items-center justify-center h-dvh bg-vallen-dark gap-3">
      <div className="w-10 h-10 border-4 border-vallen-green border-t-transparent rounded-full animate-spin" />
      <p className="text-vallen-muted text-sm">Abrindo a loja...</p>
    </div>
  )

  if (!unidade) return <SelecaoLoja onSelecionar={selecionarLoja} />

  // ── App ──────────────────────────────────────────────────────────────────────
  const whatsappNum = unidade?.whatsapp?.replace(/\D/g, '')
  const whatsappUrl = whatsappNum ? `https://wa.me/55${whatsappNum}` : null
  const totalItens  = cart.reduce((a, i) => a + i.quantidade, 0)
  const mostrarPill = cart.length > 0 && tela !== 'carrinho' && tela !== 'pix' && tela !== 'maquininha'

  return (
    <div className="flex flex-col bg-vallen-dark text-vallen-white overflow-hidden" style={{ height: 'var(--app-h, 100dvh)' }}>

      {showCadastro && <CadastroModal onConcluido={onCadastroConcluido} onFechar={fecharCadastro} />}

      {/* Header */}
      <header className="flex items-center justify-between gap-2 px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] bg-vallen-black border-b border-vallen-border flex-shrink-0 overflow-hidden">
        <div className="flex items-center gap-3 min-w-0">
          {tela !== 'scanner' && (
            <button onClick={voltar} className="text-vallen-muted hover:text-vallen-white text-2xl leading-none p-2 -m-2 flex-shrink-0">←</button>
          )}
          <img src="/logo.png" className="h-12 w-auto object-contain flex-shrink-0" alt="Vallen" />
        </div>

        <div className="flex items-center gap-2 min-w-0">
          {unidade && (
            <span className="text-xs text-vallen-muted border border-vallen-border rounded px-2 py-1 max-w-[28vw] truncate min-w-0">
              {unidade.nome}
            </span>
          )}
          {mostrarPill && (
            <button onClick={() => setTela('carrinho')}
              className="flex items-center gap-1.5 bg-vallen-green text-white px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0 whitespace-nowrap">
              🛒 {totalItens} · R$ {total.toFixed(2)}
            </button>
          )}
        </div>
      </header>

      {/* Telas */}
      {tela === 'scanner' && (
        <>
          <InstallPrompt />
          <Scanner
            cart={cart}
            setCart={setCart}
            onScan={addItem}
            onFinalizar={() => setTela('carrinho')}
            onVoltar={() => setTela('loja')}
          />
        </>
      )}

      {tela === 'loja' && (
        <LojaMesa
          cart={cart}
          cliente={cliente}
          onAddToCart={addItem}
          onIniciarScanner={() => setTela('scanner')}
          onVerCarrinho={() => setTela('carrinho')}
        />
      )}

      {tela === 'carrinho' && (
        <CarrinhoMesa
          cart={cart}
          setCart={setCart}
          cliente={cliente}
          onVoltar={() => setTela('scanner')}
          onPix={() => (cart.some(i => i.restrito_idade) ? exigirCliente(irCheckout) : setTela('pix'))}
          onMaquininha={HABILITAR_MAQUININHA ? () => exigirCliente(() => setTela('maquininha')) : undefined}
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

      {HABILITAR_MAQUININHA && tela === 'maquininha' && (
        <MaquininhaMesa
          cart={cart}
          total={total}
          unidadeId={unidade?.id}
          clienteId={cliente?.id}
          onSuccess={handleMaquininhaSucesso}
          onVoltar={() => setTela('carrinho')}
        />
      )}

      {/* Suporte WhatsApp */}
      {whatsappUrl && (
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
          className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-4 z-40 flex items-center gap-2 bg-[#25D366] hover:bg-[#20ba5a] text-white px-4 py-3 rounded-full shadow-2xl transition-all">
          <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          <span className="text-sm font-bold">Suporte</span>
        </a>
      )}
    </div>
  )
}

import { useState } from 'react'
import { FranqueadoProvider, useFranqueado } from '../admin/lib/franqueadoContext'
import { supabase } from '../lib/supabase'
import { useAuthz } from './lib/useAuthz'
import { Home } from './screens/Home'
import { Auditoria } from './screens/Auditoria'
import { Preco } from './screens/Preco'
import { Cadastro } from './screens/Cadastro'
import { Validade } from './screens/Validade'
import { Aprovacoes } from './screens/Aprovacoes'

const Spinner = () => (
  <div className="flex items-center justify-center h-screen bg-vallen-dark">
    <div className="w-10 h-10 border-4 border-vallen-green border-t-transparent rounded-full animate-spin" />
  </div>
)

// -------- Login do operador
function LoginOperador() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [err, setErr]     = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr(''); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    setLoading(false)
    if (error) setErr('E-mail ou senha errados')
  }
  return (
    <div className="flex items-center justify-center min-h-screen bg-vallen-dark p-6">
      <form onSubmit={submit} className="bg-vallen-card border border-vallen-border rounded-2xl p-8 w-full max-w-sm space-y-4">
        <img src="/logo.png" className="h-14 mx-auto" alt="Vallen" />
        <h2 className="text-center text-vallen-white font-bold text-xl">Operador</h2>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="E-mail" autoFocus inputMode="email"
          className="w-full bg-vallen-dark border border-vallen-border rounded-xl px-4 py-3.5 text-lg text-vallen-white focus:outline-none focus:border-vallen-green" />
        <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
          placeholder="Senha"
          className="w-full bg-vallen-dark border border-vallen-border rounded-xl px-4 py-3.5 text-lg text-vallen-white focus:outline-none focus:border-vallen-green" />
        {err && <p className="text-red-400 text-sm text-center">{err}</p>}
        <button disabled={loading || !email || !senha}
          className="w-full py-4 bg-vallen-green text-white font-bold rounded-xl text-lg hover:bg-vallen-greenLight disabled:opacity-50">
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

// -------- Seleção de loja (franqueado + unidade)
function SelecaoLoja() {
  const { franqueados, franqueadoId, selectFranqueado, unidades, unidadeId, selectUnidade, logout } = useFranqueado()
  const precisaFranq = franqueados.length > 1 && !franqueadoId
  return (
    <div className="min-h-screen bg-vallen-dark flex flex-col">
      <header className="px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-4 bg-vallen-black border-b border-vallen-border flex items-center justify-between">
        <img src="/logo.png" className="h-9" alt="Vallen" />
        <button onClick={logout} className="text-vallen-muted text-sm px-3 py-2 rounded-lg border border-vallen-border">Sair</button>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <h2 className="text-vallen-white font-bold text-lg">
          {precisaFranq ? 'Escolha o franqueado' : 'Escolha a loja'}
        </h2>
        {precisaFranq
          ? franqueados.map(f => (
              <button key={f.id} onClick={() => selectFranqueado(f.id)}
                className="w-full text-left bg-vallen-card border border-vallen-border rounded-xl px-4 py-4 text-vallen-white font-semibold active:bg-vallen-black">
                {f.nome_fantasia || f.razao_social}
              </button>
            ))
          : unidades.length === 0
            ? <p className="text-vallen-muted">Nenhuma loja ativa para este franqueado.</p>
            : unidades.map(u => (
                <button key={u.id} onClick={() => selectUnidade(u.id)}
                  className="w-full text-left bg-vallen-card border border-vallen-border rounded-xl px-4 py-4 active:bg-vallen-black">
                  <p className="text-vallen-white font-bold">{u.nome}</p>
                  {u.cidade && <p className="text-vallen-muted text-sm">{u.cidade}</p>}
                </button>
              ))}
        {!precisaFranq && franqueados.length > 1 && (
          <button onClick={() => selectFranqueado(null)} className="text-vallen-green text-sm px-1 py-2">← trocar franqueado</button>
        )}
      </div>
    </div>
  )
}

// -------- Shell (auth gate + roteamento entre telas)
function Shell() {
  const {
    loading, session, franqueados, franqueadoId,
    unidades, unidadeId, selectUnidade, logout,
  } = useFranqueado()
  const authz = useAuthz(franqueadoId)
  const [tela, setTela] = useState('home')

  if (loading) return <Spinner />
  if (!session) return <LoginOperador />
  if (!franqueadoId || !unidadeId) return <SelecaoLoja />

  const unidade = unidades.find(u => u.id === unidadeId)
  const franq   = franqueados.find(f => f.id === franqueadoId)
  const unidadeNome = unidade?.nome || ''
  const voltar = () => setTela('home')
  const props = { unidadeId, unidadeNome, onVoltar: voltar }

  let conteudo
  switch (tela) {
    case 'auditoria': conteudo = <Auditoria {...props} />; break
    case 'preco':     conteudo = <Preco {...props} podeAjustarPreco={authz.podeAjustarPreco} />; break
    case 'cadastro':  conteudo = <Cadastro {...props} />; break
    case 'validade':  conteudo = <Validade {...props} />; break
    case 'aprovacoes':conteudo = authz.role === 'admin' ? <Aprovacoes {...props} /> : null; break
    default: conteudo = null
  }
  if (!conteudo) {
    conteudo = (
      <Home
        unidadeNome={unidadeNome}
        franqueadoNome={franq?.nome_fantasia || franq?.razao_social}
        podeAprovar={authz.role === 'admin'}
        onNav={setTela}
        onTrocarUnidade={() => { selectUnidade(null); }}
        onSair={logout}
      />
    )
  }
  return <div className="h-[100dvh] flex flex-col bg-vallen-dark overflow-hidden">{conteudo}</div>
}

export default function OperadorApp() {
  return (
    <FranqueadoProvider>
      <Shell />
    </FranqueadoProvider>
  )
}

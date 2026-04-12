import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export function CadastroModal({ onConcluido }) {
  const [form, setForm]   = useState({ nome: '', telefone: '', nascimento: '' })
  const [erro, setErro]   = useState('')
  const [loading, setLoading] = useState(false)

  function set(campo, valor) {
    setErro('')
    setForm(f => ({ ...f, [campo]: valor }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const { nome, telefone, nascimento } = form

    // Validação de idade
    const idade = (Date.now() - new Date(nascimento).getTime()) / (1000 * 3600 * 24 * 365.25)
    if (isNaN(idade) || idade < 18) {
      setErro('Você precisa ter 18 anos ou mais para continuar.')
      return
    }

    setLoading(true)
    await supabase.from('clientes').insert({ nome, telefone, data_nascimento: nascimento })
    localStorage.setItem('mesa_cliente', JSON.stringify({ nome, telefone, nascimento }))
    setLoading(false)
    onConcluido({ nome, telefone })
  }

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm bg-vallen-card border border-vallen-border rounded-2xl p-6 space-y-5">

        <div className="text-center space-y-1">
          <div className="text-4xl mb-2">👋</div>
          <h2 className="text-xl font-black text-vallen-white">Bem-vindo à Vallen Market!</h2>
          <p className="text-sm text-vallen-muted">Precisamos de alguns dados para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-vallen-muted font-medium">Nome completo</label>
            <input
              value={form.nome}
              onChange={e => set('nome', e.target.value)}
              placeholder="Seu nome"
              required
              className="w-full bg-vallen-dark border border-vallen-border rounded-xl px-4 py-3.5 text-base text-vallen-white focus:outline-none focus:border-vallen-green"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-vallen-muted font-medium">Telefone (com DDD)</label>
            <input
              value={form.telefone}
              onChange={e => set('telefone', e.target.value)}
              placeholder="11987654321"
              type="tel"
              inputMode="numeric"
              required
              className="w-full bg-vallen-dark border border-vallen-border rounded-xl px-4 py-3.5 text-base text-vallen-white focus:outline-none focus:border-vallen-green"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-vallen-muted font-medium">Data de nascimento</label>
            <input
              value={form.nascimento}
              onChange={e => set('nascimento', e.target.value)}
              type="date"
              required
              className="w-full bg-vallen-dark border border-vallen-border rounded-xl px-4 py-3.5 text-base text-vallen-white focus:outline-none focus:border-vallen-green"
            />
          </div>

          {erro && (
            <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3">
              <p className="text-red-400 text-sm text-center">{erro}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-vallen-green hover:bg-vallen-greenLight disabled:opacity-50 text-white font-bold rounded-xl text-base transition-colors"
          >
            {loading ? 'Salvando...' : 'Confirmar e continuar'}
          </button>
        </form>

        <p className="text-xs text-vallen-gray text-center">
          Seus dados são usados apenas para fins de segurança e conformidade legal.
        </p>
      </div>
    </div>
  )
}

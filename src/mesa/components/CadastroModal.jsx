import { useState } from 'react'
import { supabase } from '../../lib/supabase'

function mascaraData(valor) {
  const digits = valor.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0,2)}/${digits.slice(2)}`
  return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4)}`
}

function parseDDMMAAAA(str) {
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  return new Date(`${m[3]}-${m[2]}-${m[1]}`)
}

function calcularIs18(dataNasc) {
  return (Date.now() - dataNasc.getTime()) / (1000 * 3600 * 24 * 365.25) >= 18
}

export function CadastroModal({ onConcluido }) {
  const [form, setForm]     = useState({ nome: '', telefone: '', nascimento: '' })
  const [erro, setErro]     = useState('')
  const [aviso, setAviso]   = useState('') // mensagem amarela (não bloqueante)
  const [loading, setLoading] = useState(false)

  function set(campo, valor) {
    setErro(''); setAviso('')
    setForm(f => ({ ...f, [campo]: valor }))
  }

  function handleNascimento(e) {
    setErro(''); setAviso('')
    setForm(f => ({ ...f, nascimento: mascaraData(e.target.value) }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const { nome, telefone, nascimento } = form

    if (nascimento.length < 10) {
      setErro('Digite a data completa: DD/MM/AAAA')
      return
    }

    const dataNasc = parseDDMMAAAA(nascimento)
    if (!dataNasc || isNaN(dataNasc.getTime())) {
      setErro('Data inválida. Use o formato DD/MM/AAAA')
      return
    }

    const is18 = calcularIs18(dataNasc)
    const isoDate = `${nascimento.slice(6)}-${nascimento.slice(3,5)}-${nascimento.slice(0,2)}`

    setLoading(true)

    // Verificar se telefone já está cadastrado
    const { data: existente } = await supabase
      .from('clientes')
      .select('id, nome, telefone, data_nascimento')
      .eq('telefone', telefone)
      .maybeSingle()

    if (existente) {
      // Cadastro já existe — calcula is18 da data original e segue em frente
      const dataNascExistente = new Date(existente.data_nascimento)
      const is18Existente = calcularIs18(dataNascExistente)
      const clienteData = { nome: existente.nome, telefone: existente.telefone, is18: is18Existente }
      localStorage.setItem('mesa_cliente', JSON.stringify(clienteData))
      setLoading(false)
      onConcluido(clienteData)
      return
    }

    // Novo cadastro — qualquer idade pode se cadastrar
    await supabase.from('clientes').insert({ nome, telefone, data_nascimento: isoDate })
    const clienteData = { nome, telefone, is18 }
    localStorage.setItem('mesa_cliente', JSON.stringify(clienteData))
    setLoading(false)
    onConcluido(clienteData)
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
              onChange={handleNascimento}
              placeholder="DD/MM/AAAA"
              inputMode="numeric"
              maxLength={10}
              required
              className="w-full bg-vallen-dark border border-vallen-border rounded-xl px-4 py-3.5 text-base text-vallen-white focus:outline-none focus:border-vallen-green tracking-widest"
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
            {loading ? 'Verificando...' : 'Confirmar e continuar'}
          </button>
        </form>

        <p className="text-xs text-vallen-gray text-center">
          Seus dados são usados apenas para fins de segurança e conformidade legal.
        </p>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { supabase } from '../lib/supabase'

function formatCpf(value) {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
    .slice(0, 14)
}

function calcularIdade(dataNascimento) {
  const nascimento = new Date(dataNascimento)
  const hoje = new Date()
  let idade = hoje.getFullYear() - nascimento.getFullYear()
  const aniversarioEsseAno = new Date(hoje.getFullYear(), nascimento.getMonth(), nascimento.getDate())
  if (hoje < aniversarioEsseAno) idade--
  return idade
}

// ── Etapas ────────────────────────────────────────────────────────────────
// 'cpf'      — digitar CPF
// 'birthday' — cliente já existe: confirmar dia e mês
// 'register' — cliente novo: preencher nome e data de nascimento

export function AgeVerificationModal({ onVerified, onClose }) {
  const [step, setStep]       = useState('cpf')
  const [cpf, setCpf]         = useState('')
  const [dia, setDia]         = useState('')
  const [mes, setMes]         = useState('')
  const [nome, setNome]       = useState('')
  const [dataNasc, setDataNasc] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [clienteDb, setClienteDb] = useState(null)

  // ── ETAPA 1: verificar CPF ────────────────────────────────────────────────
  async function handleCpfSubmit(e) {
    e.preventDefault()
    setError('')
    const cpfRaw = cpf.replace(/\D/g, '')
    if (cpfRaw.length !== 11) {
      setError('CPF inválido. Digite os 11 dígitos.')
      return
    }
    setLoading(true)

    const { data, error: dbError } = await supabase
      .from('clientes')
      .select('*')
      .eq('cpf', cpfRaw)
      .single()

    setLoading(false)

    if (!dbError && data) {
      // Cliente já cadastrado — pede confirmação do dia/mês
      setClienteDb(data)
      setStep('birthday')
    } else {
      // CPF não existe — abre cadastro manual
      setStep('register')
    }
  }

  // ── ETAPA 2a: cliente existente — confirmar dia e mês ────────────────────
  async function handleBirthdaySubmit(e) {
    e.preventDefault()
    setError('')
    if (!clienteDb) return

    const nascimento = new Date(clienteDb.data_nascimento)
    const diaDb = nascimento.getUTCDate()
    const mesDb = nascimento.getUTCMonth() + 1

    if (parseInt(dia) !== diaDb || parseInt(mes) !== mesDb) {
      setError('Data de nascimento incorreta. Tente novamente.')
      return
    }

    if (calcularIdade(clienteDb.data_nascimento) < 18) {
      setError('Cliente menor de idade. Venda não permitida.')
      return
    }

    onVerified()
  }

  // ── ETAPA 2b: cliente novo — cadastrar e liberar ──────────────────────────
  async function handleRegisterSubmit(e) {
    e.preventDefault()
    setError('')

    if (!nome.trim()) {
      setError('Informe o nome completo.')
      return
    }
    if (!dataNasc) {
      setError('Informe a data de nascimento.')
      return
    }
    if (calcularIdade(dataNasc) < 18) {
      setError('Cliente menor de idade. Venda não permitida.')
      return
    }

    setLoading(true)
    const cpfRaw = cpf.replace(/\D/g, '')

    const { error: insertError } = await supabase.from('clientes').insert({
      cpf:             cpfRaw,
      nome:            nome.trim(),
      data_nascimento: dataNasc,
    })

    setLoading(false)

    if (insertError) {
      setError('Erro ao salvar. Tente novamente.')
      return
    }

    onVerified()
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-vallen-card border border-vallen-border rounded-xl w-full max-w-sm p-6 shadow-2xl">

        {/* Header */}
        <div className="text-center mb-6">
          <span className="text-5xl">🔞</span>
          <h2 className="text-xl font-bold text-vallen-white mt-2">Verificação de Idade</h2>
          <p className="text-sm text-vallen-muted mt-1">
            Produto restrito para maiores de 18 anos.
          </p>
        </div>

        {/* ── ETAPA: CPF ── */}
        {step === 'cpf' && (
          <form onSubmit={handleCpfSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-vallen-muted mb-1">Digite seu CPF</label>
              <input
                type="text"
                inputMode="numeric"
                value={cpf}
                onChange={e => setCpf(formatCpf(e.target.value))}
                placeholder="000.000.000-00"
                autoFocus
                className="w-full bg-vallen-dark border border-vallen-border rounded-lg px-4 py-3 text-center text-xl tracking-widest text-vallen-white focus:outline-none focus:border-vallen-green"
              />
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-vallen-green hover:bg-vallen-greenLight text-white font-bold rounded-lg disabled:opacity-50"
            >
              {loading ? 'Consultando...' : 'Continuar'}
            </button>
            <button type="button" onClick={onClose}
              className="w-full py-2 text-sm text-vallen-muted hover:text-vallen-white">
              Cancelar
            </button>
          </form>
        )}

        {/* ── ETAPA: CONFIRMAR DIA/MÊS (cliente existente) ── */}
        {step === 'birthday' && (
          <form onSubmit={handleBirthdaySubmit} className="space-y-4">
            <p className="text-sm text-vallen-muted text-center">
              Olá, <strong className="text-vallen-white">{clienteDb?.nome}</strong>!<br />
              Confirme seu dia e mês de nascimento.
            </p>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-vallen-muted mb-1">Dia</label>
                <input
                  type="number" min="1" max="31" inputMode="numeric"
                  value={dia} onChange={e => setDia(e.target.value)}
                  placeholder="DD"
                  className="w-full bg-vallen-dark border border-vallen-border rounded-lg px-3 py-3 text-center text-xl text-vallen-white focus:outline-none focus:border-vallen-green"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-vallen-muted mb-1">Mês</label>
                <input
                  type="number" min="1" max="12" inputMode="numeric"
                  value={mes} onChange={e => setMes(e.target.value)}
                  placeholder="MM"
                  className="w-full bg-vallen-dark border border-vallen-border rounded-lg px-3 py-3 text-center text-xl text-vallen-white focus:outline-none focus:border-vallen-green"
                />
              </div>
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              className="w-full py-3 bg-vallen-green hover:bg-vallen-greenLight text-white font-bold rounded-lg"
            >
              Confirmar
            </button>
            <button type="button" onClick={onClose}
              className="w-full py-2 text-sm text-vallen-muted hover:text-vallen-white">
              Cancelar
            </button>
          </form>
        )}

        {/* ── ETAPA: CADASTRO MANUAL (cliente novo) ── */}
        {step === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            <p className="text-sm text-vallen-muted text-center">
              CPF não encontrado. Preencha seus dados para continuar.
            </p>
            <div>
              <label className="block text-xs text-vallen-muted mb-1">Nome completo</label>
              <input
                type="text"
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Seu nome"
                autoFocus
                className="w-full bg-vallen-dark border border-vallen-border rounded-lg px-4 py-3 text-vallen-white focus:outline-none focus:border-vallen-green"
              />
            </div>
            <div>
              <label className="block text-xs text-vallen-muted mb-1">Data de nascimento</label>
              <input
                type="date"
                value={dataNasc}
                onChange={e => setDataNasc(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full bg-vallen-dark border border-vallen-border rounded-lg px-4 py-3 text-vallen-white focus:outline-none focus:border-vallen-green"
              />
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-vallen-green hover:bg-vallen-greenLight text-white font-bold rounded-lg disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Cadastrar e Continuar'}
            </button>
            <button type="button" onClick={() => setStep('cpf')}
              className="w-full py-2 text-sm text-vallen-muted hover:text-vallen-white">
              Voltar
            </button>
          </form>
        )}

      </div>
    </div>
  )
}

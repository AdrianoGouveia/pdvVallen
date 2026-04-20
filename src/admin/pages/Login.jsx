import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [err, setErr]     = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    setLoading(false)
    if (error) setErr(error.message || 'Falha ao entrar')
  }

  return (
    <div className="flex items-center justify-center h-screen bg-vallen-dark">
      <form onSubmit={submit}
        className="bg-vallen-card border border-vallen-border rounded-xl p-8 w-96 space-y-4">
        <img src="/logo.png" className="h-16 mx-auto" alt="Vallen" />
        <h2 className="text-center text-vallen-white font-bold text-lg">Painel Admin</h2>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="E-mail" autoFocus
          className="w-full bg-vallen-dark border border-vallen-border rounded-lg px-4 py-3 text-vallen-white focus:outline-none focus:border-vallen-green" />
        <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
          placeholder="Senha"
          className="w-full bg-vallen-dark border border-vallen-border rounded-lg px-4 py-3 text-vallen-white focus:outline-none focus:border-vallen-green" />
        {err && <p className="text-red-400 text-sm text-center">{err}</p>}
        <button disabled={loading || !email || !senha}
          className="w-full py-3 bg-vallen-green text-white font-bold rounded-lg hover:bg-vallen-greenLight disabled:opacity-50">
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

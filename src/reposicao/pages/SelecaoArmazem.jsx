import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import { LogoVR }   from '../components/Logo.jsx'

export default function SelecaoArmazem({ onEntrar }) {
  const [condominios, setCondominios] = useState([])
  const [armazens, setArmazens]       = useState([])
  const [cond, setCond]               = useState('')
  const [arm, setArm]                 = useState('')
  const [loading, setLoading]         = useState(true)

  useEffect(() => {
    supabase.from('unidades').select('*').eq('ativo', true).order('nome')
      .then(({ data }) => {
        const todos = data || []
        setCondominios(todos.filter(u => u.tipo !== 'armazem'))
        setArmazens(todos.filter(u => u.tipo === 'armazem'))
        setLoading(false)
      })
  }, [])

  function entrar() {
    const condominio = condominios.find(c => c.id === parseInt(cond))
    const armazem    = armazens.find(a => a.id === parseInt(arm))
    if (condominio && armazem) onEntrar({ condominio, armazem })
  }

  const pronto = cond && arm

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">

      {/* Logo + título */}
      <div className="flex flex-col items-center mb-10">
        <LogoVR size={72} />
        <h1 className="mt-5 text-3xl font-black text-white tracking-tight">Vallen</h1>
        <p className="text-pink-500 font-bold text-sm tracking-[0.3em] uppercase mt-1">Reposição</p>
      </div>

      <div className="w-full max-w-sm space-y-5">

        {/* Select — Condomínio */}
        <div>
          <label className="block text-xs text-pink-400 font-bold uppercase tracking-[0.15em] mb-2">
            Condomínio
          </label>
          <div className="relative">
            <select
              value={cond}
              onChange={e => { setCond(e.target.value); setArm('') }}
              disabled={loading}
              className="w-full appearance-none bg-zinc-900 border-2 border-zinc-700 focus:border-pink-500 text-white rounded-2xl px-5 py-4 text-base focus:outline-none transition-colors disabled:opacity-40 cursor-pointer"
            >
              <option value="">
                {loading ? 'Carregando...' : 'Selecione o condomínio...'}
              </option>
              {condominios.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            {/* Seta customizada */}
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-pink-500 text-lg">▾</span>
          </div>
        </div>

        {/* Select — Armazém (aparece após escolher condomínio) */}
        {cond && (
          <div style={{ animation: 'fadeSlideIn 0.2s ease-out' }}>
            <label className="block text-xs text-pink-400 font-bold uppercase tracking-[0.15em] mb-2">
              Armazém de origem
            </label>
            <div className="relative">
              <select
                value={arm}
                onChange={e => setArm(e.target.value)}
                className="w-full appearance-none bg-zinc-900 border-2 border-zinc-700 focus:border-pink-500 text-white rounded-2xl px-5 py-4 text-base focus:outline-none transition-colors cursor-pointer"
              >
                <option value="">Selecione o armazém...</option>
                {armazens.map(a => (
                  <option key={a.id} value={a.id}>{a.nome}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-pink-500 text-lg">▾</span>
            </div>
          </div>
        )}

        {/* Botão entrar */}
        <button
          onClick={entrar}
          disabled={!pronto}
          className={`w-full py-5 rounded-2xl font-black text-xl text-white transition-all duration-200 active:scale-95
            ${pronto
              ? 'bg-pink-500 hover:bg-pink-400 shadow-[0_0_35px_rgba(236,72,153,0.45)] hover:shadow-[0_0_50px_rgba(236,72,153,0.65)]'
              : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'}`}
        >
          Entrar no Armazém →
        </button>
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

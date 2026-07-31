import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { InstallPrompt } from './InstallPrompt'

/** Seletor de unidade quando o app é aberto sem loja definida (sem QR). */
export function SelecaoLoja({ onSelecionar }) {
  const [lista, setLista] = useState(null) // null = carregando
  const [erro, setErro]   = useState('')

  useEffect(() => {
    supabase.from('unidades')
      .select('codigo,nome,cidade')
      .eq('ativo', true)
      .order('nome')
      .then(({ data, error }) => {
        if (error) { setErro(error.message); setLista([]) }
        else setLista(data || [])
      })
  }, [])

  return (
    <div className="flex flex-col h-dvh bg-vallen-dark text-vallen-white">
      <header className="flex items-center px-4 py-3 bg-vallen-black border-b border-vallen-border flex-shrink-0">
        <img src="/logo.png" className="h-12 w-auto object-contain" alt="Vallen" />
      </header>

      <InstallPrompt />

      <div className="flex-1 overflow-y-auto px-4 py-6">
        <h1 className="text-2xl font-black text-vallen-white">Escolha a loja</h1>
        <p className="text-sm text-vallen-muted mt-1 mb-5">
          Selecione a unidade Vallen onde você está.
        </p>

        {lista === null && (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="w-9 h-9 border-4 border-vallen-green border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-vallen-muted">Buscando lojas...</p>
          </div>
        )}

        {erro && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3 mb-4">
            <p className="text-red-400 text-sm text-center">{erro}</p>
          </div>
        )}

        {lista && lista.length === 0 && !erro && (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-vallen-muted">
            <span className="text-4xl">🏪</span>
            <p className="text-sm">Nenhuma loja disponível no momento.</p>
          </div>
        )}

        {lista && lista.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {lista.map(u => (
              <button key={u.codigo} onClick={() => onSelecionar(u.codigo)}
                className="w-full flex items-center justify-between gap-3 bg-vallen-card border border-vallen-border hover:border-vallen-green rounded-2xl px-4 py-4 text-left transition-colors">
                <div className="min-w-0">
                  <p className="text-base font-bold text-vallen-white truncate">{u.nome}</p>
                  {u.cidade && <p className="text-xs text-vallen-muted truncate">{u.cidade}</p>}
                </div>
                <span className="text-vallen-green text-xl flex-shrink-0">→</span>
              </button>
            ))}
          </div>
        )}

        <p className="text-xs text-vallen-gray text-center mt-8">
          Dica: escaneie o QR Code da loja para abrir direto na unidade certa.
        </p>
      </div>
    </div>
  )
}

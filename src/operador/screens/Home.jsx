// Menu principal do operador — ícones grandes, rótulo curto.
const ACOES = [
  { id: 'auditoria', emoji: '📋', label: 'Conferir estoque', cor: 'bg-vallen-green' },
  { id: 'preco',     emoji: '🏷️', label: 'Ajustar preço',    cor: 'bg-vallen-green' },
  { id: 'cadastro',  emoji: '➕', label: 'Cadastrar produto', cor: 'bg-vallen-green' },
  { id: 'validade',  emoji: '📅', label: 'Validade',          cor: 'bg-vallen-green' },
]

export function Home({ unidadeNome, franqueadoNome, podeAprovar, onNav, onTrocarUnidade, onSair }) {
  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-vallen-dark">
      <header className="px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-4 bg-vallen-black border-b border-vallen-border">
        <div className="flex items-center justify-between gap-2">
          <img src="/logo.png" className="h-9" alt="Vallen" />
          <button onClick={onSair} className="text-vallen-muted text-sm px-3 py-2 rounded-lg border border-vallen-border">Sair</button>
        </div>
        <button onClick={onTrocarUnidade}
          className="mt-3 w-full flex items-center justify-between gap-2 bg-vallen-card border border-vallen-border rounded-xl px-4 py-3 text-left">
          <div className="min-w-0">
            <p className="text-vallen-white font-bold truncate">{unidadeNome || 'Escolher loja'}</p>
            {franqueadoNome && <p className="text-vallen-muted text-xs truncate">{franqueadoNome}</p>}
          </div>
          <span className="text-vallen-green text-sm font-semibold flex-shrink-0">trocar ▾</span>
        </button>
      </header>

      <div className="flex-1 grid grid-cols-2 gap-3 p-3 content-start">
        {ACOES.map(a => (
          <button key={a.id} onClick={() => onNav(a.id)}
            className="aspect-square flex flex-col items-center justify-center gap-3 rounded-2xl bg-vallen-card border border-vallen-border active:bg-vallen-black active:scale-[.98] transition">
            <span className="text-6xl">{a.emoji}</span>
            <span className="text-vallen-white font-bold text-base text-center px-2 leading-tight">{a.label}</span>
          </button>
        ))}
      </div>

      {podeAprovar && (
        <div className="px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button onClick={() => onNav('aprovacoes')}
            className="w-full flex items-center justify-center gap-2 rounded-2xl bg-vallen-black border border-vallen-border py-4 text-vallen-white font-bold">
            <span className="text-2xl">✅</span> Aprovar preços
          </button>
        </div>
      )}
    </div>
  )
}

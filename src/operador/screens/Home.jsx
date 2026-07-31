// Menu principal do operador — ícones grandes, filtrado por permissão (RBAC).
const ACOES = [
  { id: 'auditoria',    emoji: '📋', label: 'Conferir estoque',  perm: 'estoque.contar' },
  { id: 'preco',        emoji: '🏷️', label: 'Ajustar preço',      perm: null }, // qualquer membro; sem alçada vai p/ aprovação
  { id: 'cadastro',     emoji: '➕', label: 'Cadastrar produto',  perm: 'cadastro.criar' },
  { id: 'validade',     emoji: '📅', label: 'Validade',           perm: 'validade.gerenciar' },
  { id: 'divergencias', emoji: '🔍', label: 'Validar contagem',   perm: 'estoque.validar' },
  { id: 'aprovacoes',   emoji: '✅', label: 'Aprovar preços',     perm: 'preco.aprovar' },
]

export function Home({ unidadeNome, franqueadoNome, papelLabel, pode, onNav, onTrocarUnidade, onSair }) {
  const itens = ACOES.filter(a => a.perm === null || pode(a.perm))
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
            <p className="text-vallen-muted text-xs truncate">
              {franqueadoNome}{papelLabel ? ` · ${papelLabel}` : ''}
            </p>
          </div>
          <span className="text-vallen-green text-sm font-semibold flex-shrink-0">trocar ▾</span>
        </button>
      </header>

      <div className="flex-1 grid grid-cols-2 gap-3 p-3 content-start">
        {itens.map(a => (
          <button key={a.id} onClick={() => onNav(a.id)}
            className="aspect-square flex flex-col items-center justify-center gap-3 rounded-2xl bg-vallen-card border border-vallen-border active:bg-vallen-black active:scale-[.98] transition">
            <span className="text-6xl">{a.emoji}</span>
            <span className="text-vallen-white font-bold text-base text-center px-2 leading-tight">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

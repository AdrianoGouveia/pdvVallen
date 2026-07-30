// Cabeçalho comum das telas do operador: voltar + título + nome da unidade.
export function Header({ titulo, emoji, unidadeNome, onVoltar }) {
  return (
    <header className="flex items-center gap-3 px-3 py-3 bg-vallen-black border-b border-vallen-border flex-shrink-0
      pt-[calc(0.75rem+env(safe-area-inset-top))]">
      {onVoltar && (
        <button onClick={onVoltar} aria-label="Voltar"
          className="w-11 h-11 flex items-center justify-center rounded-xl bg-vallen-card border border-vallen-border text-vallen-white text-xl flex-shrink-0">
          ←
        </button>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-vallen-white font-bold text-lg leading-tight truncate">
          {emoji && <span className="mr-1.5">{emoji}</span>}{titulo}
        </p>
        {unidadeNome && <p className="text-vallen-muted text-xs truncate">{unidadeNome}</p>}
      </div>
    </header>
  )
}

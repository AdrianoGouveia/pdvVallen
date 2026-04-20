import { useFranqueado } from '../lib/franqueadoContext.jsx'

/**
 * Tela intermediária: força escolha de franqueado e/ou unidade
 * antes de liberar as páginas multi-tenant (Pendências etc).
 */
export function SelecaoContexto() {
  const { franqueados, franqueadoId, selectFranqueado, unidades, unidadeId, selectUnidade, logout } = useFranqueado()

  const precisaFranqueado = !franqueadoId
  const precisaUnidade = !precisaFranqueado && !unidadeId

  return (
    <div className="flex items-center justify-center min-h-screen bg-vallen-dark p-6">
      <div className="bg-vallen-card border border-vallen-border rounded-xl w-full max-w-md p-8 space-y-5">
        <div className="text-center">
          <img src="/logo.png" className="h-14 mx-auto" alt="Vallen" />
          <p className="text-xs text-vallen-muted mt-2">
            {precisaFranqueado ? 'Escolha o franqueado' : 'Escolha a unidade'}
          </p>
        </div>

        {precisaFranqueado && (
          <div className="space-y-2">
            {franqueados.length === 0 && (
              <p className="text-sm text-red-400 text-center">
                Seu usuário não tem vínculo com nenhum franqueado.
              </p>
            )}
            {franqueados.map(f => (
              <button key={f.id}
                onClick={() => selectFranqueado(f.id)}
                className="w-full text-left bg-vallen-dark border border-vallen-border rounded-lg px-4 py-3 hover:border-vallen-green transition-colors">
                <div className="text-vallen-white font-semibold text-sm">{f.nome_fantasia || f.razao_social}</div>
                {f.nome_fantasia && <div className="text-xs text-vallen-muted">{f.razao_social}</div>}
              </button>
            ))}
          </div>
        )}

        {precisaUnidade && (
          <div className="space-y-2">
            {unidades.length === 0 && (
              <p className="text-sm text-red-400 text-center">
                Este franqueado não tem unidades ativas.
              </p>
            )}
            {unidades.map(u => (
              <button key={u.id}
                onClick={() => selectUnidade(u.id)}
                className="w-full text-left bg-vallen-dark border border-vallen-border rounded-lg px-4 py-3 hover:border-vallen-green transition-colors">
                <div className="text-vallen-white font-semibold text-sm">{u.nome}</div>
                <div className="text-xs text-vallen-muted">
                  {[u.codigo, u.cidade].filter(Boolean).join(' · ')}
                </div>
              </button>
            ))}
          </div>
        )}

        <button onClick={logout}
          className="w-full py-2 text-xs text-vallen-muted hover:text-red-400 transition-colors">
          Sair
        </button>
      </div>
    </div>
  )
}

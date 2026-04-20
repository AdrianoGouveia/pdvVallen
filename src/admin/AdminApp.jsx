import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { FranqueadoProvider, useFranqueado } from './lib/franqueadoContext.jsx'
import { Login } from './pages/Login.jsx'
import { SelecaoContexto } from './pages/SelecaoContexto.jsx'
import { Pendencias }    from './pages/Pendencias.jsx'
import { Condominios }   from './pages/Condominios.jsx'
import { Produtos }      from './pages/Produtos.jsx'
import { Estoque }       from './pages/Estoque.jsx'
import { Clientes }      from './pages/Clientes.jsx'
import { Pedidos }       from './pages/Pedidos.jsx'
import { Categorias }    from './pages/Categorias.jsx'

const NAV = [
  { to: '/admin/pendencias',  label: 'Pendências',  icon: '⚠️', multi: true },
  { to: '/admin/condominios', label: 'Condomínios', icon: '🏢' },
  { to: '/admin/categorias',  label: 'Categorias',  icon: '🏷️' },
  { to: '/admin/produtos',    label: 'Produtos',    icon: '📦' },
  { to: '/admin/estoque',     label: 'Estoque',     icon: '📊' },
  { to: '/admin/clientes',    label: 'Clientes',    icon: '👥' },
  { to: '/admin/pedidos',     label: 'Pedidos',     icon: '🧾' },
]

export default function AdminApp() {
  return (
    <FranqueadoProvider>
      <AdminGate />
    </FranqueadoProvider>
  )
}

function AdminGate() {
  const { session, loading, franqueadoId, unidadeId } = useFranqueado()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-vallen-dark text-vallen-muted">
        Carregando…
      </div>
    )
  }
  if (!session) return <Login />
  if (!franqueadoId || !unidadeId) return <SelecaoContexto />

  return <AdminShell />
}

function AdminShell() {
  const { logout } = useFranqueado()
  return (
    <div className="flex h-screen bg-vallen-dark text-vallen-white overflow-hidden">
      <aside className="w-52 flex-shrink-0 bg-vallen-black border-r border-vallen-border flex flex-col">
        <div className="px-4 py-5 border-b border-vallen-border">
          <img src="/logo.png" className="h-14 w-auto" alt="Vallen" />
          <p className="text-xs text-vallen-muted mt-1">Painel Administrativo</p>
        </div>
        <ContextoHeader />
        <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors
                 ${isActive ? 'bg-vallen-green text-white' : 'text-vallen-muted hover:text-vallen-white hover:bg-vallen-card'}`
              }>
              <span>{n.icon}</span>{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-vallen-border">
          <button onClick={logout}
            className="w-full py-2 text-xs text-vallen-muted hover:text-red-400 transition-colors">
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Routes>
          <Route index                 element={<Navigate to="pendencias" replace />} />
          <Route path="pendencias"     element={<Pendencias />} />
          <Route path="condominios"    element={<Condominios />} />
          <Route path="categorias"     element={<Categorias />} />
          <Route path="produtos"       element={<Produtos />} />
          <Route path="estoque"        element={<Estoque />} />
          <Route path="clientes"       element={<Clientes />} />
          <Route path="pedidos"        element={<Pedidos />} />
        </Routes>
      </main>
    </div>
  )
}

function ContextoHeader() {
  const { franqueados, franqueadoId, selectFranqueado, unidades, unidadeId, selectUnidade } = useFranqueado()
  const f = franqueados.find(x => x.id === franqueadoId)
  const u = unidades.find(x => x.id === unidadeId)

  return (
    <div className="px-3 py-3 border-b border-vallen-border space-y-2 text-xs">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-vallen-muted">Franqueado</div>
        <select value={franqueadoId || ''} onChange={e => selectFranqueado(Number(e.target.value))}
          className="mt-1 w-full bg-vallen-dark border border-vallen-border rounded px-2 py-1.5 text-vallen-white text-xs">
          {franqueados.map(x => (
            <option key={x.id} value={x.id}>{x.nome_fantasia || x.razao_social}</option>
          ))}
        </select>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-vallen-muted">Unidade</div>
        <select value={unidadeId || ''} onChange={e => selectUnidade(Number(e.target.value))}
          className="mt-1 w-full bg-vallen-dark border border-vallen-border rounded px-2 py-1.5 text-vallen-white text-xs">
          {unidades.map(x => (
            <option key={x.id} value={x.id}>{x.nome}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

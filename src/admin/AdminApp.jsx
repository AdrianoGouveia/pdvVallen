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
import { RelatorioVendas } from './pages/RelatorioVendas.jsx'
import { Usuarios }      from './pages/Usuarios.jsx'
import { Franqueados }   from './pages/Franqueados.jsx'

// Cada item exige uma permissão (RBAC). O menu e as rotas escondem o que a
// pessoa não pode. `perm: null` = visível a qualquer papel do painel.
const NAV = [
  { to: '/admin/franqueados', label: 'Franquias',   icon: '🏛️', perm: 'franqueados.gerenciar' },
  { to: '/admin/pendencias',  label: 'Pendências',  icon: '⚠️', multi: true, perm: 'pendencias.resolver' },
  { to: '/admin/condominios', label: 'Condomínios', icon: '🏢', perm: 'unidades.gerenciar' },
  { to: '/admin/categorias',  label: 'Categorias',  icon: '🏷️', perm: 'produtos.editar' },
  { to: '/admin/produtos',    label: 'Produtos',    icon: '📦', perm: 'produtos.editar' },
  { to: '/admin/estoque',     label: 'Estoque',     icon: '📊', perm: 'produtos.editar' },
  { to: '/admin/clientes',    label: 'Clientes',    icon: '👥', perm: 'relatorios.ver' },
  { to: '/admin/pedidos',     label: 'Pedidos',     icon: '🧾', perm: 'relatorios.ver' },
  { to: '/admin/vendas',      label: 'Vendas por loja', icon: '💰', perm: 'relatorios.ver' },
  { to: '/admin/usuarios',    label: 'Usuários',    icon: '🔐', perm: 'usuarios.gerenciar' },
]

export default function AdminApp() {
  return (
    <FranqueadoProvider>
      <AdminGate />
    </FranqueadoProvider>
  )
}

function AdminGate() {
  const { session, loading, franqueadoId, unidadeId, authzLoading, isSuperAdmin, papel } = useFranqueado()

  if (loading) return <Tela>Carregando…</Tela>
  if (!session) return <Login />
  if (!franqueadoId || !unidadeId) return <SelecaoContexto />
  if (authzLoading) return <Tela>Carregando permissões…</Tela>

  // O painel é para franqueado/gerente/super. Repositor não entra aqui.
  const podeAdmin = isSuperAdmin || papel === 'franqueado' || papel === 'gerente'
  if (!podeAdmin) return <SemAcesso />

  return <AdminShell />
}

function Tela({ children }) {
  return (
    <div className="flex items-center justify-center h-screen bg-vallen-dark text-vallen-muted">{children}</div>
  )
}

function SemAcesso() {
  const { logout } = useFranqueado()
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-vallen-dark gap-4 text-center px-6">
      <span className="text-5xl">🔒</span>
      <h2 className="text-vallen-white font-bold text-xl">Sem acesso ao painel</h2>
      <p className="text-vallen-muted max-w-sm">Seu perfil não tem acesso ao painel administrativo. Use o app do operador.</p>
      <div className="flex gap-3">
        <a href="/operador" className="px-5 py-2.5 bg-vallen-green text-white font-bold rounded-lg">Abrir /operador</a>
        <button onClick={logout} className="px-5 py-2.5 border border-vallen-border text-vallen-muted rounded-lg">Sair</button>
      </div>
    </div>
  )
}

function AdminShell() {
  const { logout, pode } = useFranqueado()
  const itens = NAV.filter(n => pode(n.perm))
  return (
    <div className="flex h-screen bg-vallen-dark text-vallen-white overflow-hidden">
      <aside className="w-52 flex-shrink-0 bg-vallen-black border-r border-vallen-border flex flex-col">
        <div className="px-4 py-5 border-b border-vallen-border">
          <img src="/logo.png" className="h-14 w-auto" alt="Vallen" />
          <p className="text-xs text-vallen-muted mt-1">Painel Administrativo</p>
        </div>
        <ContextoHeader />
        <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
          {itens.map(n => (
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
          <Route index                 element={<Navigate to={itens[0]?.to.replace('/admin/','') || 'pendencias'} replace />} />
          <Route path="franqueados"    element={<Guard perm="franqueados.gerenciar"><Franqueados /></Guard>} />
          <Route path="pendencias"     element={<Guard perm="pendencias.resolver"><Pendencias /></Guard>} />
          <Route path="condominios"    element={<Guard perm="unidades.gerenciar"><Condominios /></Guard>} />
          <Route path="categorias"     element={<Guard perm="produtos.editar"><Categorias /></Guard>} />
          <Route path="produtos"       element={<Guard perm="produtos.editar"><Produtos /></Guard>} />
          <Route path="estoque"        element={<Guard perm="produtos.editar"><Estoque /></Guard>} />
          <Route path="clientes"       element={<Guard perm="relatorios.ver"><Clientes /></Guard>} />
          <Route path="pedidos"        element={<Guard perm="relatorios.ver"><Pedidos /></Guard>} />
          <Route path="vendas"         element={<Guard perm="relatorios.ver"><RelatorioVendas /></Guard>} />
          <Route path="usuarios"       element={<Guard perm="usuarios.gerenciar"><Usuarios /></Guard>} />
        </Routes>
      </main>
    </div>
  )
}

// Barra a rota se o usuário não tem a permissão (defesa além do menu).
function Guard({ perm, children }) {
  const { pode } = useFranqueado()
  if (!pode(perm)) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6 text-vallen-muted">
        <span className="text-4xl">🔒</span>
        <p>Você não tem permissão para esta área.</p>
      </div>
    )
  }
  return children
}

function ContextoHeader() {
  const { franqueados, franqueadoId, selectFranqueado, unidades, unidadeId, selectUnidade, papel, isSuperAdmin } = useFranqueado()
  const papelLabel = isSuperAdmin ? 'Admin Vallen' : ({ franqueado: 'Franqueado', gerente: 'Gerente', repositor: 'Repositor' }[papel] || papel)

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
      {papelLabel && <div className="text-[10px] text-vallen-green font-semibold">● {papelLabel}</div>}
    </div>
  )
}

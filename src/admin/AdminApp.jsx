import { useState } from 'react'
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import { Condominios }  from './pages/Condominios.jsx'
import { Produtos }     from './pages/Produtos.jsx'
import { Estoque }      from './pages/Estoque.jsx'
import { Clientes }     from './pages/Clientes.jsx'
import { Pedidos }      from './pages/Pedidos.jsx'

const ADMIN_PASS = import.meta.env.VITE_ADMIN_PASS || 'vallen2024'

const NAV = [
  { to: '/admin/condominios', label: 'Condomínios', icon: '🏢' },
  { to: '/admin/produtos',    label: 'Produtos',    icon: '📦' },
  { to: '/admin/estoque',     label: 'Estoque',     icon: '📊' },
  { to: '/admin/clientes',    label: 'Clientes',    icon: '👥' },
  { to: '/admin/pedidos',     label: 'Pedidos',     icon: '🧾' },
]

function Login({ onLogin }) {
  const [pass, setPass] = useState('')
  const [err, setErr]   = useState(false)
  function submit(e) {
    e.preventDefault()
    if (pass === ADMIN_PASS) onLogin()
    else setErr(true)
  }
  return (
    <div className="flex items-center justify-center h-screen bg-vallen-dark">
      <form onSubmit={submit} className="bg-vallen-card border border-vallen-border rounded-xl p-8 w-80 space-y-4">
        <img src="/logo.png"
          className="h-16 mx-auto" alt="Vallen" />
        <h2 className="text-center text-vallen-white font-bold text-lg">Painel Admin</h2>
        <input type="password" value={pass} onChange={e => { setPass(e.target.value); setErr(false) }}
          placeholder="Senha" autoFocus
          className="w-full bg-vallen-dark border border-vallen-border rounded-lg px-4 py-3 text-vallen-white focus:outline-none focus:border-vallen-green" />
        {err && <p className="text-red-400 text-sm text-center">Senha incorreta</p>}
        <button className="w-full py-3 bg-vallen-green text-white font-bold rounded-lg hover:bg-vallen-greenLight">
          Entrar
        </button>
      </form>
    </div>
  )
}

export default function AdminApp() {
  const [auth, setAuth] = useState(() => sessionStorage.getItem('adm') === '1')
  const navigate = useNavigate()

  if (!auth) return <Login onLogin={() => { sessionStorage.setItem('adm','1'); setAuth(true) }} />

  function logout() { sessionStorage.removeItem('adm'); setAuth(false) }

  return (
    <div className="flex h-screen bg-vallen-dark text-vallen-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 flex-shrink-0 bg-vallen-black border-r border-vallen-border flex flex-col">
        <div className="px-4 py-5 border-b border-vallen-border">
          <img src="/logo.png"
            className="h-14 w-auto" alt="Vallen" />
          <p className="text-xs text-vallen-muted mt-1">Painel Administrativo</p>
        </div>
        <nav className="flex-1 py-4 space-y-1 px-2">
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

      {/* Content */}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route index element={<Navigate to="condominios" replace />} />
          <Route path="condominios" element={<Condominios />} />
          <Route path="produtos"    element={<Produtos />} />
          <Route path="estoque"     element={<Estoque />} />
          <Route path="clientes"    element={<Clientes />} />
          <Route path="pedidos"     element={<Pedidos />} />
        </Routes>
      </main>
    </div>
  )
}

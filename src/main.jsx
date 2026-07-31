import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

const AdminApp      = lazy(() => import('./admin/AdminApp.jsx'))
const MesaApp       = lazy(() => import('./mesa/MesaApp.jsx'))
const LojaApp       = lazy(() => import('./loja/LojaApp.jsx'))
const ReposicaoApp  = lazy(() => import('./reposicao/ReposicaoApp.jsx'))
const OperadorApp   = lazy(() => import('./operador/OperadorApp.jsx'))

// Auto-atualização do PWA: checa nova versão do service worker a cada 60s e ao
// voltar o foco pro app. Com registerType:'autoUpdate', o SW novo é ativado e a
// página recarrega sozinha — evita ficar preso em bundle antigo no cache.
if ('serviceWorker' in navigator) {
  const checkUpdate = () =>
    navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {})
  setInterval(checkUpdate, 60_000)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate() })
}

const Spinner = () => (
  <div className="flex items-center justify-center h-screen bg-vallen-dark">
    <div className="w-10 h-10 border-4 border-vallen-green border-t-transparent rounded-full animate-spin" />
  </div>
)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/"            element={<App />} />
          <Route path="/admin/*"    element={<AdminApp />} />
          <Route path="/mesa/:id"   element={<MesaApp />} />
          <Route path="/loja"       element={<LojaApp />} />
          <Route path="/loja/:codigo" element={<LojaApp />} />
          <Route path="/reposicao"  element={<ReposicaoApp />} />
          <Route path="/operador"   element={<OperadorApp />} />
          <Route path="*"           element={<App />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>
)

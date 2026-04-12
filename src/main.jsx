import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

const AdminApp = lazy(() => import('./admin/AdminApp.jsx'))
const MesaApp  = lazy(() => import('./mesa/MesaApp.jsx'))

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
          <Route path="/"           element={<App />} />
          <Route path="/admin/*"    element={<AdminApp />} />
          <Route path="/mesa/:id"   element={<MesaApp />} />
          <Route path="*"           element={<App />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>
)

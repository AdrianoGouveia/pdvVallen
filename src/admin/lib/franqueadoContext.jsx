import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

const Ctx = createContext(null)

const LS_FRANQ = 'adm_franq_id'
const LS_UNIDADE = 'adm_unidade_id'

export function FranqueadoProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  const [franqueados, setFranqueados] = useState([])
  const [franqueadoId, setFranqueadoId] = useState(() => {
    const v = localStorage.getItem(LS_FRANQ)
    return v ? Number(v) : null
  })

  const [unidades, setUnidades] = useState([])
  const [unidadeId, setUnidadeId] = useState(() => {
    const v = localStorage.getItem(LS_UNIDADE)
    return v ? Number(v) : null
  })

  // --- auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => {
      setSession(s)
      if (!s) {
        setFranqueados([]); setFranqueadoId(null)
        setUnidades([]); setUnidadeId(null)
        localStorage.removeItem(LS_FRANQ)
        localStorage.removeItem(LS_UNIDADE)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // --- franqueados do usuário
  useEffect(() => {
    if (!session) return
    supabase.from('usuarios_franqueados')
      .select('franqueado_id, role, franqueados ( id, razao_social, nome_fantasia )')
      .then(({ data, error }) => {
        if (error) { console.error(error); return }
        const list = (data || []).map(r => r.franqueados).filter(Boolean)
        setFranqueados(list)
        if (!franqueadoId && list.length === 1) {
          setFranqueadoId(list[0].id)
          localStorage.setItem(LS_FRANQ, String(list[0].id))
        }
      })
  }, [session])

  // --- unidades do franqueado
  useEffect(() => {
    if (!franqueadoId) { setUnidades([]); return }
    supabase.from('unidades')
      .select('id, nome, codigo, cidade, tipo')
      .eq('franqueado_id', franqueadoId)
      .eq('ativo', true)
      .order('nome')
      .then(({ data, error }) => {
        if (error) { console.error(error); return }
        setUnidades(data || [])
        // Auto-select se unidade salva não pertence mais ao franqueado atual
        if (unidadeId && !(data || []).some(u => u.id === unidadeId)) {
          setUnidadeId(null)
          localStorage.removeItem(LS_UNIDADE)
        }
        if (!unidadeId && (data || []).length === 1) {
          setUnidadeId(data[0].id)
          localStorage.setItem(LS_UNIDADE, String(data[0].id))
        }
      })
  }, [franqueadoId])

  const selectFranqueado = useCallback(id => {
    setFranqueadoId(id)
    setUnidadeId(null)
    localStorage.setItem(LS_FRANQ, String(id))
    localStorage.removeItem(LS_UNIDADE)
  }, [])

  const selectUnidade = useCallback(id => {
    setUnidadeId(id)
    localStorage.setItem(LS_UNIDADE, String(id))
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = {
    session, loading,
    user: session?.user || null,
    franqueados, franqueadoId, selectFranqueado,
    unidades, unidadeId, selectUnidade,
    logout,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useFranqueado() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useFranqueado precisa estar dentro de FranqueadoProvider')
  return ctx
}

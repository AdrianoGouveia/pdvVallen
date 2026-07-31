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

  // Autorização (RBAC) do usuário no franqueado selecionado
  const [authz, setAuthz] = useState({ papel: null, isSuperAdmin: false, permissoes: new Set(), loading: true })
  const [sessionSuper, setSessionSuper] = useState(false) // super-admin (global, nível sessão)

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
        setAuthz({ papel: null, isSuperAdmin: false, permissoes: new Set(), loading: false })
        setSessionSuper(false)
        localStorage.removeItem(LS_FRANQ)
        localStorage.removeItem(LS_UNIDADE)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // --- super-admin? (nível sessão, define de onde vêm os franqueados)
  useEffect(() => {
    if (!session) { setSessionSuper(false); return }
    let vivo = true
    supabase.rpc('eh_super_admin').then(({ data }) => { if (vivo) setSessionSuper(data === true) })
    return () => { vivo = false }
  }, [session])

  // --- franqueados: super vê todos; demais só os vínculos ativos
  useEffect(() => {
    if (!session) return
    const q = sessionSuper
      ? supabase.from('franqueados').select('id, razao_social, nome_fantasia').eq('ativo', true).order('nome_fantasia')
      : supabase.from('usuarios_franqueados')
          .select('franqueado_id, role, franqueados ( id, razao_social, nome_fantasia )').eq('ativo', true)
    q.then(({ data, error }) => {
      if (error) { console.error(error); return }
      const list = sessionSuper ? (data || []) : (data || []).map(r => r.franqueados).filter(Boolean)
      setFranqueados(list)
      if (!franqueadoId && list.length === 1) {
        setFranqueadoId(list[0].id)
        localStorage.setItem(LS_FRANQ, String(list[0].id))
      }
    })
  }, [session, sessionSuper])

  // --- autorização no franqueado selecionado (RBAC)
  useEffect(() => {
    if (!session || !franqueadoId) {
      setAuthz({ papel: null, isSuperAdmin: false, permissoes: new Set(), loading: !!session && !!franqueadoId })
      return
    }
    let vivo = true
    setAuthz(a => ({ ...a, loading: true }))
    Promise.all([
      supabase.rpc('meu_papel', { p_franqueado_id: franqueadoId }),
      supabase.rpc('minhas_permissoes', { p_franqueado_id: franqueadoId }),
    ]).then(([papelR, permR]) => {
      if (!vivo) return
      const perms = new Set((permR.data || []).map(r => (typeof r === 'string' ? r : r.minhas_permissoes)))
      setAuthz({
        papel: papelR.data || null,
        isSuperAdmin: sessionSuper,
        permissoes: perms,
        loading: false,
      })
    })
    return () => { vivo = false }
  }, [session, franqueadoId, sessionSuper])

  // --- unidades já no escopo do usuário (repositor = só as autorizadas)
  useEffect(() => {
    if (!session || !franqueadoId) { setUnidades([]); return }
    let vivo = true
    supabase.rpc('minhas_unidades', { p_franqueado_id: franqueadoId }).then(({ data, error }) => {
      if (!vivo) return
      if (error) { console.error(error); setUnidades([]); return }
      const ids = (data || []).map(r => (typeof r === 'number' ? r : r.minhas_unidades)).filter(v => v != null)
      if (ids.length === 0) {
        setUnidades([])
        if (unidadeId) { setUnidadeId(null); localStorage.removeItem(LS_UNIDADE) }
        return
      }
      supabase.from('unidades')
        .select('id, nome, codigo, cidade, tipo')
        .in('id', ids)
        .eq('ativo', true)
        .order('nome')
        .then(({ data: us }) => {
          if (!vivo) return
          const lista = us || []
          setUnidades(lista)
          if (unidadeId && !lista.some(u => u.id === unidadeId)) {
            setUnidadeId(null); localStorage.removeItem(LS_UNIDADE)
          }
          if (!unidadeId && lista.length === 1) {
            setUnidadeId(lista[0].id); localStorage.setItem(LS_UNIDADE, String(lista[0].id))
          }
        })
    })
    return () => { vivo = false }
  }, [session, franqueadoId])

  const selectFranqueado = useCallback(id => {
    setFranqueadoId(id)
    setUnidadeId(null)
    if (id == null) localStorage.removeItem(LS_FRANQ)
    else localStorage.setItem(LS_FRANQ, String(id))
    localStorage.removeItem(LS_UNIDADE)
  }, [])

  const selectUnidade = useCallback(id => {
    setUnidadeId(id)
    if (id == null) localStorage.removeItem(LS_UNIDADE)
    else localStorage.setItem(LS_UNIDADE, String(id))
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const pode = useCallback(
    (perm) => authz.isSuperAdmin || authz.permissoes.has(perm),
    [authz],
  )

  const value = {
    session, loading,
    user: session?.user || null,
    franqueados, franqueadoId, selectFranqueado,
    unidades, unidadeId, selectUnidade,
    // RBAC
    papel: authz.papel,
    isSuperAdmin: authz.isSuperAdmin,
    permissoes: authz.permissoes,
    authzLoading: authz.loading,
    pode,
    logout,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useFranqueado() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useFranqueado precisa estar dentro de FranqueadoProvider')
  return ctx
}

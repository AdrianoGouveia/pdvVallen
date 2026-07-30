import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// Lê o nível do usuário no franqueado selecionado.
// podeAjustarPreco = admin OU operador com o flag pode_ajustar_preco.
export function useAuthz(franqueadoId) {
  const [authz, setAuthz] = useState({ role: null, podeAjustarPreco: false, loading: true })

  useEffect(() => {
    if (!franqueadoId) { setAuthz({ role: null, podeAjustarPreco: false, loading: false }); return }
    let vivo = true
    supabase.from('usuarios_franqueados')
      .select('role, pode_ajustar_preco')
      .eq('franqueado_id', franqueadoId)
      .maybeSingle()
      .then(({ data }) => {
        if (!vivo) return
        setAuthz({
          role: data?.role || null,
          podeAjustarPreco: data?.role === 'admin' || data?.pode_ajustar_preco === true,
          loading: false,
        })
      })
    return () => { vivo = false }
  }, [franqueadoId])

  return authz
}

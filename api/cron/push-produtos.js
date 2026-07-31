import { createClient } from '@supabase/supabase-js'
import { DwpdvConnector } from '../_pos/DwpdvConnector.js'

// Worker (serverless) do push de produto Vallen → DWPDV. Drena integracao.produto_outbox
// e chama pushProdutos. Roda por cron da Vercel OU trigger manual (?key=CRON_SECRET).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DWPDV_ERP_CNPJ/USER/PASSWORD, CRON_SECRET.
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  const authOk = !secret
    || req.headers.authorization === `Bearer ${secret}`
    || req.query?.key === secret
  if (!authOk) return res.status(401).json({ error: 'unauthorized' })

  const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!URL || !KEY) return res.status(500).json({ error: 'faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' })
  // ERP não configurado (ex.: falta DWPDV_ERP_PASSWORD) → sai ANTES de tocar o outbox,
  // pra não marcar 'erro' à toa. O próximo run tenta de novo quando estiver configurado.
  if (!(process.env.DWPDV_ERP_PASSWORD || process.env.DWPDV_PASSWORD)) {
    return res.status(200).json({ ok: false, motivo: 'DWPDV_ERP_PASSWORD não configurado (nada foi tocado)' })
  }
  const sb = createClient(URL, KEY, { auth: { persistSession: false } })
  const integ = () => sb.schema('integracao')

  try {
    const { data: pend, error } = await integ().from('produto_outbox').select('produto_id').eq('status', 'pendente').limit(100)
    if (error) throw error
    const ids = pend.map(r => r.produto_id)
    if (!ids.length) return res.json({ ok: true, pendentes: 0, enviados: 0 })

    const { data: produtos, error: e2 } = await sb.from('produtos')
      .select('id,codigo_barras,nome,preco,categoria,catalogo_ativo,estoque:estoque_cnpj').in('id', ids)
    if (e2) throw e2
    const canon = (produtos || []).filter(p => p.codigo_barras).map(p => ({
      _id: p.id, codigoBarras: p.codigo_barras, nome: p.nome, precoReferencia: p.preco,
      estoqueDeposito: p.estoque ?? 0, categoria: p.categoria, ativo: p.catalogo_ativo === true,
    }))

    const pos = new DwpdvConnector()
    let ok = 0, err = 0
    for (const b of chunk(canon, 50)) {
      const outIds = b.map(x => x._id)
      try {
        const r = await pos.pushProdutos(b, { dryRun: false })
        const gravados = (r?.inserted ?? 0) + (r?.updated ?? 0)
        if (r?.ok === false || gravados !== b.length) throw new Error(r?.message || `parcial ${gravados}/${b.length}`)
        await integ().from('produto_outbox').update({ status: 'enviado', sent_at: new Date().toISOString(), erro: null }).in('produto_id', outIds)
        ok += b.length
      } catch (e) {
        err += b.length
        await integ().from('produto_outbox').update({ status: 'erro', erro: String(e).slice(0, 500) }).in('produto_id', outIds)
      }
    }
    res.json({ ok: true, enviados: ok, erros: err })
  } catch (e) {
    const msg = e?.message || e?.error_description || e?.hint || e?.details
      || (typeof e === 'object' ? JSON.stringify(e) : String(e))
    res.status(500).json({ error: String(msg).slice(0, 400) })
  }
}

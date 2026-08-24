import { createClient } from '@supabase/supabase-js'
import { DwpdvConnector } from '../_pos/DwpdvConnector.js'

// Worker (serverless) da importação de vendas DWPDV → integracao.venda_externa.
// Lê a API oficial (bearer+matriz), monta o payload e chama a RPC idempotente
// importar_vendas (upsert por indice). Roda por cron da VPS OU trigger manual
// (?key=CRON_SECRET). Mesmo padrão do push-produtos.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DWPDV_MATRIZ/USERNAME/PASSWORD, CRON_SECRET.
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  const authOk = !secret
    || req.headers.authorization === `Bearer ${secret}`
    || req.query?.key === secret
  if (!authOk) return res.status(401).json({ error: 'unauthorized' })

  const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!URL || !KEY) return res.status(500).json({ error: 'faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' })
  // Credenciais da API de vendas — aceita DWPDV_MATRIZ/USERNAME/PASSWORD ou, como
  // fallback, as do ERP (mesma conta DWPDV/Foodcash). Se faltar, sai sem tocar em nada.
  const temCreds = (process.env.DWPDV_MATRIZ   || process.env.DWPDV_ERP_CNPJ)
                && (process.env.DWPDV_USERNAME || process.env.DWPDV_ERP_USER)
                && (process.env.DWPDV_PASSWORD || process.env.DWPDV_ERP_PASSWORD)
  if (!temCreds) {
    return res.status(200).json({ ok: false, motivo: 'credenciais DWPDV não configuradas (nada foi tocado)' })
  }

  const sb = createClient(URL, KEY, { auth: { persistSession: false } })
  const integ = () => sb.schema('integracao')

  try {
    const pos = new DwpdvConnector()
    const vendas = await pos.pullVendasComItens()
    const payload = vendas.map(v => ({
      dwpdv_sale_id: v.externalId, codigovenda: v.codigovenda, pdv: v.pdv,
      data: v.data, total: v.total, recebido: v.recebido,
      canal: v.canal, forma_pagamento: v.formaPagamento, status: v.status,
      itens: v.itens.map(it => ({
        codigo_barras: it.codigoBarras || null, descricao: it.descricao,
        quantidade: it.quantidade, preco: it.preco, pdv: it.pdv ?? null,
      })),
    }))

    let n = 0
    for (const b of chunk(payload, 200)) {
      const { data, error } = await integ().rpc('importar_vendas', { p: b })
      if (error) throw error
      n += (typeof data === 'number' ? data : b.length)
    }
    res.json({ ok: true, vendas: payload.length, importadas: n })
  } catch (e) {
    const msg = e?.message || e?.error_description || e?.hint || e?.details
      || (typeof e === 'object' ? JSON.stringify(e) : String(e))
    res.status(500).json({ error: String(msg).slice(0, 400) })
  }
}

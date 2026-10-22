// Push de produto Vallen → Beepay: drena integracao.produto_beepay_outbox (migration
// 20261019000000). Usado por api/cron/push-produtos-beepay.js e pelo CLI (produtos-push).
//  • Um worker por vez: lease no banco, RENOVADO a cada item (backfill longo não perde a vez
//    → dois workers nunca escolhem o mesmo código de venda).
//  • Reserva a linha ANTES de ler o produto: mudança feita durante o envio volta a linha p/
//    'pendente' (trigger) e o fechamento (só de 'enviando') não a engole.
//  • Cadastro é idempotente por EAN (existe → atualiza). "Incerto" (criou e não confirmou)
//    vai p/ 'erro' sem retry — repetir poderia duplicar.
//  • Problema da CONTA (login recusado, captcha, rede, 5xx) para o lote sem gastar tentativa
//    dos itens; login recusado/captcha também gravam uma pausa (não insiste a cada 5 min).
import { randomUUID } from 'node:crypto'
import { BeepayDesafio, BeepayErro, BeepayIncerto, BeepayLoginRecusado, BeepayNaoConfigurado } from './erros.js'

const MAX_TENT = 5
const TRAVADO_MS = 15 * 60_000
const LEASE = 'lease_push_produtos'
const PAUSA = 'pausa_push_produtos'
const agora = () => new Date().toISOString()
const eanOk = (e) => /^\d+$/.test(e || '') && [8, 12, 13, 14].includes(e.length)

/** linha de public.produtos (+ preço da loja, se houver) → produto canônico p/ o conector.
 *  Sem categoria no Vallen → null: no cadastro novo vira DIVERSOS; na atualização o
 *  grupo/classe do Beepay ficam como estão. */
export function canonProduto(p, precoLoja) {
  return {
    codigoBarras: String(p.codigo_barras || '').trim(),
    nome: String(p.nome || '').trim(),
    precoReferencia: Number(precoLoja) > 0 ? Number(precoLoja) : Number(p.preco),
    categoria: p.categoria ? String(p.categoria).trim().toUpperCase() : null,
    unidade: String(p.unidade_medida || 'UN').trim().toUpperCase(),
    restritoIdade: !!p.restrito_idade,
    imagemUrl: p.imagem_url || undefined,
  }
}

// erro da conta/infra (não do item): para o lote, não conta tentativa
const ehDaConta = (e) => e instanceof BeepayDesafio || e instanceof BeepayLoginRecusado || e instanceof BeepayNaoConfigurado
  || (e instanceof BeepayErro && Number(e.status) >= 500) || e?.name === 'TypeError' || e?.name === 'AbortError' || e?.name === 'TimeoutError'

export async function drenarProdutosBeepay(sb, pos, { limite = 5, prazoMs = 8000, dry = false, log = () => {} } = {}) {
  if (!pos.web.configurado) return { ok: false, aguardando: ['BEEPAY_EMAIL/BEEPAY_PASSWORD'] }
  const integ = () => sb.schema('integracao')
  const ob = () => integ().from('produto_beepay_outbox')
  const cfg = () => integ().from('beepay_config')
  const prazo = Date.now() + prazoMs
  const leaseSeg = Math.ceil(prazoMs / 1000) + 300 // sempre maior que o prazo da execução
  const dono = randomUUID()

  const { data: pausa } = await cfg().select('valor').eq('chave', PAUSA).maybeSingle()
  if (pausa?.valor && Date.parse(pausa.valor) > Date.now()) return { ok: false, pausado_ate: pausa.valor }
  const lease = async () => {
    const { data, error } = await integ().rpc('beepay_lease', { p_chave: LEASE, p_dono: dono, p_segundos: leaseSeg })
    if (error) throw new Error(`beepay_lease: ${error.message}`)
    return data === true
  }
  if (!dry && !(await lease())) return { ok: true, ocupado: true } // outro worker rodando

  const res = { ok: true, fila: 0, criados: 0, atualizados: 0, ignorados: 0, erros: 0 }
  try {
    // 'enviando' travado (worker morreu): seguro reenviar — o cadastro casa por EAN
    if (!dry) await ob().update({ status: 'pendente', updated_at: agora() }).eq('status', 'enviando').lt('updated_at', new Date(Date.now() - TRAVADO_MS).toISOString())
    const { data: fila, error } = await ob().select('produto_id,tentativas').eq('status', 'pendente').order('updated_at').limit(limite)
    if (error) throw new Error(`produto_beepay_outbox: ${error.message}`)
    res.fila = fila.length
    if (!fila.length) return res
    const { data: fil, error: e0 } = await integ().from('beepay_filial').select('unidade_id').eq('sync_produtos', true)
    if (e0) throw new Error(`beepay_filial: ${e0.message}`)
    const unidades = fil.map(f => f.unidade_id)
    const { data: dc } = await cfg().select('valor').eq('chave', 'cod_venda_dica').maybeSingle()
    let dica = Number(dc?.valor) || 1

    const marca = (id, campos, soSe) => { let q = ob().update({ ...campos, updated_at: agora() }).eq('produto_id', id); return soSe ? q.eq('status', soSe) : q }
    for (const o of fila) {
      if (Date.now() > prazo) break
      if (!dry && !(await lease())) { res.lease_perdido = true; break } // outro worker assumiu
      // 1) reserva  2) só então lê produto + preço da loja (dado fresco)
      if (!dry) { const { data: r } = await marca(o.produto_id, { status: 'enviando' }, 'pendente').select('produto_id'); if (!r?.length) continue }
      const { data: row, error: e1 } = await sb.from('produtos')
        .select('id,codigo_barras,nome,preco,categoria,restrito_idade,imagem_url,unidade_medida').eq('id', o.produto_id).maybeSingle()
      if (e1) throw e1
      let precoLoja = null, avisoPreco = null
      if (row && unidades.length) {
        const { data: pls, error: e2 } = await sb.from('planograma').select('unidade_id,preco_venda,ativo').eq('produto_id', o.produto_id).in('unidade_id', unidades)
        if (e2) throw e2
        const precos = [...new Set(pls.filter(x => x.ativo && Number(x.preco_venda) > 0).map(x => Number(x.preco_venda)))]
        precoLoja = precos[0] ?? null
        if (precos.length > 1) avisoPreco = 'preço difere entre lojas mapeadas — usei o da 1ª'
      }
      const p = row && canonProduto(row, precoLoja)
      const motivo = !p ? 'produto não existe' : !eanOk(p.codigoBarras) ? `sem EAN válido (${p.codigoBarras || 'vazio'})` : !(p.precoReferencia > 0) ? 'sem preço' : null
      if (motivo) { res.ignorados++; if (!dry) await marca(o.produto_id, { status: 'ignorado', erro: motivo }, 'enviando'); continue }
      if (dry) { res.amostra ??= p; continue }
      try {
        const r = await pos.cadastrarProduto(p, { atualizar: true, codigoVendaMin: dica })
        if (r.acao === 'criado') {
          res.criados++
          const cod = Number(r.produto.codigoVenda)
          if (cod >= dica) { dica = cod + 1; await cfg().upsert({ chave: 'cod_venda_dica', valor: String(dica), updated_at: agora() }, { onConflict: 'chave' }) }
        } else res.atualizados++
        if (r.produto?.externalId) await integ().from('beepay_produto').upsert({ codigo_barras: p.codigoBarras, codigo: r.produto.externalId, codigo_venda: r.produto.codigoVenda ?? null, nome: p.nome, atualizado_em: agora() }, { onConflict: 'codigo_barras' })
        const avisos = [...(r.avisos || []), ...(avisoPreco ? [avisoPreco] : [])]
        // só fecha se ninguém reenfileirou durante o envio (trigger volta p/ 'pendente')
        await marca(o.produto_id, { status: 'enviado', acao: r.acao, sent_at: agora(), tentativas: 0, erro: avisos.length ? avisos.join('; ').slice(0, 500) : null }, 'enviando')
        log(`produto ${o.produto_id} ${p.codigoBarras} → Beepay ${r.acao} (cod ${r.produto?.codigoVenda})`)
      } catch (e) {
        const msg = String(e?.message || e).slice(0, 450)
        if (ehDaConta(e)) { // devolve o item intacto e para o lote
          await marca(o.produto_id, { status: 'pendente' }, 'enviando')
          if (e instanceof BeepayDesafio || e instanceof BeepayLoginRecusado) {
            const ate = new Date(Date.now() + (e instanceof BeepayDesafio ? 6 : 1) * 3600_000).toISOString()
            await cfg().upsert({ chave: PAUSA, valor: ate, updated_at: agora() }, { onConflict: 'chave' })
            res.pausado_ate = ate
          }
          res.parado = msg; log(`lote parado: ${msg}`)
          if (e instanceof BeepayDesafio) throw e
          break
        }
        res.erros++
        if (e instanceof BeepayIncerto) { await marca(o.produto_id, { status: 'erro', erro: msg }, 'enviando'); continue }
        const tent = o.tentativas + 1
        await marca(o.produto_id, { status: tent >= MAX_TENT ? 'erro' : 'pendente', tentativas: tent, erro: msg }, 'enviando')
        log(`produto ${o.produto_id} ✗ ${msg}`)
      }
    }
    return res
  } finally {
    if (!dry) await integ().rpc('beepay_lease_solta', { p_chave: LEASE, p_dono: dono })
  }
}

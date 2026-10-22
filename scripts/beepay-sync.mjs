#!/usr/bin/env node
// ==========================================================================
// Sync Vallen ⇄ Beepay Cloud, no servidor (sem o Chrome de ninguém). Uso:
//   node --env-file=.env.beepay scripts/beepay-sync.mjs <comando> [opções]
//
//   check [--ean=7894900010015]       login + GTIN + re-cadastro idempotente (não grava)
//   ean <EAN> [EAN…]                  consulta (produto da empresa + base colaborativa)
//   produtos [--dry] [--atualizar] [--max=N] [--cod-inicial=N]
//                                     cadastra no Beepay o que falta do Vallen
//                                     (catalogo_ativo ∪ planograma). --atualizar reaplica
//                                     flags (+18/autoatendimento) e foto nos existentes.
//   produtos-push [--dry] [--max=N]   drena integracao.produto_beepay_outbox (mesmo núcleo
//                                     do /api/cron/push-produtos-beepay)
//   inventario --unidade=1 --filial=40967 [--dry] [--xlsx=arq] [--incluir-zerados] [--confirmar]
//                                     planograma da unidade → planilha → PRÉVIA no Beepay.
//                                     Só grava com --confirmar (trava exclusão de operações
//                                     anteriores — rodar só a pedido do dono).
//   vendas-push [--dry] [--max=N]     drena integracao.venda_beepay_outbox → cupom/save
//                                     (mesmo núcleo do /api/cron/push-vendas-beepay)
//   vendas-pull [--desde=AAAA-MM-DD] [--ate=…] [--dry]
//                                     cupons do PDV Legal → integracao.venda_externa
//   recon --out=<dir>                 salva telas + campos (diagnóstico de mudança de tela)
//   api-info                          ids da conta p/ o .env (filial, usuário, formas…)
//   global: --debug=<dir> grava o HTML de cada passo do painel
//
// Env: BEEPAY_EMAIL, BEEPAY_PASSWORD (painel) · BEEPAY_CLIENT_ID/SECRET (API, p/ vendas)
//      BEEPAY_USUARIO BEEPAY_TERMINAL BEEPAY_FORMA_PIX|CREDITO|DEBITO (ver contaBeepayDoEnv);
//      filial por unidade = tabela integracao.beepay_filial
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (produtos/inventario/vendas)
// ==========================================================================
import { writeFile, mkdir } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { BeepayConnector, BeepayDesafio } from '../api/_pos/BeepayConnector.js'
import { planilhaInventario } from '../api/_pos/beepay/BeepayWeb.js'
import { drenarVendasBeepay, importarCuponsBeepay } from '../api/_pos/beepay/vendas.js'
import { drenarProdutosBeepay } from '../api/_pos/beepay/produtos.js'

const args = process.argv.slice(2)
const cmd = args.find(a => !a.startsWith('--'))
const posicionais = args.filter(a => !a.startsWith('--')).slice(1)
const opt = (k) => { const a = args.find(x => x === `--${k}` || x.startsWith(`--${k}=`)); return a ? (a.includes('=') ? a.split('=').slice(1).join('=') : true) : undefined }
const DRY = !!opt('dry')
const MAX = Number(opt('max')) || Infinity
const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m)

const pos = new BeepayConnector({ debugDir: opt('debug') || null, log })
const eanOk = (e) => /^\d+$/.test(e || '') && [8, 12, 13, 14].includes(e.length)

function supa() {
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env
  if (!url || !key) throw new Error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { persistSession: false } })
}
async function todas(q) { // pagina um select (ordem estável obrigatória no chamador)
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().range(from, from + 999)
    if (error) throw error
    out.push(...data); if (data.length < 1000) return out
  }
}
const cacheEan = new Map()
async function beepay(ean) { if (!cacheEan.has(ean)) cacheEan.set(ean, await pos.buscarPorEan(ean)); return cacheEan.get(ean) }

// ── comandos ──────────────────────────────────────────────────────────────────
async function check() {
  const ean = String(opt('ean') || '7894900010015')
  log('1/3 login…', JSON.stringify(await pos.login()))
  const p = await pos.buscarPorEan(ean)
  log('2/3 buscarPorEan', ean, '→', p ? JSON.stringify(p) : 'NÃO cadastrado')
  if (!p) throw new Error(`EAN ${ean} deveria existir no Beepay`)
  const r = await pos.cadastrarProduto({ codigoBarras: ean, nome: p.nome, precoReferencia: p.precoReferencia, codigoVenda: p.codigoVenda })
  log('3/3 re-cadastro →', r.acao, r.acao === 'existente' ? '(idempotente: não duplicou)' : '⚠️ inesperado')
  if (pos.api.configurado) log('API: token ok, filiais =', JSON.stringify(await pos.api.get('filial/get')).slice(0, 300))
  else log('API: sem BEEPAY_CLIENT_ID/SECRET (registro de vendas indisponível)')
}

async function ean() {
  if (!posicionais.length) throw new Error('uso: ean <EAN> [EAN…]')
  for (const e of posicionais) console.log(JSON.stringify({ ean: e, empresa: await pos.buscarPorEan(e), cru: await pos.consultarGtin(e) }, null, 1))
}

async function produtosVallen(sb) {
  const cols = 'id,codigo_barras,nome,preco,preco_custo,categoria,restrito_idade,imagem_url,unidade_medida'
  const ativos = await todas(() => sb.from('produtos').select(cols).eq('catalogo_ativo', true).order('id'))
  const plano = await todas(() => sb.from('planograma').select('produto_id').order('id'))
  const faltam = [...new Set(plano.map(r => r.produto_id))].filter(id => !ativos.some(a => a.id === id))
  const extras = []
  for (let i = 0; i < faltam.length; i += 200) {
    const { data, error } = await sb.from('produtos').select(cols).in('id', faltam.slice(i, i + 200))
    if (error) throw error; extras.push(...data)
  }
  return [...ativos, ...extras].filter(p => eanOk(p.codigo_barras) && Number(p.preco) > 0)
}

async function produtos() {
  const sb = supa()
  const lista = (await produtosVallen(sb)).slice(0, MAX)
  log(`${lista.length} produtos Vallen elegíveis (EAN válido + preço). Consultando Beepay…`)
  const existentes = [], novos = []
  let maxCod = 0
  for (const p of lista) {
    const b = await beepay(p.codigo_barras)
    if (b) { existentes.push({ p, b }); if (/^\d+$/.test(b.codigoVenda || '')) maxCod = Math.max(maxCod, Number(b.codigoVenda)) }
    else novos.push(p)
  }
  let cod = Number(opt('cod-inicial')) || maxCod + 1
  log(`existentes ${existentes.length} · novos ${novos.length} · próximo CodigoVenda ${cod}${DRY ? ' (DRY-RUN)' : ''}`)
  const res = { criados: 0, atualizados: 0, erros: 0 }
  const canon = (p, codigoVenda) => ({
    codigoBarras: p.codigo_barras, nome: p.nome, precoReferencia: Number(p.preco), categoria: p.categoria,
    codigoVenda, unidade: (p.unidade_medida || 'UN').toUpperCase(), restritoIdade: !!p.restrito_idade, imagemUrl: p.imagem_url || undefined,
  })
  for (const p of novos) {
    const alvo = canon(p, cod++)
    if (DRY) { log('  + criaria', alvo.codigoVenda, alvo.codigoBarras, alvo.nome, `R$${alvo.precoReferencia}`, alvo.restritoIdade ? '+18' : ''); continue }
    try { const r = await pos.cadastrarProduto(alvo); res.criados++; log('  +', r.acao, alvo.codigoBarras, r.produto?.codigoVenda, ...(r.avisos || [])) }
    catch (e) { if (e instanceof BeepayDesafio) throw e; res.erros++; log('  ✗', alvo.codigoBarras, e.message) }
  }
  if (opt('atualizar')) for (const { p, b } of existentes) {
    if (DRY) { log('  ~ atualizaria', p.codigo_barras, b.nome); continue }
    try { await pos.cadastrarProduto(canon(p, b.codigoVenda), { atualizar: true }); res.atualizados++ }
    catch (e) { if (e instanceof BeepayDesafio) throw e; res.erros++; log('  ✗', p.codigo_barras, e.message) }
  }
  console.log(JSON.stringify({ comando: 'produtos', dry: DRY, existentes: existentes.length, novos: novos.length, ...res }))
  if (res.erros) process.exitCode = 1
}

async function inventario() {
  const unidade = Number(opt('unidade')), filial = opt('filial')
  if (!unidade || !filial || filial === true) throw new Error('uso: inventario --unidade=<id Vallen> --filial=<código ou nome Beepay>')
  const sb = supa()
  const rows = await todas(() => sb.from('planograma').select('quantidade,produtos(codigo_barras,nome,preco_custo,categoria)').eq('unidade_id', unidade).order('id'))
  const itens = [], sem = []
  for (const r of rows) {
    const p = r.produtos; if (!p || !eanOk(p.codigo_barras)) continue
    if (!(r.quantidade > 0) && !opt('incluir-zerados')) continue
    const b = await beepay(p.codigo_barras)
    if (!b) { sem.push(`${p.codigo_barras} ${p.nome}`); continue }
    itens.push({ codigo: b.externalId, codigoVenda: b.codigoVenda, produto: b.nome, grupo: p.categoria || '', unidade: b.unidade || 'UN', quantidade: r.quantidade, custo: p.preco_custo })
  }
  const un = itens.reduce((s, i) => s + i.quantidade, 0)
  log(`${itens.length} itens (${un} un) p/ filial ${filial}; ${sem.length} fora do Beepay${sem.length ? ': ' + sem.join(' | ') : ''}`)
  if (opt('xlsx')) { await writeFile(String(opt('xlsx')), planilhaInventario(itens)); log('planilha salva em', opt('xlsx')) }
  if (DRY) { itens.slice(0, 10).forEach(i => log('  ', i.codigo, i.codigoVenda, i.produto, '→', i.quantidade)); return }
  const confirmar = !!opt('confirmar')
  if (confirmar) log('⚠️  --confirmar: o inventário será GRAVADO (operações anteriores ficam travadas)')
  const r = await pos.inventario(itens, { filial: String(filial), confirmar })
  log(`prévia: ${r.previa.linhas.length} linhas na grade (enviados ${itens.length}); colunas: ${r.previa.colunas.join(' | ')}`)
  r.previa.linhas.slice(0, 5).forEach(l => log('  ', JSON.stringify(l)))
  console.log(JSON.stringify({ comando: 'inventario', confirmado: r.confirmado, numero: r.numero || null, enviados: itens.length, naGrade: r.previa.linhas.length }))
  if (r.previa.linhas.length !== itens.length) { log('⚠️  grade ≠ enviados — conferir antes de confirmar'); process.exitCode = 1 }
}

async function produtosPush() {
  const r = await drenarProdutosBeepay(supa(), pos, { dry: DRY, limite: Number.isFinite(MAX) ? MAX : 50, prazoMs: 30 * 60_000, log })
  console.log(JSON.stringify({ comando: 'produtos-push', dry: DRY, ...r }))
  if (r.erros) process.exitCode = 1
}

async function vendasPush() {
  const r = await drenarVendasBeepay(supa(), pos, { dry: DRY, limite: Number.isFinite(MAX) ? MAX : 50, prazoMs: 10 * 60_000, log })
  console.log(JSON.stringify({ comando: 'vendas-push', dry: DRY, ...r }, null, r.amostra ? 1 : 0))
  if (r.erros) process.exitCode = 1
}

async function vendasPull() {
  const p = { ...(opt('desde') ? { desde: String(opt('desde')) } : {}), ...(opt('ate') ? { ate: String(opt('ate')) } : {}) }
  const r = await importarCuponsBeepay(supa(), pos, { ...p, dry: DRY, log })
  console.log(JSON.stringify({ comando: 'vendas-pull', dry: DRY, ...r }, null, r.amostra ? 1 : 0))
}

async function recon() {
  const out = opt('out'); if (!out || out === true) throw new Error('uso: recon --out=<dir>')
  await mkdir(out, { recursive: true })
  const r = await new BeepayConnector({ debugDir: out, log }).recon()
  await writeFile(`${out}/recon.json`, JSON.stringify(r, null, 1))
  log('recon salvo em', out)
}

async function apiInfo() { console.log(JSON.stringify(await pos.apiInfo(), null, 1)) }

const COMANDOS = { check, ean, produtos, 'produtos-push': produtosPush, inventario, 'vendas-push': vendasPush, 'vendas-pull': vendasPull, recon, 'api-info': apiInfo }
if (!COMANDOS[cmd]) { console.error(`comando inválido. Use: ${Object.keys(COMANDOS).join(' | ')}`); process.exit(2) }
COMANDOS[cmd]().catch(e => {
  console.error(e instanceof BeepayDesafio ? `🛑 ${e.message}` : `erro: ${e.message}`)
  process.exit(e instanceof BeepayDesafio ? 3 : 1)
})

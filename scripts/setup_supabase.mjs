#!/usr/bin/env node
/**
 * PDV Vallen — Setup completo do Supabase
 * 1. Cria schema (tabelas + RPC)
 * 2. Cria bucket de imagens (público)
 * 3. Importa produtos do CSV (upsert em lotes)
 * 4. Faz upload das imagens que têm produto correspondente
 *
 * Uso: node scripts/setup_supabase.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://zassphfrhusrsxhanalm.supabase.co'
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inphc3NwaGZyaHVzcnN4aGFuYWxtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTg3MjEyMiwiZXhwIjoyMDkxNDQ4MTIyfQ.SP27WYdqqVJsNGDtzGwO_DaqWL0LtAnO3Oh9OV-M8TA'
const BUCKET       = 'produtos'
const CSV_PATH     = '/Users/adrianogouveia/Integracao DWPDV/Baixar Imagens/importacao_digitalweb.csv'
const IMAGES_DIR   = '/Users/adrianogouveia/Integracao DWPDV/Baixar Imagens/importacao_digitalweb'
const SCHEMA_PATH  = '/Users/adrianogouveia/pdvVallen/schema.sql'

// Regex de produtos com restrição de idade (palavras inteiras, sem acento)
const RESTRICTED_RE = /\b(CERVEJA[S]?|CHOPE?|CHOPP|VINHOS?|WHISKY|WHISKEY|UISQUE|VODKA|VODCA|CACHACA|AGUARDENTE|PINGA|LICOR(ES)?|GIN|RUM|ESPUMANTE|CHAMPAGNE|CHAMPANHE|SIDRA|CONHAQUE|COGNAC|ABSINTO|TEQUILA|APERITIVO|DESTILADOS?)\b/

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

// ── CSV Parser (suporta campos com aspas + vírgulas internas + CRLF) ──────────
function parseCSV(raw) {
  const content = raw
    .replace(/^\uFEFF/, '')   // Remove BOM
    .replace(/\r\n/g, '\n')  // CRLF → LF
    .replace(/\r/g, '\n')
  const lines = content.split('\n')

  // Linha 0: OBRIGATÓRIO/opcional (skip)
  // Linha 1: cabeçalhos
  const headers = parseLine(lines[1])
  const records = []
  let i = 2

  while (i < lines.length) {
    if (!lines[i]?.trim()) { i++; continue }

    // Juntar linhas se campo com quebra de linha (aspas ímpares)
    let raw = lines[i]
    while ((raw.split('"').length - 1) % 2 !== 0 && i + 1 < lines.length) {
      i++
      raw += '\n' + lines[i]
    }

    const values = parseLine(raw)
    const record = {}
    headers.forEach((h, idx) => {
      record[h.trim()] = (values[idx] ?? '').trim()
    })

    if (record['CODIGO']) records.push(record)
    i++
  }

  return records
}

function parseLine(line) {
  const result = []
  let current  = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      // Aspas duplas escapadas: ""
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Preços sentinela (999999999, 9999999999) indicam produto sem preço cadastrado → 0
const parsePrice = v => {
  const p = parseFloat((v || '0').replace(',', '.')) || 0
  return (!isFinite(p) || p > 99999.99) ? 0 : p
}
const parseQty   = v => parseInt(v || '0') || 0

function isRestricted(nome, grupo) {
  const text = `${nome} ${grupo}`
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return RESTRICTED_RE.test(text)
}

// ── 1. Schema ─────────────────────────────────────────────────────────────────
async function runSchema() {
  console.log('\n[1/4] Verificando / criando schema...')

  // Tentar via pg-meta (disponível no Supabase com service role)
  const sql = readFileSync(SCHEMA_PATH, 'utf-8')
  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method : 'POST',
    headers: {
      Authorization : `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'X-Client-Info': 'setup-script',
    },
    body: JSON.stringify({ query: sql }),
  }).catch(() => null)

  if (res?.ok) {
    console.log('   ✓ Schema aplicado via API')
    return
  }

  // Fallback: checar se tabelas já existem
  const { error } = await supabase.from('produtos').select('id').limit(1)
  if (!error) {
    console.log('   ✓ Tabelas já existem — pulando criação')
    return
  }

  console.error('\n   ✗ Tabelas não encontradas e não foi possível criá-las automaticamente.')
  console.error('   → Acesse: https://supabase.com/dashboard/project/zassphfrhusrsxhanalm/sql')
  console.error('   → Cole o conteúdo de schema.sql e execute.')
  console.error('   → Depois rode este script novamente.\n')
  process.exit(1)
}

// ── 2. Bucket ─────────────────────────────────────────────────────────────────
async function createBucket() {
  console.log('\n[2/4] Configurando bucket de imagens...')

  const { error } = await supabase.storage.createBucket(BUCKET, {
    public       : true,
    fileSizeLimit: 10 * 1024 * 1024, // 10 MB
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  })

  if (error && !error.message.toLowerCase().includes('already exists')) {
    throw new Error(`Bucket: ${error.message}`)
  }

  console.log('   ✓ Bucket "produtos" configurado como público')
}

// ── 3. Importar produtos ──────────────────────────────────────────────────────
async function importProdutos(records, imageSet) {
  console.log(`\n[3/4] Importando ${records.length.toLocaleString()} produtos...`)

  // Deduplicar por codigo_barras (CSV pode ter entradas repetidas)
  const deduped = new Map()
  records
    .filter(r => r['CODIGO'] && r['DESCRICAO'])
    .forEach(r => {
      deduped.set(r['CODIGO'], {
        codigo_barras : r['CODIGO'],
        nome          : r['DESCRICAO'],
        preco         : parsePrice(r['PRECO VENDA']),
        estoque       : parseQty(r['QT ESTOQUE']),
        restrito_idade: isRestricted(r['DESCRICAO'], r['GRUPO'] || ''),
        imagem_url    : imageSet.has(r['CODIGO'])
          ? `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/image_${r['CODIGO']}.png`
          : null,
      })
    })
  const rows = [...deduped.values()]

  const restricted = rows.filter(r => r.restrito_idade).length
  console.log(`   ${rows.length.toLocaleString()} únicos | ${restricted} com restrito_idade=true`)

  const BATCH = 500
  let done = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH)
    const { error } = await supabase
      .from('produtos')
      .upsert(slice, { onConflict: 'codigo_barras' })
    if (error) throw new Error(`Insert batch ${i}: ${error.message}`)
    done += slice.length
    process.stdout.write(`\r   ${done.toLocaleString()} / ${rows.length.toLocaleString()} produtos`)
  }

  console.log(`\n   ✓ ${done.toLocaleString()} produtos inseridos/atualizados`)
}

// ── 4. Upload imagens ─────────────────────────────────────────────────────────
async function uploadImages(productCodigos) {
  console.log('\n[4/4] Enviando imagens...')

  const allFiles = readdirSync(IMAGES_DIR).filter(f => f.endsWith('.png'))

  // Só envia imagens que têm um produto correspondente no CSV
  const toUpload = allFiles.filter(f => {
    const code = f.replace(/^image_/, '').replace(/\.png$/, '')
    return productCodigos.has(code)
  })

  console.log(`   ${toUpload.length.toLocaleString()} imagens com produto | ${allFiles.length.toLocaleString()} total na pasta`)

  const CONCURRENCY = 25
  let done = 0, errs = 0
  const start = Date.now()

  for (let i = 0; i < toUpload.length; i += CONCURRENCY) {
    const batch = toUpload.slice(i, i + CONCURRENCY)

    await Promise.all(batch.map(async filename => {
      try {
        const buf = readFileSync(join(IMAGES_DIR, filename))
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(filename, buf, { contentType: 'image/png', upsert: true })
        if (error && !error.message.includes('already exists')) errs++
        else done++
      } catch (e) {
        errs++
      }
    }))

    const elapsed  = ((Date.now() - start) / 1000).toFixed(0)
    const pct      = (((done + errs) / toUpload.length) * 100).toFixed(1)
    const remaining = toUpload.length - done - errs
    const rate      = done / Math.max(1, (Date.now() - start) / 1000)
    const eta       = remaining > 0 ? `ETA ${(remaining / Math.max(1, rate)).toFixed(0)}s` : 'concluído'

    process.stdout.write(
      `\r   ${(done + errs).toLocaleString()} / ${toUpload.length.toLocaleString()} (${pct}%) — ${elapsed}s — ${eta}  `
    )
  }

  console.log(`\n   ✓ ${done.toLocaleString()} enviadas | ${errs} erros`)
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now()
  console.log('═══════════════════════════════════════════')
  console.log('  PDV Vallen — Setup Supabase')
  console.log('═══════════════════════════════════════════')

  await runSchema()
  await createBucket()

  // Carregar imagens disponíveis
  const allImages    = readdirSync(IMAGES_DIR).filter(f => f.endsWith('.png'))
  const imageSet     = new Set(allImages.map(f => f.replace(/^image_/, '').replace(/\.png$/, '')))

  // Parsear CSV
  console.log('\n   Lendo CSV...')
  const raw          = readFileSync(CSV_PATH, 'utf-8')
  const records      = parseCSV(raw)
  const productCodigos = new Set(records.map(r => r['CODIGO']))

  console.log(`   ${records.length.toLocaleString()} produtos no CSV`)
  console.log(`   ${[...productCodigos].filter(c => imageSet.has(c)).length.toLocaleString()} produtos com imagem`)

  await importProdutos(records, imageSet)
  await uploadImages(productCodigos)

  const total = ((Date.now() - t0) / 1000 / 60).toFixed(1)
  console.log('\n═══════════════════════════════════════════')
  console.log(`  ✅ Setup concluído em ${total} min`)
  console.log('═══════════════════════════════════════════\n')
}

main().catch(err => {
  console.error('\n❌ Erro fatal:', err.message)
  process.exit(1)
})

// Proxy de imagem do DWPDV/Foodcash com CORS — as imagens de produto do ERP são
// públicas, mas sem Access-Control-Allow-Origin; o navegador (ex.: subida pro
// Beepay feita na aba logada) precisa baixá-las como blob.
// Restrito a www.foodcash.com.br/sistema/userimages/* (não é proxy aberto).
// Uso: GET /api/img-dwpdv?u=<url absoluta ou caminho "userimages/...">
const HOST = 'www.foodcash.com.br'
const BASE = `https://${HOST}/sistema/`
const PREFIXO = '/sistema/userimages/'
const MAX_BYTES = 5_000_000

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  let alvo
  try { alvo = new URL(String(req.query?.u || ''), BASE) } catch { return res.status(400).json({ error: 'url inválida' }) }
  if (alvo.host !== HOST || !alvo.pathname.startsWith(PREFIXO)) {
    return res.status(400).json({ error: 'só imagens de produto do DWPDV' })
  }
  alvo.protocol = 'https:'
  try {
    const r = await fetch(alvo, { redirect: 'error' })   // sem seguir redirect (evita SSRF)
    const tipo = r.headers.get('content-type') || ''
    if (!r.ok || !tipo.startsWith('image/')) return res.status(502).json({ error: `origem respondeu ${r.status}` })
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > MAX_BYTES) return res.status(413).json({ error: 'imagem grande demais' })
    res.setHeader('Content-Type', tipo)
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800')
    return res.send(buf)
  } catch (e) {
    return res.status(502).json({ error: String(e?.message || e).slice(0, 200) })
  }
}

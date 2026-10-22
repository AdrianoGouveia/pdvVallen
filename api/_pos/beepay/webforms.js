// Cliente HTTP mínimo p/ ASP.NET WebForms (Beepay/Tablet Cloud): cookie jar,
// redirects manuais (p/ ver o 302 → login.aspx) e serialização de <form> igual à do
// navegador, sem dependência de DOM. Campos são achados pelo SUFIXO do name
// (`ctl00$ContentPlaceHolder1$txtX` ← 'txtX'), então mudança de master page não quebra.

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== '#') return ENT[e.toLowerCase()] ?? m
    const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return Number.isFinite(n) ? String.fromCodePoint(n) : m
  })
}

// atributos de UMA tag de abertura → { nome: valor } (atributo sem valor = '')
export function parseAttrs(tag) {
  const attrs = {}
  const body = String(tag).replace(/^<\s*[\w:-]+/, '').replace(/\/?\s*>$/, '')
  for (const m of body.matchAll(/([^\s=>"'/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '')
  return attrs
}

export const textOf = (html) => decodeEntities(String(html ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()

// HTML sem <script>/<style>/comentários — JS inline às vezes tem "<input" em template
export const semScripts = (html) => String(html ?? '')
  .replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '')

const ultimoSeg = (name) => String(name).split('$').pop()

export class Form {
  /** @param {string} html página inteira  @param {string} url URL final da resposta */
  constructor(html, url, charset) {
    this.html = html
    this.url = url
    this.charset = charset
    const limpo = semScripts(html)
    const fm = limpo.match(/<form\b[^>]*>[\s\S]*<\/form>/i)
    const scope = fm ? fm[0] : limpo
    const ft = fm ? parseAttrs(scope.match(/<form\b[^>]*>/i)[0]) : {}
    this.action = new URL(ft.action || url, url).toString()
    this.fields = []
    for (const m of scope.matchAll(/<input\b[^>]*>/gi)) {
      const a = parseAttrs(m[0]); if (!a.name) continue
      this.fields.push({ kind: 'input', name: a.name, type: (a.type || 'text').toLowerCase(), value: a.value ?? '', attrs: a })
    }
    for (const m of scope.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
      const a = parseAttrs(`<select ${m[1]}>`); if (!a.name) continue
      const options = [...m[2].matchAll(/<option\b([^>]*)>([\s\S]*?)(?=<option\b|<\/option>|$)/gi)].map(o => {
        const oa = parseAttrs(`<option ${o[1]}>`)
        const text = textOf(o[2])
        return { value: 'value' in oa ? oa.value : text, text, selected: 'selected' in oa }
      })
      this.fields.push({ kind: 'select', name: a.name, type: 'multiple' in a ? 'select-multiple' : 'select-one', options, attrs: a })
    }
    for (const m of scope.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi)) {
      const a = parseAttrs(`<textarea ${m[1]}>`); if (!a.name) continue
      this.fields.push({ kind: 'textarea', name: a.name, type: 'textarea', value: decodeEntities(m[2]), attrs: a })
    }
    this.pairs = this.#successful()
  }

  // "successful controls" (HTML spec): o que o navegador mandaria sem clicar em nada
  #successful() {
    const out = []
    for (const f of this.fields) {
      if ('disabled' in f.attrs) continue
      if (f.kind === 'select') {
        const sel = f.options.filter(o => o.selected)
        if (f.type === 'select-multiple') sel.forEach(o => out.push([f.name, o.value]))
        else if (sel.length || f.options.length) out.push([f.name, (sel[sel.length - 1] || f.options[0]).value])
      } else if (f.type === 'checkbox' || f.type === 'radio') {
        if ('checked' in f.attrs) out.push([f.name, f.value || 'on'])
      } else if (!['submit', 'button', 'image', 'reset', 'file'].includes(f.type)) {
        out.push([f.name, f.value])
      }
    }
    return out
  }

  /** nomes de campo que casam: exato, sufixo `$chave`, ou RegExp sobre o name */
  match(chave) {
    const nomes = [...new Set(this.fields.map(f => f.name))]
    if (chave instanceof RegExp) return nomes.filter(n => chave.test(n))
    if (nomes.includes(chave)) return [chave]
    const k = String(chave).toLowerCase()
    return nomes.filter(n => n.toLowerCase().endsWith('$' + k))
  }
  has(chave) { return this.match(chave).length > 0 }
  /** resolve p/ UM name; erro claro (com candidatos) se 0 ou >1 */
  name(chave) {
    const m = this.match(chave)
    if (m.length === 1) return m[0]
    const dica = this.fields.map(f => ultimoSeg(f.name)).filter((v, i, a) => a.indexOf(v) === i).join(', ')
    throw new Error(m.length ? `campo ambíguo ${chave}: ${m.join(', ')}` : `campo ${chave} não está no form (${this.url}). Campos: ${dica}`)
  }
  field(chave) { const n = this.name(chave); return this.fields.find(f => f.name === n) }
  get(chave) { const n = this.name(chave); return this.pairs.find(p => p[0] === n)?.[1] }

  /** define valor (remove os anteriores). `raw` usa o name literal mesmo fora do form */
  set(chave, valor, { raw = false } = {}) {
    const n = raw ? chave : this.name(chave)
    this.pairs = this.pairs.filter(p => p[0] !== n)
    if (valor !== null && valor !== undefined) this.pairs.push([n, String(valor)])
    return this
  }
  check(chave, on = true) {
    const f = this.field(chave)
    return this.set(f.name, on ? (f.value || 'on') : null, { raw: true })
  }
  options(chave) { return this.field(chave).options || [] }
  /** seleciona option pelo TEXTO (sem acento/caixa): exato; senão "UN - UNIDADE" p/ "UN";
   *  senão pelo value. Devolve o value ou null */
  selectByText(chave, texto) {
    const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase()
    const ops = this.options(chave), t = norm(texto)
    const o = ops.find(x => norm(x.text) === t) || ops.find(x => norm(x.text).startsWith(`${t} - `)) || ops.find(x => norm(x.value) === t)
    if (!o) return null
    this.set(chave, o.value)
    return o.value
  }
}

// ── sessão HTTP com cookie jar ────────────────────────────────────────────────
export class Sessao {
  #jar = new Map()
  constructor(base, { userAgent = 'Mozilla/5.0 (VallenSync; +https://vallenmarket.com.br)' } = {}) {
    this.base = base.replace(/\/+$/, '') + '/'
    this.userAgent = userAgent
  }

  #absorve(res) {
    const set = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean)
    for (const c of set) {
      const [par, ...attrs] = c.split(';')
      const i = par.indexOf('='); if (i < 1) continue
      const nome = par.slice(0, i).trim(), valor = par.slice(i + 1).trim()
      const exp = attrs.map(a => a.trim()).find(a => /^expires=/i.test(a))
      const maxAge = attrs.map(a => a.trim()).find(a => /^max-age=/i.test(a))
      const morto = (exp && Date.parse(exp.slice(8)) < Date.now()) || (maxAge && Number(maxAge.slice(8)) <= 0)
      if (morto || valor === '') this.#jar.delete(nome)
      else this.#jar.set(nome, valor)
    }
  }
  get cookieHeader() { return [...this.#jar].map(([k, v]) => `${k}=${v}`).join('; ') }
  temCookie(nome) { return this.#jar.has(nome) }

  /** fetch com cookies e redirects manuais. Devolve { status, url, headers, hops, text, json } */
  async request(path, { method = 'GET', body, headers = {}, maxRedirects = 8, timeoutMs = 60_000 } = {}) {
    let url = new URL(path, this.base).toString()
    const hops = []
    for (let i = 0; ; i++) {
      const r = await fetch(url, {
        method, body, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': this.userAgent, Cookie: this.cookieHeader, ...headers },
      })
      this.#absorve(r)
      const loc = r.headers.get('location')
      if (r.status >= 300 && r.status < 400 && loc && i < maxRedirects) {
        hops.push({ status: r.status, url })
        url = new URL(loc, url).toString()
        if (r.status === 303 || ((r.status === 301 || r.status === 302) && method !== 'GET')) { method = 'GET'; body = undefined; headers = {} }
        await r.arrayBuffer().catch(() => {})
        continue
      }
      const buf = Buffer.from(await r.arrayBuffer())
      const charset = charsetDe(r.headers.get('content-type'), buf)
      const txt = new TextDecoder(charset).decode(buf)
      return { status: r.status, url, headers: r.headers, hops, charset, text: txt, json() { return JSON.parse(txt) } }
    }
  }

  /**
   * Postback do form. `submitter` = name/sufixo do botão clicado (submit ou image);
   * `eventTarget` = controle do __doPostBack (LinkButton/AutoPostBack); `files` =
   * { chave: { data: Buffer, filename, type } } → multipart.
   */
  async submit(form, { submitter, eventTarget, eventArgument = '', files, headers = {} } = {}) {
    // re-postar texto decodificado no charset errado corromperia campos (acentos)
    if (form.charset && !/^utf-?8$/i.test(form.charset)) throw new Error(`charset ${form.charset} não suportado no postback`)
    const pairs = form.pairs.filter(p => !['__EVENTTARGET', '__EVENTARGUMENT'].includes(p[0]))
    pairs.unshift(['__EVENTTARGET', eventTarget ? (form.has(eventTarget) ? form.name(eventTarget) : eventTarget) : ''], ['__EVENTARGUMENT', eventArgument])
    if (submitter) {
      const f = form.field(submitter)
      if (f.type === 'image') pairs.push([`${f.name}.x`, '10'], [`${f.name}.y`, '10'])
      else pairs.push([f.name, f.value || ''])
    }
    let body
    if (files && Object.keys(files).length) {
      body = new FormData()
      for (const [k, v] of pairs) body.append(k, v)
      for (const [chave, f] of Object.entries(files))
        body.append(form.name(chave), new Blob([f.data], { type: f.type || 'application/octet-stream' }), f.filename || 'arquivo')
    } else {
      body = new URLSearchParams(pairs)
      headers = { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }
    }
    return this.request(form.action, { method: 'POST', body, headers: { Referer: form.url, Origin: new URL(form.url).origin, ...headers } })
  }
}

function charsetDe(contentType, buf) {
  const h = /charset=["']?([\w-]+)/i.exec(contentType || '')?.[1]
  const meta = h ? null : /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 4096).toString('latin1'))?.[1]
  const cs = (h || meta || 'utf-8').toLowerCase()
  try { new TextDecoder(cs); return cs } catch { return 'utf-8' }
}

// __doPostBack('alvo','arg') de um onclick/onchange/href → { target, argument }. Aceita a
// forma escapada do AutoPostBack: setTimeout('__doPostBack(\'ctl00$x\',\'\')', 0)
export function postBackDe(js) {
  const m = decodeEntities(js).match(/__doPostBack\(\s*\\?['"]([^'"\\]+)\\?['"]\s*,\s*\\?['"]([^'"\\]*)\\?['"]/)
  if (m) return { target: m[1], argument: m[2] }
  const w = decodeEntities(js).match(/WebForm_PostBackOptions\(\s*["']([^"']+)["']/)
  return w ? { target: w[1], argument: '' } : null
}

/** alvo de postback de um controle pelo sufixo do name (LinkButton não é campo do form) */
export function alvoPostBack(html, chave) {
  const k = String(chave).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // nome = chave exata ou terminando em "$chave", seguido da aspa (escapada ou não)
  const re = new RegExp(`(?:__doPostBack\\(\\s*\\\\?['"]|WebForm_PostBackOptions\\(\\s*["'])((?:[^'"\\\\]*\\$)?${k})\\\\?['"]`, 'i')
  return decodeEntities(html).match(re)?.[1] ?? null
}

/** Form a partir de uma resposta de Sessao.request */
export const formDe = (r) => new Form(r.text, r.url, r.charset)

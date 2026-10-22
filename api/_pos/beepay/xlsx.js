// Gerador mínimo de .xlsx (1 planilha) sem dependência: zip STORED + strings
// inline (inlineStr) + números com ponto — o mesmo formato que o importador de
// inventário do Beepay leu certo em 2026-10-17.
// CRC-32 (IEEE) próprio: zlib.crc32 só existe a partir do Node 20.15/22.2
const CRC_T = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC_T[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // caracteres de controle são inválidos em XML 1.0
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')

function colRef(i) { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s }

function sheetXml(linhas) {
  const rows = linhas.map((cels, r) => `<row r="${r + 1}">${cels.map((v, c) => {
    const ref = `${colRef(c)}${r + 1}`
    if (v === null || v === undefined || v === '') return ''
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
  }).join('')}</row>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`
}

function arquivos(linhas, nomePlanilha) {
  const ns = 'http://schemas.openxmlformats.org'
  return {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets><sheet name="${esc(nomePlanilha)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${ns}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="${ns}/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    'xl/worksheets/sheet1.xml': sheetXml(linhas),
  }
}

// zip "stored" (sem compressão) — suficiente e trivial de gerar
function zipStored(files) {
  const locais = [], centrais = []
  let offset = 0
  for (const [nome, conteudo] of Object.entries(files)) {
    const nomeBuf = Buffer.from(nome, 'utf8')
    const dados = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo, 'utf8')
    const crc = crc32(dados) >>> 0
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6) // UTF-8
    local.writeUInt16LE(0, 8); local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(dados.length, 18); local.writeUInt32LE(dados.length, 22)
    local.writeUInt16LE(nomeBuf.length, 26); local.writeUInt16LE(0, 28)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10); central.writeUInt32LE(0, 12)
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(dados.length, 20); central.writeUInt32LE(dados.length, 24)
    central.writeUInt16LE(nomeBuf.length, 28); central.writeUInt32LE(offset, 42)
    locais.push(local, nomeBuf, dados)
    centrais.push(central, nomeBuf)
    offset += 30 + nomeBuf.length + dados.length
  }
  const cd = Buffer.concat(centrais)
  const fim = Buffer.alloc(22)
  const n = Object.keys(files).length
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(n, 8); fim.writeUInt16LE(n, 10)
  fim.writeUInt32LE(cd.length, 12); fim.writeUInt32LE(offset, 16)
  return Buffer.concat([...locais, cd, fim])
}

/** @param {Array<Array<string|number|null>>} linhas 1ª linha = cabeçalho  @returns {Buffer} */
export function gerarXlsx(linhas, { nomePlanilha = 'Planilha1' } = {}) {
  return zipStored(arquivos(linhas, nomePlanilha))
}

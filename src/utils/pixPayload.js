/**
 * Gera o Payload PIX (BRCode / EMV) dinâmico seguindo o padrão BACEN.
 * Docs: https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf
 */

function emvField(id, value) {
  const len = value.length.toString().padStart(2, '0')
  return `${id}${len}${value}`
}

function crc16(str) {
  let crc = 0xffff
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1
    }
  }
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0')
}

/**
 * @param {object} params
 * @param {string} params.chave       - Chave PIX (email, CPF, telefone, aleatória)
 * @param {string} params.nome        - Nome do recebedor (max 25 chars)
 * @param {string} params.cidade      - Cidade do recebedor (max 15 chars)
 * @param {number} params.valor       - Valor em reais
 * @param {string} [params.txId]      - Identificador da transação (max 25 chars)
 * @returns {string} Payload BRCode pronto para gerar QR Code
 */
export function gerarPixPayload({ chave, nome, cidade, valor, txId = '***' }) {
  const nomeClean  = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 25).toUpperCase()
  const cidadeClean = cidade.normalize('NFD').replace(/[\u0300-\u036f]/g, '').substring(0, 15).toUpperCase()
  const valorStr   = valor.toFixed(2)

  // 26 — Merchant Account Information (PIX)
  const pixInfo = emvField('00', 'br.gov.bcb.pix') + emvField('01', chave)
  const mai     = emvField('26', pixInfo)

  // 62 — Additional Data Field Template
  const txIdField = emvField('05', txId)
  const adf       = emvField('62', txIdField)

  // Monta payload sem CRC
  const payload =
    emvField('00', '01')          + // Payload Format Indicator
    emvField('01', '12')          + // Point of Initiation (12 = dinâmico one-time)
    mai                           +
    emvField('52', '0000')        + // Merchant Category Code
    emvField('53', '986')         + // Transaction Currency (BRL)
    emvField('54', valorStr)      + // Transaction Amount
    emvField('58', 'BR')          + // Country Code
    emvField('59', nomeClean)     + // Merchant Name
    emvField('60', cidadeClean)   + // Merchant City
    adf                           +
    '6304'                          // CRC placeholder

  return payload + crc16(payload)
}

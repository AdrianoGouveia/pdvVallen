/**
 * Gera o Payload PIX estático (BRCode / EMV) seguindo o padrão BACEN.
 * Tipo 11 = estático uso único — funciona em TODOS os apps bancários
 * sem precisar de integração com PSP/banco.
 *
 * Referência:
 * https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/
 * II_ManualdePadroesparaIniciacaodoPix.pdf
 */

function emvField(id, value) {
  const len = String(value.length).padStart(2, '0')
  return `${id}${len}${value}`
}

function crc16ccitt(str) {
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
 * Formata chave PIX telefone para o padrão E.164 (+5511999999999).
 * Se não for numérico puro, devolve como está (email, CPF, aleatória).
 */
function formatarChave(chave) {
  const soDigitos = chave.replace(/\D/g, '')
  // Telefone brasileiro: 10 ou 11 dígitos (com DDD)
  if (soDigitos.length === 10 || soDigitos.length === 11) {
    return `+55${soDigitos}`
  }
  // CPF: 11 dígitos mas começa com 0 ou padrão CPF — retorna só dígitos
  if (soDigitos.length === 11) return soDigitos
  return chave
}

/**
 * @param {object} params
 * @param {string} params.chave    - Chave PIX (telefone, email, CPF, aleatória)
 * @param {string} params.nome     - Nome do recebedor (max 25 chars, sem acentos)
 * @param {string} params.cidade   - Cidade do recebedor (max 15 chars, sem acentos)
 * @param {number} params.valor    - Valor em reais (ex: 12.50)
 * @param {string} [params.txId]   - ID da transação (max 25 chars, alfanumérico)
 * @returns {string} Payload BRCode completo com CRC16
 */
export function gerarPixPayload({ chave, nome, cidade, valor, txId = '***' }) {
  const chaveFormatada = formatarChave(chave)

  const nomeClean  = nome
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .substring(0, 25)
    .toUpperCase()
    .trim()

  const cidadeClean = cidade
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .substring(0, 15)
    .toUpperCase()
    .trim()

  const txIdClean = txId
    .replace(/[^A-Za-z0-9]/g, '')
    .substring(0, 25) || '***'

  const valorStr = valor.toFixed(2)

  // ID 26 — Merchant Account Information
  const pixInfo = emvField('00', 'br.gov.bcb.pix') + emvField('01', chaveFormatada)
  const mai     = emvField('26', pixInfo)

  // ID 62 — Additional Data Field Template
  const adf = emvField('62', emvField('05', txIdClean))

  // Monta payload sem CRC (campo 6304 = placeholder)
  const body =
    emvField('00', '01')       +   // Payload Format Indicator
    emvField('01', '11')       +   // 11 = estático uso único (funciona em todos os bancos)
    mai                        +   // Merchant Account Info (chave PIX)
    emvField('52', '0000')     +   // MCC
    emvField('53', '986')      +   // BRL
    emvField('54', valorStr)   +   // Valor
    emvField('58', 'BR')       +   // País
    emvField('59', nomeClean)  +   // Nome recebedor
    emvField('60', cidadeClean)+   // Cidade
    adf                        +   // Referência da transação
    '6304'                         // CRC placeholder

  return body + crc16ccitt(body)
}

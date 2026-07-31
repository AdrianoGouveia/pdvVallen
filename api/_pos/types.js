// Tipos canônicos da integração de PDV — a VERDADE é NOSSA, não da DigitalWeb.
// Nenhum campo específico de fornecedor aqui. Cada connector traduz o seu formato
// para/desta forma. (JSDoc — o projeto é JS puro.)

/**
 * @typedef {Object} CanonUnidade
 * @property {string} cnpj            CNPJ da filial (só dígitos)
 * @property {string} nome
 * @property {boolean} isMatriz
 * @property {string=} parentCnpj
 */

/**
 * @typedef {Object} CanonCategoria
 * @property {string} nome
 * @property {string=} externalId
 * @property {boolean=} ativo
 */

/**
 * @typedef {Object} CanonProduto
 * @property {string} codigoBarras   chave natural de casamento (EAN)
 * @property {string} nome
 * @property {string=} categoria
 * @property {number=} precoReferencia
 * @property {Array<{unidadeCodigo:string, preco:number, quantidade:number}>=} precosPorFilial
 * @property {number=} estoqueDeposito
 * @property {boolean=} restritoIdade
 * @property {string=} imagemUrl
 * @property {string=} externalId    id no PDV (ex.: indiceweb) — só p/ escrita
 * @property {boolean=} ativo
 */

/**
 * @typedef {Object} CanonVendaPush
 * @property {number} pedidoId
 * @property {string} unidadeCodigo
 * @property {number} total
 * @property {Array<{codigoBarras:string, quantidade:number, precoUnitario:number}>} itens
 * @property {{doc?:string, nome?:string}=} cliente
 */

/**
 * @typedef {Object} CanonEstoqueEvt
 * @property {'deposito'|'filial'} escopo
 * @property {string=} unidadeCodigo
 * @property {string} codigoBarras
 * @property {number} quantidadeAbsoluta   SEMPRE valor absoluto (idempotente)
 * @property {'entrada'|'saida'} tipo
 * @property {string=} referencia
 * @property {string=} ocorridoEm
 */

export {} // módulo ESM

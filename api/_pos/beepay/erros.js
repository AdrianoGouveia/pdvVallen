// Erros do conector Beepay (compartilhados pelos transportes web e API).
export class BeepayNaoConfigurado extends Error {}
/** reCAPTCHA/desafio anti-bot apareceu: PARAR e avisar — nunca contornar. */
export class BeepayDesafio extends Error {}
/** redirect p/ login.aspx no meio de uma operação → relogar e repetir. */
export class BeepaySessaoExpirada extends Error {}
export class BeepayErro extends Error {
  constructor(msg, { status } = {}) { super(msg); this.status = status }
}
/** falta configuração da CONTA (forma de pagamento, terminal, produto sem código): a venda
 *  fica PENDENTE esperando — não é erro e não gasta tentativa. */
export class BeepayAguardandoConfig extends Error {}
/** login recusado (senha/conta): problema da CONTA, não do item — para o lote todo. */
export class BeepayLoginRecusado extends Error {}
/** resultado incerto (ex.: cadastro feito mas não confirmado): não reenviar sozinho —
 *  repetir poderia criar o produto de novo. Vai p/ conferência manual. */
export class BeepayIncerto extends Error {}
/** operação que o transporte ainda não mapeia (ex.: API oficial sem credencial). */
export class BeepayNaoSuportado extends Error {}

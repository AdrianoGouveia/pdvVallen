package com.vallen.maquininha.ui.nav

object Routes {
    const val LOGIN = "login"
    const val SELECT_FRANQUEADO = "select_franqueado"
    const val SELECT_UNIDADE = "select_unidade"
    const val SETUP = "setup"
    const val HOME = "home"
    const val CART = "cart"
    const val PAYMENT = "payment"
    const val RESULT = "result/{aprovado}/{valor}/{nsu}"

    fun result(aprovado: Boolean, valor: Double, nsu: String) =
        "result/$aprovado/$valor/${nsu.ifEmpty { "-" }}"
}

package com.vallen.maquininha.ui.nav

object Routes {
    const val LOGIN = "login"
    const val SELECT_FRANQUEADO = "select_franqueado"
    const val SELECT_UNIDADE = "select_unidade"
    const val SETUP = "setup"
    const val WELCOME = "welcome"
    const val EMPTY_CART = "empty_cart"
    const val HOME = "home"
    const val CART = "cart"
    const val METHOD = "method"
    const val PAYMENT = "payment/{metodo}"
    const val RESULT = "result/{aprovado}/{valor}/{nsu}"

    fun payment(metodo: String) = "payment/$metodo"

    fun result(aprovado: Boolean, valor: Double, nsu: String) =
        "result/$aprovado/$valor/${nsu.ifEmpty { "-" }}"
}

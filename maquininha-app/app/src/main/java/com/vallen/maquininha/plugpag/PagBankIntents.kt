package com.vallen.maquininha.plugpag

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager

/**
 * Integração "Plug & Play" via Intent com o app PagBank instalado na Moderninha.
 *
 * Referência: documentação PagBank Developer — "Integração via Intent" (SmartPOS).
 * Não requer activation code nem SDK AAR — funciona com a Moderninha Smart 2
 * com o app PagBank nativo (pacote `br.com.uol.pagseguro.smartpos`).
 */
object PagBankIntents {
    const val ACTION = "br.com.uol.pagseguro.COMMAND"

    // tipoTransacao
    private const val TIPO_CREDITO_A_VISTA = 1
    private const val TIPO_CREDITO_PARCELADO_LOJA = 2
    private const val TIPO_DEBITO = 4
    private const val TIPO_PIX = 5

    // códigos de retorno (codigoRetorno)
    private const val RET_OK = 0

    fun buildIntent(
        kind: PaymentKind,
        valueCents: Long,
        pedidoId: Long,
        installments: Int = 1
    ): Intent {
        val tipo = when {
            kind == PaymentKind.CREDIT && installments > 1 -> TIPO_CREDITO_PARCELADO_LOJA
            kind == PaymentKind.CREDIT -> TIPO_CREDITO_A_VISTA
            kind == PaymentKind.DEBIT -> TIPO_DEBITO
            kind == PaymentKind.PIX -> TIPO_PIX
            else -> TIPO_CREDITO_A_VISTA
        }
        return Intent(ACTION).apply {
            putExtra("tipoTransacao", tipo)
            putExtra("valor", valueCents.toInt())
            if (installments > 1) putExtra("parcelas", installments)
            putExtra("codigoEstabelecimento", pedidoId.toString())
        }
    }

    fun isAvailable(activity: Activity): Boolean {
        val pm = activity.packageManager
        val probe = Intent(ACTION)
        val resolve = pm.queryIntentActivities(
            probe,
            PackageManager.MATCH_DEFAULT_ONLY
        )
        return resolve.isNotEmpty()
    }

    fun parseResult(resultCode: Int, data: Intent?): PaymentEvent {
        if (resultCode != Activity.RESULT_OK || data == null) {
            return PaymentEvent.Declined(
                data?.getStringExtra("mensagemRetorno") ?: "Transação cancelada"
            )
        }
        val codigo = data.getIntExtra("codigoRetorno", -1)
        if (codigo != RET_OK) {
            val msg = data.getStringExtra("mensagemRetorno")
                ?: data.getStringExtra("retorno")
                ?: "Transação recusada (código $codigo)"
            return PaymentEvent.Declined(msg)
        }
        return PaymentEvent.Approved(
            nsu = data.getStringExtra("nsu")
                ?: data.getStringExtra("codigoAutorizacao")
                ?: "",
            bandeira = data.getStringExtra("bandeira"),
            tipoCartao = data.getStringExtra("tipoCartao")
        )
    }
}

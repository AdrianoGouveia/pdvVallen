package com.vallen.maquininha.plugpag

import android.content.Context
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

sealed interface PaymentEvent {
    data class Message(val text: String) : PaymentEvent
    data class Approved(
        val nsu: String,
        val bandeira: String?,
        val tipoCartao: String?
    ) : PaymentEvent
    data class Declined(val reason: String) : PaymentEvent
}

enum class PaymentKind { CREDIT, DEBIT, PIX }

interface PaymentProcessor {
    fun pay(
        context: Context,
        valueCents: Long,
        kind: PaymentKind,
        installments: Int = 1
    ): Flow<PaymentEvent>

    fun abort()
}

/**
 * Usado no emulador / quando o app PagBank não está instalado.
 * Simula um fluxo de 4s terminando em aprovação.
 */
class MockPaymentProcessor : PaymentProcessor {
    override fun pay(
        context: Context,
        valueCents: Long,
        kind: PaymentKind,
        installments: Int
    ): Flow<PaymentEvent> = flow {
        val msg = when (kind) {
            PaymentKind.CREDIT, PaymentKind.DEBIT -> "Aproxime, insira ou passe o cartão"
            PaymentKind.PIX -> "Aproxime o celular para ler o QR Code"
        }
        emit(PaymentEvent.Message(msg))
        delay(2500)
        emit(PaymentEvent.Message("Processando..."))
        delay(1500)
        emit(
            PaymentEvent.Approved(
                nsu = "MOCK${System.currentTimeMillis() % 1_000_000}",
                bandeira = if (kind == PaymentKind.PIX) "PIX" else "VISA",
                tipoCartao = when (kind) {
                    PaymentKind.CREDIT -> "CREDITO"
                    PaymentKind.DEBIT -> "DEBITO"
                    PaymentKind.PIX -> "PIX"
                }
            )
        )
    }

    override fun abort() {}
}

package com.vallen.maquininha.ui.payment

import android.content.Context
import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vallen.maquininha.data.CartStore
import com.vallen.maquininha.data.ItemCarrinho
import com.vallen.maquininha.data.PedidosRepository
import com.vallen.maquininha.data.Prefs
import com.vallen.maquininha.data.ProdutosRepository
import com.vallen.maquininha.data.model.Pedido
import com.vallen.maquininha.data.model.PedidoUpdate
import com.vallen.maquininha.plugpag.MockPaymentProcessor
import com.vallen.maquininha.plugpag.PagBankIntents
import com.vallen.maquininha.plugpag.PaymentEvent
import com.vallen.maquininha.plugpag.PaymentKind
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface PaymentStage {
    data object EscolhendoTipo : PaymentStage
    data class Processando(val mensagem: String) : PaymentStage
    data class Finalizado(
        val aprovado: Boolean,
        val valor: Double,
        val nsu: String,
        val motivo: String? = null
    ) : PaymentStage
}

data class PaymentUiState(
    val itens: List<ItemCarrinho> = emptyList(),
    val total: Double = 0.0,
    val stage: PaymentStage = PaymentStage.EscolhendoTipo,
    val erro: String? = null
)

class PaymentViewModel : ViewModel() {

    private val _state = MutableStateFlow(PaymentUiState())
    val state: StateFlow<PaymentUiState> = _state.asStateFlow()

    private val _intents = MutableSharedFlow<Intent>(
        replay = 0, extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST
    )
    val intents: SharedFlow<Intent> = _intents.asSharedFlow()

    private val mock = MockPaymentProcessor()
    private var pedidoAtual: Pedido? = null

    init {
        viewModelScope.launch {
            CartStore.items.collect { items ->
                _state.update { it.copy(itens = items, total = items.sumOf { i -> i.subtotal }) }
            }
        }
    }

    fun escolher(kind: PaymentKind, context: Context, plugpagDisponivel: Boolean) {
        if (_state.value.stage is PaymentStage.Processando) return
        val items = _state.value.itens
        if (items.isEmpty()) {
            _state.update { it.copy(erro = "Carrinho vazio") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(stage = PaymentStage.Processando("Criando pedido..."), erro = null) }
            try {
                val unidadeId = Prefs.unidadeId.first()
                val terminalId = Prefs.terminalId.first()
                val pedido = ProdutosRepository.criarPedido(unidadeId, terminalId, items)
                pedidoAtual = pedido
                val cents = (pedido.total * 100).toLong()
                _state.update { it.copy(stage = PaymentStage.Processando(msgPara(kind))) }

                if (plugpagDisponivel) {
                    _intents.emit(PagBankIntents.buildIntent(kind, cents, pedido.id))
                } else {
                    mock.pay(context, cents, kind).collect { ev ->
                        when (ev) {
                            is PaymentEvent.Message ->
                                _state.update { it.copy(stage = PaymentStage.Processando(ev.text)) }
                            else -> aplicar(ev)
                        }
                    }
                }
            } catch (e: Exception) {
                _state.update {
                    it.copy(
                        stage = PaymentStage.EscolhendoTipo,
                        erro = e.message ?: "Erro ao criar pedido"
                    )
                }
            }
        }
    }

    fun onResultadoIntent(resultCode: Int, data: Intent?) {
        aplicar(PagBankIntents.parseResult(resultCode, data))
    }

    fun cancelar() {
        val pedido = pedidoAtual
        val total = _state.value.total
        viewModelScope.launch {
            pedido?.let {
                runCatching {
                    PedidosRepository.atualizarPedido(it.id, PedidoUpdate(status = "cancelado"))
                }
            }
            _state.update {
                it.copy(stage = PaymentStage.Finalizado(
                    aprovado = false, valor = total, nsu = "", motivo = "Cancelado"
                ))
            }
        }
    }

    private fun aplicar(ev: PaymentEvent) {
        val pedido = pedidoAtual ?: return
        val items = _state.value.itens
        viewModelScope.launch {
            when (ev) {
                is PaymentEvent.Approved -> {
                    runCatching {
                        PedidosRepository.atualizarPedido(
                            pedido.id,
                            PedidoUpdate(
                                status = "aprovado",
                                nsu = ev.nsu,
                                bandeira = ev.bandeira,
                                tipoCartao = ev.tipoCartao
                            )
                        )
                    }
                    val unidadeId = Prefs.unidadeId.first()
                    if (unidadeId != null) {
                        items.forEach { item ->
                            runCatching {
                                ProdutosRepository.venderItem(unidadeId, item.produto.id, item.quantidade)
                            }
                        }
                    }
                    CartStore.clear()
                    _state.update {
                        it.copy(stage = PaymentStage.Finalizado(
                            aprovado = true, valor = pedido.total, nsu = ev.nsu
                        ))
                    }
                }
                is PaymentEvent.Declined -> {
                    runCatching {
                        PedidosRepository.atualizarPedido(
                            pedido.id,
                            PedidoUpdate(status = "recusado")
                        )
                    }
                    _state.update {
                        it.copy(stage = PaymentStage.Finalizado(
                            aprovado = false, valor = pedido.total, nsu = "",
                            motivo = ev.reason
                        ))
                    }
                }
                is PaymentEvent.Message ->
                    _state.update { it.copy(stage = PaymentStage.Processando(ev.text)) }
            }
        }
    }

    private fun msgPara(kind: PaymentKind) = when (kind) {
        PaymentKind.CREDIT, PaymentKind.DEBIT -> "Abrindo terminal..."
        PaymentKind.PIX -> "Gerando QR Code PIX..."
    }
}

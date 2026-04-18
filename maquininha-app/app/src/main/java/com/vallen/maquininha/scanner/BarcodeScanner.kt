package com.vallen.maquininha.scanner

import android.view.KeyEvent
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Captura leitura de leitores USB/Bluetooth que se apresentam como teclado.
 * Heurística: sequência rápida de caracteres terminada em ENTER.
 *
 * Uso: MainActivity.dispatchKeyEvent(ev) { BarcodeScanner.onKeyEvent(ev) }
 * Telas coletam `BarcodeScanner.scans` via collect.
 */
object BarcodeScanner {
    private const val MAX_INTERVAL_MS = 120L
    private const val MIN_LENGTH = 3

    private val buffer = StringBuilder()
    private var lastTs = 0L

    private val _scans = MutableSharedFlow<String>(
        replay = 0, extraBufferCapacity = 8, onBufferOverflow = BufferOverflow.DROP_OLDEST
    )
    val scans: SharedFlow<String> = _scans.asSharedFlow()

    /**
     * @return true se o evento foi consumido pelo scanner (tela não precisa reagir).
     */
    fun onKeyEvent(ev: KeyEvent): Boolean {
        if (ev.action != KeyEvent.ACTION_DOWN) return false
        val now = System.currentTimeMillis()
        val delta = now - lastTs

        if (ev.keyCode == KeyEvent.KEYCODE_ENTER || ev.keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER) {
            val code = buffer.toString()
            buffer.clear()
            return if (delta <= MAX_INTERVAL_MS && code.length >= MIN_LENGTH) {
                _scans.tryEmit(code)
                true
            } else false
        }

        val ch = ev.unicodeChar.toChar()
        if (ch.code == 0 || !ch.isLetterOrDigit()) return false

        if (delta > MAX_INTERVAL_MS) buffer.clear()
        buffer.append(ch)
        lastTs = now
        return false
    }
}

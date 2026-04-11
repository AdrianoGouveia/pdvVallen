import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Hook que escuta o teclado e detecta leituras de código de barras.
 * Leitores USB/Bluetooth enviam os dígitos rapidamente e terminam com Enter.
 * Heurística: se os caracteres chegaram em < 100ms entre si, é scanner.
 *
 * @param {(produto: object) => void} onProductFound
 * @param {(codigoBarras: string) => void} onNotFound
 */
export function useBarcodeScanner(onProductFound, onNotFound) {
  const bufferRef    = useRef('')
  const lastKeyRef   = useRef(0)
  const TIMEOUT_MS   = 100 // acima disso = digitação humana

  useEffect(() => {
    async function handleKeyDown(e) {
      const now = Date.now()
      const delta = now - lastKeyRef.current
      lastKeyRef.current = now

      if (e.key === 'Enter') {
        const codigo = bufferRef.current.trim()
        bufferRef.current = ''

        if (!codigo) return

        const { data, error } = await supabase
          .from('produtos')
          .select('*')
          .eq('codigo_barras', codigo)
          .single()

        if (error || !data) {
          onNotFound?.(codigo)
        } else {
          onProductFound?.(data)
        }
        return
      }

      // Se demorou mais que TIMEOUT_MS, provavelmente é digitação manual — resetar buffer
      if (delta > TIMEOUT_MS) {
        bufferRef.current = ''
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onProductFound, onNotFound])
}

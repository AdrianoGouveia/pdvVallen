import { NoneConnector }  from './NoneConnector.js'
import { DwpdvConnector } from './DwpdvConnector.js'

// Seleciona o connector pela flag INTEGRACAO_POS (default: none = standalone).
// Núcleo SÓ chama isto — nunca importa DwpdvConnector direto.
let _instance = null
export function getConnector() {
  if (_instance) return _instance
  const modo = (process.env.INTEGRACAO_POS || 'none').toLowerCase()
  _instance = modo === 'dwpdv' ? new DwpdvConnector() : new NoneConnector()
  return _instance
}

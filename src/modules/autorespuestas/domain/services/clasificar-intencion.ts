import { esSolicitudDeHumano } from './detectar-solicitud-humano.js'
import { esSoloSaludo, normalizarTexto, quitarPuntuacion } from './normalizar-texto.js'

export type IntencionLead =
  | 'sin_contenido'
  | 'saludo'
  | 'agradecimiento'
  | 'solicitud_humano'
  | 'negacion'
  | 'confirmacion'
  | 'correccion'
  | 'pregunta'
  | 'datos'
  | 'otro'

const PATRON_AGRADECIMIENTO =
  /^(?:gracias|muchas gracias|mil gracias|te lo agradezco|agradezco|perfecto gracias|ok gracias|listo gracias)(?:\s+.*)?$/u

const PATRON_NEGACION =
  /^(?:no|nop|no gracias|no por ahora|no me interesa|no quiero|ninguno|ninguna|para que|no es necesario|no hace falta|despues|después)(?:\s+.*)?$/u

const PATRON_CONFIRMACION =
  /^(?:si|sí|claro|claro que si|claro que sí|correcto|asi es|así es|de acuerdo|ok|okay|va|sale|perfecto|listo|entendido|exacto|conforme)(?:\s+.*)?$/u

const PATRON_CORRECCION =
  /\b(?:en realidad|mejor|corrijo|corregir|cambia|cambio|cambiar|no es|no son|era|sera|serán)\b/u

const PATRON_PREGUNTA =
  /\b(?:que|qué|cual|cuál|cuanto|cuánto|cuanta|cuánta|cuando|cuándo|donde|dónde|como|cómo|precio|costo|stock|existencia|disponible|disponibilidad|envio|envío|garantia|garantía)\b/u

export function clasificarIntencion(texto: string): IntencionLead {
  const original = texto.trim()
  if (original.length === 0 || /^[^\p{L}\p{N}]+$/u.test(original)) {
    return 'sin_contenido'
  }

  if (esSolicitudDeHumano(original)) {
    return 'solicitud_humano'
  }

  if (esSoloSaludo(original)) {
    return 'saludo'
  }

  const normalizado = quitarPuntuacion(normalizarTexto(original))
  if (normalizado.length === 0) {
    return 'sin_contenido'
  }

  if (PATRON_CORRECCION.test(normalizado)) {
    return 'correccion'
  }
  if (PATRON_AGRADECIMIENTO.test(normalizado)) {
    return 'agradecimiento'
  }
  if (PATRON_NEGACION.test(normalizado)) {
    return 'negacion'
  }
  if (PATRON_CONFIRMACION.test(normalizado)) {
    return 'confirmacion'
  }
  if (original.includes('?') || PATRON_PREGUNTA.test(normalizado)) {
    return 'pregunta'
  }
  return 'datos'
}

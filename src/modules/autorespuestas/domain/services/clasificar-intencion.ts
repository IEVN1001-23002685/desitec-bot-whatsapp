import { esSolicitudDeHumano } from './detectar-solicitud-humano.js'
import { esReferenciaProducto } from './detectar-referencia-producto.js'
import { esSoloSaludo, normalizarParaDeteccion, quitarPuntuacion } from './normalizar-texto.js'

export type IntencionLead =
  | 'sin_contenido'
  | 'saludo'
  | 'agradecimiento'
  | 'solicitud_humano'
  | 'aclaracion'
  | 'solicitud_orientacion'
  | 'solicitud_cotizacion'
  | 'referencia_producto'
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

const PATRON_ACLARACION =
  /^(?:piezas?|cantidad|unidades?)\s+de\s+qu[eé]\b|^(?:de\s+qu[eé]\s+(?:producto|equipo|modelo|hablas))|^(?:a\s+qu[eé]\s+te\s+refieres)|^(?:cu[aá]les?\s+modelos?)|^(?:no\s+entiendo|no\s+comprendo|no\s+s[eé]\s+cu[aá]l|expl[ií]came|me\s+explicas)|^(?:qu[eé]\s+es\s+eso|de\s+qu[eé]\s+me\s+hablas)/u

const PATRON_ORIENTACION =
  /^(?:asesoria|asesoría|orientacion|orientación|recomendacion|recomendación)$|^(?:necesito|quiero|solicito|requiero|ocupo|busco|me\s+gustaria|deseo)\s+(?:una\s+)?(?:asesoria|orientacion|ayuda\s+para\s+elegir)\b|^(?:ayudame|ayudeme)\s+a\s+(?:escoger|elegir|decidir)\b|^(?:no\s+s[eé]\s+(?:qu[eé]|cu[aá]l)\s+(?:necesito|producto|equipo|elegir|escoger|comprar))|^(?:qu[eé]\s+(?:equipo|producto|sistema)\s+me\s+recomiendan)|^(?:me\s+pueden\s+(?:asesorar|orientar|recomendar))|^(?:necesito\s+que\s+me\s+orienten)/u

const PATRON_COTIZACION =
  /\b(?:necesito|quiero|quisiera|deseo|requiero|solicito|me\s+gustaria|vengo\s+a)\s+(?:cotizar|una\s+cotizacion|cotizacion|precios?)\b/u

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

  const normalizado = quitarPuntuacion(normalizarParaDeteccion(original))
  if (normalizado.length === 0) {
    return 'sin_contenido'
  }

  if (PATRON_ACLARACION.test(normalizado)) {
    return 'aclaracion'
  }

  if (esReferenciaProducto(original)) {
    return 'referencia_producto'
  }

  if (PATRON_ORIENTACION.test(normalizado)) {
    return 'solicitud_orientacion'
  }

  if (PATRON_COTIZACION.test(normalizado)) {
    return 'solicitud_cotizacion'
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

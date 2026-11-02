import { normalizarTexto, quitarPuntuacion } from './normalizar-texto.js'

export type ReferenciaProducto =
  'otro' | 'primero' | 'segundo' | 'ese' | 'ese_no' | 'misma_marca' | 'diferente'

/**
 * Expresiones que solo tienen sentido respecto a las opciones mostradas antes.
 * Se reconocen como mensaje completo para no confundirlas con una solicitud de
 * producto nueva ("necesito otro gabinete" no es una referencia pura).
 */
const PATRON_REFERENCIA =
  /^(?:(?:si|sí|ok|claro|bueno)[,\s]+)?(?:(?:necesito|quiero|dame|muestrame|ensename|ver|busco|prefiero|quisiera|me\s+interesa|hay)\s+)?(?:(?:otro|otra)(?:\s+(?:modelo|opcion|alternativa|producto))?|(?:(?:una|otra)\s+)?(?:opcion|alternativa)(?:\s+diferente)?|(?:uno|algo)\s+diferente|(?:el|la)\s+(?:primero|primera|segundo|segunda)|(?:ese|esa|este|esta)(?:\s+no)?|(?:de\s+la\s+)?misma\s+marca|otro\s+modelo)$/u

export function detectarReferenciaProducto(texto: string): ReferenciaProducto | null {
  const normalizado = quitarPuntuacion(normalizarTexto(texto))
  if (normalizado.length === 0 || !PATRON_REFERENCIA.test(normalizado)) {
    return null
  }

  if (/\bmisma\s+marca\b/u.test(normalizado)) {
    return 'misma_marca'
  }
  if (/\bsegund[oa]\b/u.test(normalizado)) {
    return 'segundo'
  }
  if (/\bprimer[oa]\b/u.test(normalizado)) {
    return 'primero'
  }
  if (/\b(?:ese|esa|este|esta)\s+no\b|\bno\s+(?:ese|esa|este|esta)\b/u.test(normalizado)) {
    return 'ese_no'
  }
  if (/\b(?:ese|esa|este|esta)\b/u.test(normalizado)) {
    return 'ese'
  }
  if (/\b(?:diferente|distint[oa])\b/u.test(normalizado)) {
    return 'diferente'
  }
  return 'otro'
}

export function esReferenciaProducto(texto: string): boolean {
  return detectarReferenciaProducto(texto) !== null
}

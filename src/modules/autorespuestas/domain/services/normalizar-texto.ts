const CORRECCIONES_TIPOGRAFICAS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bgsutaria\b/g, 'gustaria'],
  [/\bgstaria\b/g, 'gustaria'],
  [/\bgutaria\b/g, 'gustaria'],
  [/\bnesesito\b/g, 'necesito'],
  [/\bnesecito\b/g, 'necesito'],
]

const EXPRESION_SOCIAL =
  'hola|buenas|buenos dias|buenas tardes|buenas noches|que tal|saludos|hey|mucho gusto|un placer|encantad[oa]|buen dia|de nada|el placer es mio'

const PATRON_SALUDO = new RegExp(`^(?:${EXPRESION_SOCIAL})(?:[,\\s]+(?:${EXPRESION_SOCIAL}))*$`)

const PATRON_CORREO_GLOBAL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi

export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizarParaDeteccion(texto: string): string {
  let normalizado = normalizarTexto(texto)
  for (const [patron, reemplazo] of CORRECCIONES_TIPOGRAFICAS) {
    normalizado = normalizado.replace(patron, reemplazo)
  }
  return normalizado
}

export function quitarPuntuacion(texto: string): string {
  return texto
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function esSoloSaludo(texto: string): boolean {
  const normalizado = quitarPuntuacion(normalizarParaDeteccion(texto))
  return normalizado.length > 0 && PATRON_SALUDO.test(normalizado)
}

export function ocultarCorreos(texto: string): string {
  return texto.replace(PATRON_CORREO_GLOBAL, (correo) => ' '.repeat(correo.length))
}

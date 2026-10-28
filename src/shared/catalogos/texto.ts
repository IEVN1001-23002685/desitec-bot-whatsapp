/**
 * Utilidades de normalización para catálogos locales.
 *
 * Se mantienen separadas de `normalizar-texto.ts` porque los catálogos
 * necesitan comparar nombres oficiales (con acentos, guiones y paréntesis)
 * sin depender de las reglas conversacionales del flujo de leads.
 */

export function quitarAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

export function normalizarCatalogo(texto: string): string {
  return quitarAcentos(texto)
    .toLowerCase()
    .replace(/&/gu, ' y ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

export function normalizarModelo(texto: string): string {
  return quitarAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, '')
}

export function tokensCatalogo(texto: string): string[] {
  const normalizado = normalizarCatalogo(texto)
  return normalizado.length === 0 ? [] : normalizado.split(' ')
}

/**
 * Devuelve el índice donde aparece `frase` como secuencia completa de
 * palabras dentro de `textoNormalizado`, o -1 si no aparece.
 */
export function indiceFrase(textoNormalizado: string, frase: string): number {
  if (frase.length === 0) {
    return -1
  }

  let desde = 0
  while (desde <= textoNormalizado.length - frase.length) {
    const indice = textoNormalizado.indexOf(frase, desde)
    if (indice < 0) {
      return -1
    }

    const antes = indice === 0 ? ' ' : textoNormalizado[indice - 1]
    const despuesIndice = indice + frase.length
    const despues =
      despuesIndice >= textoNormalizado.length ? ' ' : textoNormalizado[despuesIndice]

    if (antes === ' ' && despues === ' ') {
      return indice
    }
    desde = indice + 1
  }

  return -1
}

export function contieneFrase(textoNormalizado: string, frase: string): boolean {
  return indiceFrase(textoNormalizado, frase) >= 0
}

export function deduplicar<T>(valores: readonly T[], clave: (valor: T) => string): T[] {
  const vistos = new Set<string>()
  const resultado: T[] = []
  for (const valor of valores) {
    const identificador = clave(valor)
    if (vistos.has(identificador)) {
      continue
    }
    vistos.add(identificador)
    resultado.push(valor)
  }
  return resultado
}

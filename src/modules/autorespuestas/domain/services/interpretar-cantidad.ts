import { productosCatalogoLocal } from '../../../../shared/catalogos/consultas.js'
import { extraerModelos } from '../../../../shared/catalogos/productos/index.js'
import { normalizarModelo } from '../../../../shared/catalogos/texto.js'
import { normalizarTexto, ocultarCorreos, quitarPuntuacion } from './normalizar-texto.js'

export type CoincidenciaCantidad = {
  valor: number
  indice: number
  longitud: number
  tecnica: boolean
  referencia: boolean
}

export type ResultadoCantidad =
  | { tipo: 'valida'; valor: number; valores: readonly number[] }
  | { tipo: 'multiple'; valores: readonly number[] }
  | { tipo: 'rango' | 'tecnica' | 'ambigua' | 'ausente' }

const NUMEROS: Readonly<Record<string, number>> = {
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  dieciséis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintiun: 21,
  veintiún: 21,
  veintidos: 22,
  veintidós: 22,
  veintitres: 23,
  veintitrés: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintiséis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
}

const PALABRAS_NUMERO = Object.keys(NUMEROS).sort((a, b) => b.length - a.length)
const ALTERNATIVA_NUMERO = `(?:\\d{1,6}|${PALABRAS_NUMERO.join('|')})`

const PATRON_RANGO = new RegExp(
  [
    `\\bentre\\s+${ALTERNATIVA_NUMERO}\\s+y\\s+${ALTERNATIVA_NUMERO}\\b`,
    `\\bde\\s+${ALTERNATIVA_NUMERO}\\s+a\\s+${ALTERNATIVA_NUMERO}\\b`,
    `(?<![\\p{L}\\p{N}])${ALTERNATIVA_NUMERO}\\s*[-–—]\\s*${ALTERNATIVA_NUMERO}(?![\\p{L}\\p{N}])`,
    `(?<![\\p{L}\\p{N}])${ALTERNATIVA_NUMERO}\\s+o\\s+${ALTERNATIVA_NUMERO}(?![\\p{L}\\p{N}])`,
  ].join('|'),
  'u',
)

const PATRON_DIGITO = /(?<![\p{L}\p{N}.,+-])(\d{1,12})(?![\p{L}\p{N}]|[.,]\d)/gu
const PATRON_PALABRA = new RegExp(
  `(?<![\\p{L}\\p{N}])(${PALABRAS_NUMERO.join('|')})(?![\\p{L}\\p{N}])`,
  'giu',
)

const UNIDADES_TECNICAS =
  'gpm|psi|bar|rpm|hp|kw|kva|kv|w|ma|a|mm|cm|km|kg|g|ton|lb|l|ml|metros?|litros?|pies?|pulgadas?|grados?|volts?|amperes?|m'
const PATRON_UNIDAD_TECNICA = new RegExp(`^\\s*(?:(?:${UNIDADES_TECNICAS})\\b|%)`, 'iu')
const PATRON_REFERENCIA_ANTERIOR = /\b(?:modelo|serie|codigo|referencia|sku|item|id)\s*$/u
const PATRON_DECIMAL = /\b\d+[.,]\d+\b/u

let modelosCatalogoCache: readonly string[] | null = null

function modelosCatalogo(): readonly string[] {
  if (modelosCatalogoCache === null) {
    const modelos = new Set<string>()
    for (const producto of productosCatalogoLocal()) {
      for (const modelo of extraerModelos(producto.nombre)) {
        modelos.add(modelo)
      }
    }
    modelosCatalogoCache = [...modelos]
  }
  return modelosCatalogoCache
}

export function interpretarCantidad(texto: string): ResultadoCantidad {
  const textoOculto = ocultarCorreos(texto).replace(/[.,;!?]+$/u, '')
  const normalizado = normalizarTexto(textoOculto)

  if (PATRON_RANGO.test(normalizado)) {
    return { tipo: 'rango' }
  }

  if (PATRON_DECIMAL.test(textoOculto)) {
    return { tipo: 'ambigua' }
  }

  const coincidencias = buscarCantidades(textoOculto)
  const validas = coincidencias.filter(
    (coincidencia) => !coincidencia.tecnica && !coincidencia.referencia && coincidencia.valor > 0,
  )

  if (validas.length === 0) {
    if (coincidencias.some((coincidencia) => coincidencia.tecnica || coincidencia.referencia)) {
      return { tipo: 'tecnica' }
    }
    return { tipo: 'ausente' }
  }

  const valores = validas.map((coincidencia) => coincidencia.valor)
  if (valores.length === 1) {
    return { tipo: 'valida', valor: valores[0] ?? 0, valores }
  }

  return { tipo: 'multiple', valores }
}

export function buscarCantidades(texto: string): CoincidenciaCantidad[] {
  const textoOculto = ocultarCorreos(texto).replace(/[.,;!?]+$/u, '')
  const coincidencias: CoincidenciaCantidad[] = []

  for (const coincidencia of textoOculto.matchAll(PATRON_DIGITO)) {
    const indice = coincidencia.index ?? 0
    const valor = Number(coincidencia[1])
    if (!Number.isSafeInteger(valor) || valor < 0) {
      continue
    }
    coincidencias.push({
      valor,
      indice,
      longitud: coincidencia[0].length,
      tecnica: esUnidadTecnica(textoOculto, indice + coincidencia[0].length),
      referencia: esReferencia(textoOculto, indice, coincidencia[0].length),
    })
  }

  for (const coincidencia of textoOculto.matchAll(PATRON_PALABRA)) {
    const indice = coincidencia.index ?? 0
    const palabra = normalizarTexto(coincidencia[1] ?? '')
    const valor = NUMEROS[palabra]
    if (valor === undefined) {
      continue
    }
    coincidencias.push({
      valor,
      indice,
      longitud: coincidencia[0].length,
      tecnica: esUnidadTecnica(textoOculto, indice + coincidencia[0].length),
      referencia: esReferencia(textoOculto, indice, coincidencia[0].length),
    })
  }

  return coincidencias.sort((a, b) => a.indice - b.indice)
}

function esUnidadTecnica(texto: string, desde: number): boolean {
  const resto = texto.slice(desde, desde + 24)
  return PATRON_UNIDAD_TECNICA.test(resto)
}

function esReferencia(texto: string, indice: number, longitud: number): boolean {
  const anterior = texto.slice(Math.max(0, indice - 24), indice)
  if (PATRON_REFERENCIA_ANTERIOR.test(quitarPuntuacion(normalizarTexto(anterior)))) {
    return true
  }
  return esNumeroDeModelo(texto, indice, longitud)
}

/**
 * Detecta mensajes cuyo contenido es unicamente una cantidad ("90",
 * "serian 90 piezas", "quiero 90"). Sirve para conservar una cantidad
 * preliminar antes de que el producto este confirmado.
 */
export function esCantidadAislada(texto: string): boolean {
  const resultado = interpretarCantidad(texto)
  if (resultado.tipo !== 'valida') {
    return false
  }

  const resto = ocultarCorreos(texto)
    .replace(/\d+/gu, ' ')
    .replace(new RegExp(`\\b(?:${PALABRAS_NUMERO.join('|')})\\b`, 'giu'), ' ')
    .replace(
      /\b(?:piezas?|pzas?|unidades?|equipos?|juegos?|kits?|de|del|en|total|seria|serian|seran|sera|son|es|quiero|quisiera|necesito|ocupo|requiero|solicito|deseo|aprox|aproximadamente|como|alrededor|mas|menos|o|un|una|unos|unas)\b/giu,
      ' ',
    )

  return quitarPuntuacion(normalizarTexto(resto)).trim().length === 0
}

/**
 * Evita que el numero inicial de un modelo (`3-ZA40B`) o un modelo escrito con
 * espacio (`FSP 951`) se interprete como cantidad. Solo se considera referencia
 * cuando el contexto coincide con un modelo real del catalogo.
 */
function esNumeroDeModelo(texto: string, indice: number, longitud: number): boolean {
  const candidatos = contextosModelo(texto, indice, longitud)
  if (candidatos.length === 0) {
    return false
  }
  const modelos = modelosCatalogo()
  return candidatos.some((candidato) =>
    modelos.some(
      (modelo) => modelo === candidato || (candidato.length >= 4 && modelo.includes(candidato)),
    ),
  )
}

function contextosModelo(texto: string, indice: number, longitud: number): string[] {
  const candidatos = new Set<string>()

  let inicio = indice
  while (inicio > 0 && /[A-Za-z0-9/_-]/u.test(texto[inicio - 1] ?? '')) {
    inicio--
  }
  let fin = indice + longitud
  while (fin < texto.length && /[A-Za-z0-9/_-]/u.test(texto[fin] ?? '')) {
    fin++
  }
  const contiguo = texto.slice(inicio, fin)
  if (/[A-Za-z]/u.test(contiguo) && /\d/u.test(contiguo)) {
    candidatos.add(normalizarModelo(contiguo))
  }

  const numero = texto.slice(indice, indice + longitud)
  const antes = texto.slice(0, indice).match(/([A-Za-z]{2,12})\s*$/u)
  const despues = texto.slice(indice + longitud).match(/^([A-Za-z]{0,4})\b/u)
  if (antes?.[1]) {
    candidatos.add(normalizarModelo(`${antes[1]}${numero}${despues?.[1] ?? ''}`))
  }

  const siguiente = texto.slice(indice + longitud).match(/^\s+([A-Za-z][A-Za-z0-9]{1,11})\b/u)
  if (siguiente?.[1]) {
    candidatos.add(normalizarModelo(`${numero}${siguiente[1]}`))
  }

  return [...candidatos].filter(
    (candidato) => candidato.length >= 3 && /\d/u.test(candidato) && /[a-z]/u.test(candidato),
  )
}

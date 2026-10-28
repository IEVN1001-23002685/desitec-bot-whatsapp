import {
  buscarProductosLocal,
  resolverUbicacionExactaLocal,
  resolverUbicacionLocal,
} from '../../../../shared/catalogos/consultas.js'
import type {
  ResultadoUbicacion,
  UbicacionValidada,
} from '../../../../shared/catalogos/geografia/index.js'
import type { CoincidenciaProducto } from '../../../../shared/catalogos/productos/index.js'
import type { ProductoLead, UbicacionLead } from '../types/datos-lead.js'
import type { PasoLead } from '../types/paso-lead.js'
import { esSolicitudDeHumano } from './detectar-solicitud-humano.js'
import { buscarCantidades } from './interpretar-cantidad.js'
import {
  esSoloSaludo,
  normalizarTexto,
  ocultarCorreos,
  quitarPuntuacion,
} from './normalizar-texto.js'
import {
  esCorreoValido,
  esSolicitudProductoSuficiente,
  extraerCorreos,
  validarNombre,
} from './validar-datos.js'

export { esCorreoValido, extraerCorreos }
export { esSolicitudProductoSuficiente as esProductoLibre }

/** Compatibilidad con el nombre anterior del tipo de producto detectado. */
export type ProductoDetectado = ProductoLead

export type OperacionProductos = 'agregar' | 'reemplazar'

export type ResultadoProductosMensaje =
  | {
    tipo: 'confirmado'
    productos: readonly ProductoLead[]
    operacion: OperacionProductos
  }
  | {
    tipo: 'suficiente'
    solicitud: string
    operacion: OperacionProductos
  }
  | {
    tipo: 'ambiguo'
    candidatos: readonly CoincidenciaProducto[]
    solicitud: string | null
  }
  | { tipo: 'ninguno' }

export type OpcionesProductosMensaje = {
  pasoActual: PasoLead
  esPrimerMensaje: boolean
  nombre: string | null
  correo: string | null
  ubicacion: UbicacionLead | null
}

const PATRON_NOMBRE_EXPLICITO =
  /\b(?:me\s+llamo|mi\s+nombre\s+es|soy)\s+([\p{L}][\p{L}'.-]*(?:\s+[\p{L}][\p{L}'.-]*){0,4})/iu

const PATRON_CIUDAD_EXPLICITO =
  /\b(?:mi\s+ciudad\s+es|mi\s+ubicaci[oó]n\s+es|vivo\s+en|vive\s+en|vives\s+en|estoy\s+en|estamos\s+en|trabajo\s+en|radico\s+en|soy\s+de|somos\s+de|ciudad\s+de|municipio\s+de|entrega\s+en|entregar\s+en|env[ií]o\s+a|para|hacia)\s+([\p{L}][\p{L}'.-]*(?:\s+[\p{L}][\p{L}'.-]*){0,5})/iu

const PATRON_CTA_PRODUCTO =
  /^\s*(?:hola[,!.\s]+)?quiero\s+informaci[oó]n\s+(?:del?\s+|sobre\s+(?:el\s+)?)(?:producto|productos)\s*:?\s*(?<producto>.*)$/isu

const PATRON_CTA_GLOBAL =
  /^(?:hola\s+)?me gustaria recibir asesoria de un especialista para elegir la solucion adecuada(?: me pueden apoyar)?$/u

const PATRON_CORRECCION =
  /\b(?:en\s+realidad|mejor|corrijo|corrige|corrigen|corrija|corregir|cambia|cambio|cambiar|perd[oó]n|no\s+era|no\s+eran|no\s+es|no\s+son)\b/iu

const PATRON_AGREGAR =
  /\b(?:tambi[eé]n|adem[aá]s|agrega|agregar|a[ñn]ade|a[ñn]adir|suma|sumar|otro|otra)\b/iu

const PATRON_PREFIJO_CORRECCION =
  /^\s*(?:(?:en\s+realidad|mejor|perd[oó]n|corrijo|corrige|corrigen|corrija|corregir|cambia|cambio|cambiar)\s+)?(?:(?:el|los|la|las)\s+)?(?:modelos?|productos?)\s+(?:(?:es|son|ser[aá]n?|a|por|era|eran)\s+)?/iu

const PATRON_PREFIJO_AGREGAR =
  /^\s*(?:tambi[eé]n|adem[aá]s|agrega(?:r)?|a[ñn]ade(?:r)?|suma(?:r)?)\s+(?:me\s+)?/iu

const PATRON_VERBO_PRODUCTO =
  /\b(?:necesito|quiero|busco|cotizar|solicito|requiero|ocupo|deseo|me\s+interesa|me\s+interesan|informaci[oó]n\s+(?:del?|sobre\s+el)\s+(?:producto|productos))\b/iu

const PATRON_CANTIDAD_APROXIMADA =
  /\b(?:como|alrededor\s+de|aproximadamente|aprox\.?|cerca\s+de|unas?|unos?)\s+\d{1,6}\b|\b\d{1,6}\s*(?:aprox\.?|aproximadamente|m[aá]s\s+o\s+menos)\b/iu

const PALABRAS_RELLENO_SOLICITUD = new Set([
  'a',
  'al',
  'algo',
  'algun',
  'alguna',
  'algunas',
  'algunos',
  'asi',
  'buenas',
  'bueno',
  'buenos',
  'claro',
  'como',
  'con',
  'de',
  'del',
  'deseo',
  'donde',
  'el',
  'en',
  'entonces',
  'esa',
  'ese',
  'eso',
  'esta',
  'este',
  'favor',
  'gracias',
  'hola',
  'la',
  'las',
  'listo',
  'los',
  'me',
  'mi',
  'necesito',
  'no',
  'o',
  'ocupo',
  'ok',
  'okay',
  'para',
  'pero',
  'por',
  'producto',
  'productos',
  'quiero',
  'requiero',
  'si',
  'sin',
  'solicito',
  'soy',
  'su',
  'sus',
  'un',
  'una',
  'unas',
  'uno',
  'unos',
  'y',
])

const PALABRAS_UNIDAD_SOLICITUD = new Set([
  'pieza',
  'piezas',
  'pza',
  'pzas',
  'unidad',
  'unidades',
  'equipo',
  'equipos',
  'juego',
  'juegos',
  'kit',
  'kits',
])

export function extraerNombre(texto: string, aceptarTextoSimple: boolean): string | null {
  const explicito = texto.match(PATRON_NOMBRE_EXPLICITO)
  if (explicito?.[1]) {
    const resultado = validarNombre(explicito[1], { aceptarTextoSimple: true })
    if (resultado.valido && !resultado.rechazado) {
      return resultado.nombre
    }
  }

  if (!aceptarTextoSimple) {
    return null
  }

  const resultado = validarNombre(texto, { aceptarTextoSimple: true })
  return resultado.valido && !resultado.rechazado ? resultado.nombre : null
}

export type ResultadoUbicacionMensaje =
  | { tipo: 'mexicana'; ubicacion: UbicacionLead }
  | { tipo: 'extranjera'; ubicacion: UbicacionLead }
  | { tipo: 'ambigua'; candidatos: readonly UbicacionLead[] }
  | { tipo: 'incompleta'; ubicacion: UbicacionLead }
  | { tipo: 'ninguna' }

export type OpcionesUbicacionMensaje = {
  aceptarTextoSimple?: boolean
  buscarEnTexto?: boolean
}

const PATRON_CORTE_UBICACION =
  /\s+(?:y|e|para|con|pero|aunque|mi|mis|necesito|quiero|busco|cotizar|solicito|correo|telefono|whatsapp|por\s+favor|gracias)\b.*$/iu

export function extraerUbicacionMensaje(
  texto: string,
  opciones: OpcionesUbicacionMensaje = {},
): ResultadoUbicacionMensaje {
  const bruto = texto.trim()
  if (bruto.length === 0) {
    return { tipo: 'ninguna' }
  }

  const candidatos: string[] = []
  const explicito = bruto.match(PATRON_CIUDAD_EXPLICITO)
  if (explicito?.[1]) {
    candidatos.push(explicito[1])
  }
  if (opciones.aceptarTextoSimple) {
    candidatos.push(bruto)
  }
  if (opciones.buscarEnTexto !== false) {
    // Se busca la ubicacion en el texto completo (sin recortar por conectores)
    // para reconocer frases como "2 detectores y 6 gabinetes para Queretaro".
    const oculto = ocultarCorreos(bruto)
    candidatos.push(oculto)
  }

  const resultados: ResultadoUbicacionMensaje[] = []
  const vistos = new Set<string>()
  for (const candidato of candidatos) {
    const limpio = limpiarCandidatoUbicacion(candidato)
    if (limpio.length < 2 || vistos.has(limpio.toLowerCase())) {
      continue
    }
    vistos.add(limpio.toLowerCase())

    const exacto = resolverUbicacionExactaLocal(limpio)
    const resultado =
      exacto.tipo === 'no_reconocida' ? resolverUbicacionLocal(limpio) : exacto
    const convertido = convertirResultadoUbicacion(resultado)
    if (convertido.tipo !== 'ninguna') {
      resultados.push(convertido)
    }
  }

  const mexicana = resultados.find((resultado) => resultado.tipo === 'mexicana')
  if (mexicana) {
    return mexicana
  }
  const extranjera = resultados.find((resultado) => resultado.tipo === 'extranjera')
  if (extranjera) {
    return extranjera
  }
  const incompleta = resultados.find((resultado) => resultado.tipo === 'incompleta')
  if (incompleta) {
    return incompleta
  }
  const ambiguas = resultados.filter(
    (resultado): resultado is Extract<ResultadoUbicacionMensaje, { tipo: 'ambigua' }> =>
      resultado.tipo === 'ambigua',
  )
  if (ambiguas.length > 0) {
    return {
      tipo: 'ambigua',
      candidatos: deduplicarUbicacionesLead(
        ambiguas.flatMap((resultado) => resultado.candidatos),
      ),
    }
  }
  return { tipo: 'ninguna' }
}

export function extraerCiudad(texto: string, aceptarTextoSimple: boolean): string | null {
  const resultado = extraerUbicacionMensaje(texto, { aceptarTextoSimple })
  if (resultado.tipo === 'mexicana' || resultado.tipo === 'extranjera') {
    return resultado.ubicacion.nombreMostrado
  }
  return null
}

export function aUbicacionLead(ubicacion: UbicacionValidada): UbicacionLead {
  return {
    tipo: ubicacion.tipo,
    nombreMostrado: ubicacion.nombreMostrado,
    pais: ubicacion.pais,
    entidad: ubicacion.entidad,
    municipio: ubicacion.municipio,
    localidad: ubicacion.localidad,
    cvegeo: ubicacion.cvegeo,
    completa: ubicacion.completa,
  }
}

export function esUbicacionMexicanaValida(ubicacion: UbicacionLead | null): boolean {
  return ubicacion !== null && ubicacion.pais === 'México' && ubicacion.completa
}

export function esUbicacionExtranjera(ubicacion: UbicacionLead | null): boolean {
  return ubicacion !== null && ubicacion.pais !== 'México'
}

function convertirResultadoUbicacion(
  resultado: ResultadoUbicacion,
): ResultadoUbicacionMensaje {
  switch (resultado.tipo) {
    case 'mexicana': {
      const ubicacion = aUbicacionLead(resultado.ubicacion)
      return resultado.ubicacion.completa
        ? { tipo: 'mexicana', ubicacion }
        : { tipo: 'incompleta', ubicacion }
    }
    case 'extranjera':
      return { tipo: 'extranjera', ubicacion: aUbicacionLead(resultado.ubicacion) }
    case 'ambigua': {
      const candidatos = deduplicarUbicacionesLead(
        resultado.candidatos.map(aUbicacionLead),
      )
      return candidatos.length > 0
        ? { tipo: 'ambigua', candidatos }
        : { tipo: 'ninguna' }
    }
    case 'no_reconocida':
      return { tipo: 'ninguna' }
  }
}

function limpiarCandidatoUbicacion(texto: string): string {
  return texto
    .replace(PATRON_CORTE_UBICACION, ' ')
    .replace(/^[\s,;:.!?-]+|[\s,;:.!?-]+$/gu, '')
    .replace(/^(?:en|de|para|hacia|a)\s+/iu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function deduplicarUbicacionesLead(
  ubicaciones: readonly UbicacionLead[],
): UbicacionLead[] {
  const vistos = new Set<string>()
  const resultado: UbicacionLead[] = []
  for (const ubicacion of ubicaciones) {
    const clave = `${ubicacion.tipo}:${ubicacion.cvegeo ?? ubicacion.nombreMostrado}`
    if (vistos.has(clave)) {
      continue
    }
    vistos.add(clave)
    resultado.push(ubicacion)
  }
  return resultado
}

export function formatearCandidatosProductos(
  candidatos: readonly CoincidenciaProducto[],
  limite = 3,
): string {
  const vistos = new Set<string>()
  const nombres: string[] = []
  for (const candidato of candidatos) {
    const clave = candidato.producto.url || candidato.producto.nombre.toLowerCase()
    if (vistos.has(clave)) {
      continue
    }
    vistos.add(clave)
    nombres.push(candidato.producto.nombre)
    if (nombres.length >= limite) {
      break
    }
  }
  return nombres.join('; ')
}


export function extraerProductosMensaje(
  texto: string,
  opciones: OpcionesProductosMensaje,
): ResultadoProductosMensaje {
  const bruto = texto.trim()
  if (bruto.length === 0 || esSoloSaludo(bruto) || esSolicitudDeHumano(bruto)) {
    return { tipo: 'ninguno' }
  }

  if (esCtaGlobal(bruto)) {
    return { tipo: 'ninguno' }
  }

  const cta = bruto.match(PATRON_CTA_PRODUCTO)
  const base = (cta?.groups?.['producto']?.trim() || bruto).trim()
  if (base.length === 0) {
    return { tipo: 'ninguno' }
  }

  const operacion = operacionDeProductos(base, opciones)
  const confirmados = buscarProductosConfirmados(base, opciones)
  if (confirmados.length > 0) {
    return {
      tipo: 'confirmado',
      productos: asignarCantidades(confirmados, base),
      operacion,
    }
  }

  const busqueda = buscarProductosLocal(limpiarParaBusqueda(base, opciones))
  const solicitud = limpiarSolicitudProducto(base, opciones)
  if (solicitud !== null && esSolicitudProductoSuficiente(solicitud)) {
    return { tipo: 'suficiente', solicitud, operacion }
  }

  if (busqueda.tipo === 'ambiguo') {
    return {
      tipo: 'ambiguo',
      candidatos: busqueda.candidatos,
      solicitud,
    }
  }

  return { tipo: 'ninguno' }
}

export function esCtaGlobal(texto: string): boolean {
  return PATRON_CTA_GLOBAL.test(quitarPuntuacion(normalizarTexto(texto)))
}

export function extraerCantidadAproximada(texto: string): string | null {
  const coincidencia = texto.match(PATRON_CANTIDAD_APROXIMADA)
  return coincidencia ? coincidencia[0].trim() : null
}

export function esCorreccionDeProductos(texto: string): boolean {
  return PATRON_CORRECCION.test(texto)
}

export function esAgregadoDeProductos(texto: string): boolean {
  return PATRON_AGREGAR.test(texto)
}

export function mencionaProducto(texto: string): boolean {
  return PATRON_VERBO_PRODUCTO.test(texto)
}

export function contarSegmentosProducto(texto: string): number {
  const limpio = quitarPuntuacion(normalizarTexto(texto))
  if (limpio.length === 0) {
    return 0
  }
  const segmentos = limpio
    .split(/\s+(?:y|e)\s+|[;,]/u)
    .map((segmento) => segmento.trim())
    .filter((segmento) => segmento.length > 0)
  return segmentos.length
}

export function formatearProductos(
  productos: readonly ProductoLead[],
  incluirCantidades: boolean,
): string | null {
  if (productos.length === 0) {
    return null
  }

  return productos
    .map((producto) =>
      incluirCantidades && producto.cantidad !== null
        ? `${producto.nombre} (${producto.cantidad})`
        : producto.nombre,
    )
    .join('; ')
}

export function normalizarProducto(texto: string): string {
  return normalizarTexto(texto.replace(/\(\d+\)/gu, ''))
}

export function pareceIntentoDeCorreo(texto: string): boolean {
  return /@/u.test(texto) || /\bcorreo\b/u.test(quitarPuntuacion(normalizarTexto(texto)))
}

function operacionDeProductos(
  texto: string,
  opciones: OpcionesProductosMensaje,
): OperacionProductos {
  if (PATRON_CORRECCION.test(texto)) {
    return 'reemplazar'
  }
  if (PATRON_AGREGAR.test(texto) || opciones.pasoActual === 'cantidad') {
    return 'agregar'
  }
  return 'reemplazar'
}

function buscarProductosConfirmados(
  texto: string,
  opciones: OpcionesProductosMensaje,
): ProductoLead[] {
  const encontrados = new Map<string, ProductoLead>()
  const textos = [texto, limpiarParaBusqueda(texto, opciones)]

  for (const candidato of textos) {
    const resultado = buscarProductosLocal(candidato)
    if (resultado.tipo === 'confirmado') {
      for (const coincidencia of resultado.coincidencias) {
        agregarProducto(encontrados, {
          nombre: coincidencia.producto.nombre,
          url: coincidencia.producto.url,
          cantidad: null,
        })
      }
    }
  }

  for (const segmento of separarSegmentos(texto)) {
    const resultado = buscarProductosLocal(segmento)
    if (resultado.tipo === 'confirmado') {
      for (const coincidencia of resultado.coincidencias) {
        agregarProducto(encontrados, {
          nombre: coincidencia.producto.nombre,
          url: coincidencia.producto.url,
          cantidad: null,
        })
      }
    }
  }

  return [...encontrados.values()]
}

function separarSegmentos(texto: string): string[] {
  return texto
    .split(/[;,]|\s+(?:y|e)\s+/u)
    .map((segmento) => segmento.trim())
    .filter((segmento) => segmento.length >= 3)
}

function agregarProducto(acumulados: Map<string, ProductoLead>, producto: ProductoLead): void {
  const clave = producto.url ?? normalizarProducto(producto.nombre)
  if (!acumulados.has(clave)) {
    acumulados.set(clave, producto)
  }
}

function asignarCantidades(
  productos: readonly ProductoLead[],
  texto: string,
): ProductoLead[] {
  const cantidades = buscarCantidades(texto)
    .filter(
      (coincidencia) =>
        !coincidencia.tecnica && !coincidencia.referencia && coincidencia.valor > 0,
    )
    .map((coincidencia) => coincidencia.valor)

  if (productos.length === 1) {
    const cantidad = cantidades.length === 1 ? (cantidades[0] ?? null) : null
    return [{ ...productos[0]!, cantidad }]
  }

  if (cantidades.length !== productos.length) {
    return productos.map((producto) => ({ ...producto, cantidad: null }))
  }

  return productos.map((producto, indice) => ({
    ...producto,
    cantidad: cantidades[indice] ?? null,
  }))
}

function limpiarParaBusqueda(
  texto: string,
  opciones: OpcionesProductosMensaje,
): string {
  let valor = ocultarCorreos(texto)
    .replace(/\bhttps?:\/\/\S+/giu, ' ')
    .replace(PATRON_PREFIJO_CORRECCION, ' ')
    .replace(PATRON_PREFIJO_AGREGAR, ' ')
    .replace(
      /^(?:hola|buenas|buenos\s+dias|buenas\s+tardes|buenas\s+noches)[,:\s]+/iu,
      ' ',
    )
    .replace(
      /^(?:(?:necesito|quiero|busco|cotizar|solicito|requiero|ocupo|deseo|me\s+interesa(?:n)?)\b\s*)+/iu,
      ' ',
    )
    .replace(
      /^(?:informaci[oó]n|info)\s+(?:del?\s+|sobre\s+(?:el\s+)?)(?:producto|productos)\s*:?\s*/iu,
      ' ',
    )

  valor = quitarDatosConocidos(valor, opciones)
  return valor.replace(/\s+/gu, ' ').trim()
}

function limpiarSolicitudProducto(
  texto: string,
  opciones: OpcionesProductosMensaje,
): string | null {
  let valor = limpiarParaBusqueda(texto, opciones)
  valor = valor
    .replace(PATRON_CANTIDAD_APROXIMADA, ' ')
    .replace(
      /\b(?:unas?|unos?|como|alrededor\s+de|aproximadamente|aprox\.?|cerca\s+de)\s+/giu,
      ' ',
    )
    .replace(/\b\d{1,6}\b/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()

  valor = valor
    .replace(/^[\s,;:.!?-]+|[\s,;:.!?-]+$/gu, '')
    .replace(/\s+(?:para|en|con|de|del|y|e)\s*$/iu, '')
    .replace(/^(?:para|en|con|de|del|y|e)\s+/iu, '')
    .replace(/\s+/gu, ' ')
    .trim()

  if (valor.length === 0) {
    return null
  }

  const palabras = valor
    .split(/\s+/u)
    .map((palabra) => palabra.toLowerCase())
    .filter((palabra) => palabra.length > 0)
  const significativas = palabras.filter(
    (palabra) =>
      !PALABRAS_RELLENO_SOLICITUD.has(palabra) && !PALABRAS_UNIDAD_SOLICITUD.has(palabra),
  )
  if (significativas.length === 0) {
    return null
  }

  return valor
}

function quitarDatosConocidos(
  texto: string,
  opciones: OpcionesProductosMensaje,
): string {
  let valor = texto
  const datos = [
    opciones.nombre,
    opciones.correo,
    opciones.ubicacion?.nombreMostrado ?? null,
    opciones.ubicacion?.localidad ?? null,
    opciones.ubicacion?.municipio ?? null,
    opciones.ubicacion?.entidad ?? null,
  ]

  for (const dato of datos) {
    if (dato !== null && dato.trim().length >= 2) {
      valor = valor.replace(new RegExp(escaparRegex(dato.trim()), 'giu'), ' ')
    }
  }

  return valor
    .replace(
      /\b(?:mi\s+ciudad\s+es|mi\s+ubicaci[oó]n\s+es|vivo\s+en|vive\s+en|vives\s+en|estoy\s+en|estamos\s+en|trabajo\s+en|radico\s+en|soy\s+de|somos\s+de|ciudad\s+de|municipio\s+de|entrega\s+en|entregar\s+en|env[ií]o\s+a)\b/giu, ' ')
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

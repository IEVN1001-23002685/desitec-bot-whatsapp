import {
  buscarProductosLocal,
  esCategoriaProducto,
  resolverUbicacionExactaLocal,
} from '../../../../shared/catalogos/consultas.js'
import { esSolicitudDeHumano } from './detectar-solicitud-humano.js'
import { normalizarTexto, ocultarCorreos, quitarPuntuacion } from './normalizar-texto.js'

export type ResultadoNombre =
  | { valido: true; nombre: string; rechazado: false }
  | { valido: true; nombre: null; rechazado: true }
  | { valido: false; motivo: 'invalido' }

export type ResultadoCorreo =
  { valido: true; correo: string } | { valido: false; motivo: 'invalido' | 'multiple' }

const PATRON_CORREO_GLOBAL =
  /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/giu

const PATRON_CORREO_COMPLETO =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u

const PATRON_NOMBRE_EXPLICITO =
  /\b(?:me\s+llamo|mi\s+nombre\s+es|soy)\s+([\p{L}][\p{L}'.-]*(?:\s+[\p{L}][\p{L}'.-]*){0,4})/iu

const PALABRAS_INVALIDAS_NOMBRE = new Set([
  'asesor',
  'asesora',
  'asesoria',
  'agente',
  'atencion',
  'ayuda',
  'buen',
  'buenas',
  'bueno',
  'buenos',
  'cabos',
  'cabo',
  'cantidad',
  'claro',
  'correo',
  'cotizacion',
  'cotizar',
  'de',
  'del',
  'deseo',
  'dia',
  'dias',
  'ejecutivo',
  'el',
  'encantada',
  'encantado',
  'en',
  'entonces',
  'esa',
  'ese',
  'eso',
  'esta',
  'este',
  'favor',
  'gracias',
  'gustaria',
  'gusto',
  'hola',
  'humano',
  'humana',
  'informacion',
  'la',
  'las',
  'listo',
  'los',
  'me',
  'mi',
  'modelo',
  'modelos',
  'muchas',
  'mucho',
  'muchos',
  'necesito',
  'ninguna',
  'ninguno',
  'no',
  'noches',
  'nombre',
  'ocupo',
  'ok',
  'okay',
  'para',
  'perfecto',
  'persona',
  'pieza',
  'piezas',
  'placer',
  'por',
  'precio',
  'producto',
  'productos',
  'quiero',
  'requiero',
  'si',
  'solicito',
  'tal',
  'tarde',
  'tardes',
  'telefono',
  'varias',
  'varios',
])

const NOMBRES_PROPIOS_PERMITIDOS = new Set([
  'asuncion',
  'angeles',
  'carmen',
  'concepcion',
  'dolores',
  'fatima',
  'guadalupe',
  'jesus',
  'jose',
  'lourdes',
  'luz',
  'maria',
  'mercedes',
  'milagros',
  'montserrat',
  'natividad',
  'nieves',
  'pilar',
  'remedios',
  'reyes',
  'rosario',
  'salvador',
  'santiago',
  'soledad',
  'trinidad',
  'victoria',
])

const PATRON_RECHAZO_NOMBRE =
  /^(?:sin nombre|prefiero no (?:decir(?:lo)?|dar(?:lo)?|compartir(?:lo)?)|omitelo|omite mi nombre|no quiero (?:dar(?:lo)?|compartir(?:lo)?|decir(?:lo)?)(?: mi nombre)?|no importa|no es necesario)(?:\s+.*)?$/u

const PATRON_SOLO_SIMBOLOS = /^[^\p{L}\p{N}]+$/u

export function extraerCorreos(texto: string): string[] {
  const encontrados = texto.match(PATRON_CORREO_GLOBAL) ?? []
  const validos = encontrados
    .map((correo) => correo.toLowerCase())
    .filter((correo) => esCorreoValido(correo))
  return [...new Set(validos)]
}

export function esCorreoValido(texto: string): boolean {
  const correo = texto.trim().toLowerCase()
  if (correo.length === 0 || correo.length > 254 || /\s/u.test(correo)) {
    return false
  }
  const [local, dominio] = correo.split('@')
  if (!local || !dominio || local.length > 64 || dominio.length === 0) {
    return false
  }
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return false
  }
  if (dominio.startsWith('.') || dominio.endsWith('.') || dominio.includes('..')) {
    return false
  }
  const tld = dominio.split('.').at(-1) ?? ''
  return tld.length >= 2 && /^[a-z]+$/u.test(tld) && PATRON_CORREO_COMPLETO.test(correo)
}

export function validarCorreo(texto: string): ResultadoCorreo {
  const correos = extraerCorreos(texto)
  if (correos.length > 1) {
    return { valido: false, motivo: 'multiple' }
  }
  const correo = correos[0]
  if (!correo) {
    return { valido: false, motivo: 'invalido' }
  }
  return { valido: true, correo }
}

export function validarNombre(
  texto: string,
  opciones: { aceptarTextoSimple?: boolean; permitirRechazo?: boolean } = {},
): ResultadoNombre {
  const bruto = texto.trim()
  if (bruto.length === 0 || PATRON_SOLO_SIMBOLOS.test(bruto)) {
    return { valido: false, motivo: 'invalido' }
  }

  if (esNombreRechazo(bruto)) {
    return opciones.permitirRechazo
      ? { valido: true, nombre: null, rechazado: true }
      : { valido: false, motivo: 'invalido' }
  }

  const explicito = bruto.match(PATRON_NOMBRE_EXPLICITO)
  const candidato = explicito?.[1] ?? (opciones.aceptarTextoSimple === false ? null : bruto)
  if (!candidato) {
    return { valido: false, motivo: 'invalido' }
  }

  const nombre = limpiarNombre(candidato)
  if (!nombre || !esNombreValido(nombre)) {
    return { valido: false, motivo: 'invalido' }
  }
  return { valido: true, nombre, rechazado: false }
}

export function esNombreRechazo(texto: string): boolean {
  const normalizado = quitarPuntuacion(normalizarTexto(texto))
  return PATRON_RECHAZO_NOMBRE.test(normalizado)
}

export function esNombreValido(texto: string): boolean {
  const nombre = texto.trim()
  if (nombre.length < 2 || nombre.length > 60) {
    return false
  }
  if (!/^[\p{L}][\p{L}'.-]*(?:\s+[\p{L}][\p{L}'.-]*){0,4}$/u.test(nombre)) {
    return false
  }
  if (esSolicitudDeHumano(nombre)) {
    return false
  }

  const normalizado = normalizarTexto(quitarPuntuacion(nombre))
  const palabras = normalizado.split(/\s+/).filter((palabra) => palabra.length > 0)
  if (palabras.length === 0) {
    return false
  }
  if (palabras.some((palabra) => PALABRAS_INVALIDAS_NOMBRE.has(palabra))) {
    return false
  }
  if (palabras.some((palabra) => /\d/u.test(palabra))) {
    return false
  }

  const esNombrePropioPermitido = palabras.some((palabra) =>
    NOMBRES_PROPIOS_PERMITIDOS.has(normalizarTexto(palabra)),
  )
  if (!esNombrePropioPermitido) {
    const ubicacion = resolverUbicacionExactaLocal(nombre)
    if (
      ubicacion.tipo === 'mexicana' ||
      ubicacion.tipo === 'extranjera' ||
      ubicacion.tipo === 'ambigua'
    ) {
      return false
    }
    if (esCategoriaProducto(nombre)) {
      return false
    }
  }

  const producto = buscarProductosLocal(nombre)
  if (producto.tipo === 'confirmado') {
    const tieneSenalDeNombre = palabras.length >= 2
    if (!tieneSenalDeNombre && !esNombrePropioPermitido) {
      return false
    }
  }

  return true
}

export function esSolicitudProductoSuficiente(texto: string): boolean {
  const limpio = texto.trim()
  if (limpio.length < 3 || limpio.length > 200) {
    return false
  }
  const normalizado = quitarPuntuacion(normalizarTexto(ocultarCorreos(limpio)))
  if (normalizado.length === 0) {
    return false
  }

  const palabras = normalizado
    .split(/\s+/)
    .filter((palabra) => palabra.length >= 2 && !PALABRAS_INVALIDAS_NOMBRE.has(palabra))
  if (palabras.length < 2) {
    return false
  }

  const busqueda = buscarProductosLocal(limpio)
  if (busqueda.tipo === 'confirmado') {
    return true
  }
  if (busqueda.tipo === 'ambiguo') {
    return palabras.length >= 2 && esCategoriaProducto(limpio)
  }
  return esCategoriaProducto(limpio) && palabras.length >= 2
}

export function limpiarNombre(texto: string): string | null {
  const valor = texto
    .trim()
    .replace(/^(?:hola|buenas|buenos\s+dias|buenas\s+tardes|buenas\s+noches)[,:\s]+/iu, '')
    .replace(/^(?:mejor|en\s+realidad|corrijo|corregir)\s+/iu, '')
    .replace(/^(?:soy|me\s+llamo|mi\s+nombre\s+es)\s+/iu, '')
    .replace(
      /\s+(?:y|e)\s+(?:necesito|quiero|busco|solicito|requiero|ocupo|deseo|mi|correo|para|en|estoy|vivo|trabajo)\b.*$/iu,
      '',
    )
    .replace(/^(?:vivo|vive|vives|estoy|trabajo|radico)\s+en\s+.*$/iu, '')
    .replace(/\s+(?:vivo|vive|vives|estoy|trabajo|radico)\s+en\s+.*$/iu, '')
    .split(/[,;]/u)[0]
    ?.replace(/[.!?]+$/u, '')
    .replace(/\s+(?:por\s+favor|gracias)\s*$/iu, '')
    .replace(/\s+/g, ' ')
    .trim()

  return valor && valor.length > 0 ? valor : null
}

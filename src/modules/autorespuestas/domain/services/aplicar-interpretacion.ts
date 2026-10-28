import type { Lead } from '../entities/lead.js'
import type { ActualizacionLead } from '../ports/repositorio-lead.js'
import type { ContextoMensajeLead } from '../types/contexto-mensaje-lead.js'
import type {
  AclaracionPendiente,
  ProductoLead,
  UbicacionLead,
} from '../types/datos-lead.js'
import type { EstadoLead } from '../types/estado-lead.js'
import type { PasoLead } from '../types/paso-lead.js'
import {
  esUbicacionExtranjera,
  esUbicacionMexicanaValida,
  formatearProductos,
  normalizarProducto,
} from './extraer-datos-lead.js'
import type { InterpretacionMensaje } from './interpretar-mensaje.js'

export type ResultadoAplicacion = {
  cambios: ActualizacionLead
  claveRespuesta: string
  variables: Record<string, string>
}

export function aplicarInterpretacion(
  contexto: ContextoMensajeLead,
  interpretacion: InterpretacionMensaje,
): ResultadoAplicacion {
  const { lead } = contexto
  const { datos } = interpretacion

  const nombreRechazado = datos.nombreRechazado
    ? true
    : datos.nombre !== null
      ? false
      : lead.nombreRechazado
  const nombre = datos.nombre ?? (nombreRechazado ? null : lead.nombre)
  const correo = datos.correo ?? lead.correo

  const fusion = fusionarProductosLead(lead, datos, interpretacion.operacionProductos)
  const productos = fusion.productos
  const solicitudProductoTexto = fusion.solicitud
  const ubicacion = datos.ubicacion ?? lead.ubicacion
  const ciudad = ubicacion?.nombreMostrado ?? lead.ciudad

  let cantidad = datos.cantidad ?? lead.cantidad
  let cantidadAproximada =
    datos.cantidad !== null ? datos.cantidadAproximada : lead.cantidadAproximada

  if (datos.cantidad === null && datos.productos.length > 0) {
    const todosConCantidad = productos.every((producto) => producto.cantidad !== null)
    if (todosConCantidad) {
      cantidad = productos.reduce(
        (total, producto) => total + (producto.cantidad ?? 0),
        0,
      )
    } else {
      // Al agregar o reemplazar productos sin una cantidad nueva, el total
      // anterior deja de ser valido y debe volver a preguntarse.
      cantidad = null
    }
  }
  if (datos.cantidad === null && interpretacion.operacionProductos === 'reemplazar') {
    cantidadAproximada = null
  }

  const modelos = formatearModelos(productos, solicitudProductoTexto, cantidad)

  const aclaracionPendiente = calcularAclaracionPendiente(
    lead.aclaracionPendiente,
    interpretacion.error,
    datos,
    ubicacion,
  )
  const datosBase = {
    nombre,
    nombreRechazado,
    correo,
    productos,
    solicitudProductoTexto,
    cantidad,
    ubicacion,
  }
  const faltante = primerPasoFaltante(datosBase)
  const estado = calcularEstado(interpretacion.error, aclaracionPendiente, datosBase)
  const pasoActual =
    pasoDeError(interpretacion.error) ?? faltante ?? 'ciudad'
  const claveRespuesta = calcularClaveRespuesta(
    contexto,
    interpretacion,
    estado,
    pasoActual,
    datosBase,
  )

  const variables: Record<string, string> = {
    ...interpretacion.variables,
    nombre: nombre ?? '',
    correo: correo ?? '',
    productos: modelos ?? '',
    cantidad:
      cantidad?.toString() ??
      cantidadAproximada ??
      interpretacion.variables.cantidad ??
      '',
    ciudad: ciudad ?? '',
    pais: ubicacion?.pais ?? '',
  }

  return {
    cambios: {
      nombre,
      nombreRechazado,
      correo,
      modelos,
      cantidad,
      cantidadAproximada,
      ciudad,
      ubicacion,
      productosCatalogo: productos,
      solicitudProductoTexto,
      aclaracionPendiente,
      pasoActual,
      estado,
      completadoEn: estado === 'listo_pipedrive' ? (lead.completadoEn ?? new Date()) : null,
    },
    claveRespuesta,
    variables,
  }
}

export function actualizacionDesdeLead(lead: Lead): ActualizacionLead {
  return {
    nombre: lead.nombre,
    nombreRechazado: lead.nombreRechazado,
    correo: lead.correo,
    modelos: lead.modelos,
    cantidad: lead.cantidad,
    cantidadAproximada: lead.cantidadAproximada,
    ciudad: lead.ciudad,
    ubicacion: lead.ubicacion,
    productosCatalogo: lead.productosCatalogo,
    solicitudProductoTexto: lead.solicitudProductoTexto,
    aclaracionPendiente: lead.aclaracionPendiente,
    pasoActual: lead.pasoActual,
    estado: lead.estado,
    completadoEn: lead.completadoEn,
  }
}

export function datosFaltantesLead(lead: Lead): PasoLead[] {
  return datosFaltantes({
    nombre: lead.nombre,
    nombreRechazado: lead.nombreRechazado,
    correo: lead.correo,
    productos: lead.productosCatalogo,
    solicitudProductoTexto: lead.solicitudProductoTexto,
    cantidad: lead.cantidad,
    ubicacion: lead.ubicacion,
  })
}

export function leadCompleto(lead: Lead): boolean {
  return datosFaltantesLead(lead).length === 0
}

type DatosEvaluables = {
  nombre: string | null
  nombreRechazado: boolean
  correo: string | null
  productos: readonly ProductoLead[]
  solicitudProductoTexto: string | null
  cantidad: number | null
  ubicacion: UbicacionLead | null
}

function primerPasoFaltante(datos: DatosEvaluables): PasoLead | null {
  const faltantes = datosFaltantes(datos)
  return faltantes[0] ?? null
}

function datosFaltantes(datos: DatosEvaluables): PasoLead[] {
  const faltantes: PasoLead[] = []
  if (!datos.nombreRechazado && (datos.nombre === null || datos.nombre.trim().length === 0)) {
    faltantes.push('nombre')
  }
  if (datos.correo === null || datos.correo.trim().length === 0) {
    faltantes.push('correo')
  }
  if (datos.productos.length === 0 && datos.solicitudProductoTexto === null) {
    faltantes.push('modelos')
  }
  if (datos.cantidad === null) {
    faltantes.push('cantidad')
  }
  if (!esUbicacionMexicanaValida(datos.ubicacion)) {
    faltantes.push('ciudad')
  }
  return faltantes
}

function calcularEstado(
  error: string | null,
  aclaracionPendiente: AclaracionPendiente | null,
  datos: DatosEvaluables,
): EstadoLead {
  if (error === null && esUbicacionExtranjera(datos.ubicacion)) {
    return 'fuera_de_cobertura'
  }
  if (
    error === null &&
    aclaracionPendiente === null &&
    datosFaltantes(datos).length === 0
  ) {
    return 'listo_pipedrive'
  }
  return 'capturando'
}

function calcularAclaracionPendiente(
  anterior: AclaracionPendiente | null,
  error: string | null,
  datos: InterpretacionMensaje['datos'],
  ubicacion: UbicacionLead | null,
): AclaracionPendiente | null {
  if (error !== null) {
    const porError = aclaracionDeError(error)
    return porError ?? anterior
  }

  let pendiente = anterior
  if (pendiente === 'producto' && (datos.productos.length > 0 || datos.solicitudProductoTexto !== null)) {
    pendiente = null
  }
  if (pendiente === 'cantidad' && datos.cantidad !== null) {
    pendiente = null
  }
  if (pendiente === 'ubicacion' && datos.ubicacion !== null) {
    pendiente = esUbicacionMexicanaValida(ubicacion) || esUbicacionExtranjera(ubicacion)
      ? null
      : pendiente
  }
  return pendiente
}

function aclaracionDeError(error: string): AclaracionPendiente | null {
  if (error.startsWith('producto_')) {
    return 'producto'
  }
  if (error.startsWith('cantidad_')) {
    return 'cantidad'
  }
  if (error.startsWith('ubicacion_')) {
    return 'ubicacion'
  }
  return null
}

function pasoDeError(error: string | null): PasoLead | null {
  if (error === null) {
    return null
  }
  if (error.startsWith('nombre_')) {
    return 'nombre'
  }
  if (error.startsWith('correo_')) {
    return 'correo'
  }
  if (error.startsWith('producto_')) {
    return 'modelos'
  }
  if (error.startsWith('cantidad_')) {
    return 'cantidad'
  }
  if (error.startsWith('ubicacion_')) {
    return 'ciudad'
  }
  return null
}

function calcularClaveRespuesta(
  contexto: ContextoMensajeLead,
  interpretacion: InterpretacionMensaje,
  estado: EstadoLead,
  pasoActual: PasoLead,
  datos: DatosEvaluables,
): string {
  if (interpretacion.error !== null) {
    return interpretacion.error
  }
  if (estado === 'fuera_de_cobertura') {
    return 'fuera_de_cobertura'
  }
  if (estado === 'listo_pipedrive') {
    return 'confirmacion'
  }
  if (contexto.esPrimerMensaje && sinDatos(datos)) {
    return 'bienvenida'
  }
  if (
    interpretacion.operacionProductos === 'agregar' &&
    interpretacion.datos.productos.length > 0 &&
    pasoActual === 'cantidad'
  ) {
    return interpretacion.datos.productos.length > 1
      ? 'productos_agregados'
      : 'producto_agregado'
  }
  return `pedir_${pasoActual}`
}

function sinDatos(datos: DatosEvaluables): boolean {
  return (
    datos.nombre === null &&
    !datos.nombreRechazado &&
    datos.correo === null &&
    datos.productos.length === 0 &&
    datos.solicitudProductoTexto === null &&
    datos.cantidad === null &&
    datos.ubicacion === null
  )
}

function fusionarProductosLead(
  lead: Lead,
  datos: InterpretacionMensaje['datos'],
  operacion: InterpretacionMensaje['operacionProductos'],
): { productos: ProductoLead[]; solicitud: string | null } {
  let productos = [...lead.productosCatalogo]
  let solicitud = lead.solicitudProductoTexto

  if (datos.productos.length > 0) {
    if (operacion === 'reemplazar') {
      productos = []
      solicitud = null
    }
    productos = fusionarProductos(productos, datos.productos)
  }

  if (datos.solicitudProductoTexto !== null) {
    if (operacion === 'reemplazar' && datos.productos.length === 0) {
      productos = []
    }
    solicitud = datos.solicitudProductoTexto
  }

  return { productos, solicitud }
}

function fusionarProductos(
  existentes: readonly ProductoLead[],
  nuevos: readonly ProductoLead[],
): ProductoLead[] {
  const resultado = [...existentes]
  for (const nuevo of nuevos) {
    const indice = resultado.findIndex(
      (producto) =>
        (producto.url !== null && producto.url === nuevo.url) ||
        normalizarProducto(producto.nombre) === normalizarProducto(nuevo.nombre),
    )
    if (indice >= 0) {
      resultado[indice] = nuevo
    } else {
      resultado.push(nuevo)
    }
  }
  return resultado
}

function formatearModelos(
  productos: readonly ProductoLead[],
  solicitud: string | null,
  cantidad: number | null,
): string | null {
  const partes: string[] = []
  if (productos.length > 0) {
    const texto = formatearProductos(
      productos,
      productos.every((producto) => producto.cantidad !== null),
    )
    if (texto) {
      partes.push(texto)
    }
  }
  if (solicitud) {
    partes.push(
      productos.length === 0 && cantidad !== null
        ? `${solicitud} (${cantidad})`
        : solicitud,
    )
  }
  return partes.length > 0 ? partes.join('; ') : null
}

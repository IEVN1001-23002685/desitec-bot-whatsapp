import type { PasoLead } from '../types/paso-lead.js'
import type { ContextoMensajeLead } from '../types/contexto-mensaje-lead.js'
import type { InterpretacionMensaje } from './interpretar-mensaje.js'
import type { ActualizacionLead } from '../ports/repositorio-lead.js'
import { formatearProductos, normalizarProducto } from './extraer-datos-lead.js'

export type ResultadoAplicacion = {
  cambios: ActualizacionLead
  claveRespuesta: string
}

const ORDEN_PASOS: readonly PasoLead[] = ['nombre', 'correo', 'modelos', 'cantidad', 'ciudad']

export function aplicarInterpretacion(
  contexto: ContextoMensajeLead,
  interpretacion: InterpretacionMensaje,
): ResultadoAplicacion {
  const { lead } = contexto
  const { datos } = interpretacion
  const nombre = datos.nombre ?? lead.nombre
  const correo = datos.correo ?? lead.correo
  const ciudad = datos.ciudad ?? lead.ciudad

  let modelos = lead.modelos
  let cantidad = datos.cantidad ?? lead.cantidad

  if (interpretacion.operacionProductos === 'agregar' && datos.productos.length > 0) {
    modelos = agregarProductos(
      modelos,
      datos.productos.map((producto) => producto.nombre),
    )
    cantidad = null
  } else if (interpretacion.operacionProductos === 'reemplazar' && datos.productos.length > 0) {
    const incluirCantidades = datos.productos.every((producto) => producto.cantidad !== null)
    modelos = formatearProductos(datos.productos, incluirCantidades)

    if (incluirCantidades) {
      cantidad = sumarCantidades(datos.productos)
    } else if (datos.productos.length > 1) {
      cantidad = null
    }
  } else if (datos.productos.length > 0) {
    const incluirCantidades = datos.productos.every((producto) => producto.cantidad !== null)
    modelos = formatearProductos(datos.productos, incluirCantidades)
    cantidad = incluirCantidades ? sumarCantidades(datos.productos) : null
  }

  if (datos.cantidad !== null) {
    cantidad = datos.cantidad
  }

  const faltante = primerPasoFaltante({ nombre, correo, modelos, cantidad, ciudad })
  const completo = faltante === null && interpretacion.error === null
  const claveRespuesta =
    interpretacion.error ??
    (interpretacion.operacionProductos === 'agregar'
      ? 'producto_agregado'
      : completo
        ? 'confirmacion'
        : contexto.esPrimerMensaje && faltante === 'nombre'
          ? 'bienvenida'
          : `pedir_${faltante}`)

  return {
    cambios: {
      nombre,
      correo,
      modelos,
      cantidad,
      ciudad,
      pasoActual: interpretacion.error ? lead.pasoActual : (faltante ?? 'ciudad'),
      estado: completo ? 'listo_pipedrive' : 'capturando',
      completadoEn: completo ? new Date() : lead.completadoEn,
    },
    claveRespuesta,
  }
}

function primerPasoFaltante(datos: {
  nombre: string | null
  correo: string | null
  modelos: string | null
  cantidad: number | null
  ciudad: string | null
}): PasoLead | null {
  for (const paso of ORDEN_PASOS) {
    const valor = datos[paso]
    if (valor === null || (typeof valor === 'string' && valor.trim().length === 0)) {
      return paso
    }
  }
  return null
}

function sumarCantidades(productos: readonly { cantidad: number | null }[]): number {
  return productos.reduce((total, producto) => total + (producto.cantidad ?? 0), 0)
}

function agregarProductos(existentes: string | null, nuevos: readonly string[]): string {
  const productos = (existentes ?? '')
    .split(';')
    .map((producto) => producto.trim())
    .filter((producto) => producto.length > 0)

  for (const nuevo of nuevos) {
    if (!productos.some((producto) => normalizarProducto(producto) === normalizarProducto(nuevo))) {
      productos.push(nuevo)
    }
  }

  return productos.join('; ')
}

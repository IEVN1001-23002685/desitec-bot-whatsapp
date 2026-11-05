import { eq } from 'drizzle-orm'
import { leads } from '../../../../shared/db/schema/index.js'
import type { BaseDeDatos, Transaccion } from '../../../../shared/db/tipos.js'
import type { Lead } from '../../domain/entities/lead.js'
import type {
  ActualizacionLead,
  EntradaCrearLead,
  RepositorioLead,
} from '../../domain/ports/repositorio-lead.js'
import type {
  AclaracionPendiente,
  ContextoProductoLead,
  ProductoLead,
  SugerenciaProductoLead,
  TipoUbicacionLead,
  UbicacionLead,
} from '../../domain/types/datos-lead.js'
import { contextoProductoVacio } from '../../domain/types/datos-lead.js'

type FilaLead = typeof leads.$inferSelect

const TIPOS_UBICACION: readonly TipoUbicacionLead[] = [
  'localidad',
  'municipio',
  'entidad',
  'extranjera',
]

const ACLARACIONES: readonly AclaracionPendiente[] = ['producto', 'ubicacion', 'cantidad']

export class RepositorioDrizzleLead implements RepositorioLead {
  constructor(private readonly baseDeDatos: Transaccion | BaseDeDatos) {}

  async buscarPorConversacion(idConversacion: string): Promise<Lead | null> {
    const filas = await this.baseDeDatos
      .select()
      .from(leads)
      .where(eq(leads.idConversacion, idConversacion))
      .limit(1)
    return filas[0] ? mapearLead(filas[0]) : null
  }

  async crear(entrada: EntradaCrearLead): Promise<Lead> {
    const filas = await this.baseDeDatos
      .insert(leads)
      .values({ idConversacion: entrada.idConversacion })
      .returning()
    const fila = filas[0]
    if (!fila) {
      throw new Error('No se pudo crear el lead')
    }
    return mapearLead(fila)
  }

  async actualizar(id: string, cambios: ActualizacionLead): Promise<void> {
    const ubicacion = cambios.ubicacion
    await this.baseDeDatos
      .update(leads)
      .set({
        nombre: cambios.nombre,
        nombreRechazado: cambios.nombreRechazado,
        correo: cambios.correo,
        modelos: cambios.modelos,
        cantidad: cambios.cantidad,
        cantidadAproximada: cambios.cantidadAproximada,
        ciudad: cambios.ciudad,
        ubicacionTipo: ubicacion?.tipo ?? null,
        ubicacionNombre: ubicacion?.nombreMostrado ?? null,
        ubicacionPais: ubicacion?.pais ?? null,
        ubicacionEntidad: ubicacion?.entidad ?? null,
        ubicacionMunicipio: ubicacion?.municipio ?? null,
        ubicacionLocalidad: ubicacion?.localidad ?? null,
        ubicacionCvegeo: ubicacion?.cvegeo ?? null,
        ubicacionCompleta: ubicacion?.completa ?? false,
        productosCatalogo: cambios.productosCatalogo.map((producto) => ({
          nombre: producto.nombre,
          url: producto.url,
          cantidad: producto.cantidad,
        })),
        solicitudProductoTexto: cambios.solicitudProductoTexto,
        contextoProducto: {
          ...cambios.contextoProducto,
          sugerencias: [...cambios.contextoProducto.sugerencias],
          rechazados: [...cambios.contextoProducto.rechazados],
        },
        aclaracionPendiente: cambios.aclaracionPendiente,
        pasoActual: cambios.pasoActual,
        estado: cambios.estado,
        completadoEn: cambios.completadoEn,
        actualizadoEn: new Date(),
      })
      .where(eq(leads.id, id))
  }
}

function mapearLead(fila: FilaLead): Lead {
  return {
    id: fila.id,
    idConversacion: fila.idConversacion,
    nombre: fila.nombre ?? null,
    nombreRechazado: fila.nombreRechazado,
    correo: fila.correo ?? null,
    modelos: fila.modelos ?? null,
    cantidad: fila.cantidad ?? null,
    cantidadAproximada: fila.cantidadAproximada ?? null,
    ciudad: fila.ciudad ?? null,
    ubicacion: mapearUbicacion(fila),
    productosCatalogo: mapearProductos(fila.productosCatalogo),
    solicitudProductoTexto: fila.solicitudProductoTexto ?? null,
    contextoProducto: mapearContextoProducto(fila.contextoProducto),
    aclaracionPendiente: mapearAclaracion(fila.aclaracionPendiente),
    pasoActual: fila.pasoActual,
    estado: fila.estado,
    completadoEn: fila.completadoEn ?? null,
  }
}

function mapearUbicacion(fila: FilaLead): UbicacionLead | null {
  if (
    fila.ubicacionTipo === null ||
    !TIPOS_UBICACION.includes(fila.ubicacionTipo as TipoUbicacionLead) ||
    fila.ubicacionNombre === null ||
    fila.ubicacionPais === null
  ) {
    return null
  }
  return {
    tipo: fila.ubicacionTipo as TipoUbicacionLead,
    nombreMostrado: fila.ubicacionNombre,
    pais: fila.ubicacionPais,
    entidad: fila.ubicacionEntidad ?? null,
    municipio: fila.ubicacionMunicipio ?? null,
    localidad: fila.ubicacionLocalidad ?? null,
    cvegeo: fila.ubicacionCvegeo ?? null,
    completa: fila.ubicacionCompleta,
  }
}

function mapearProductos(valor: readonly ProductoLead[] | null): ProductoLead[] {
  if (!Array.isArray(valor)) {
    return []
  }
  const productos: ProductoLead[] = []
  for (const producto of valor) {
    if (
      typeof producto !== 'object' ||
      producto === null ||
      typeof producto.nombre !== 'string' ||
      producto.nombre.trim().length === 0
    ) {
      continue
    }
    productos.push({
      nombre: producto.nombre,
      url: typeof producto.url === 'string' ? producto.url : null,
      cantidad:
        typeof producto.cantidad === 'number' &&
        Number.isInteger(producto.cantidad) &&
        producto.cantidad > 0
          ? producto.cantidad
          : null,
    })
  }
  return productos
}

function mapearAclaracion(valor: string | null): AclaracionPendiente | null {
  return valor !== null && ACLARACIONES.includes(valor as AclaracionPendiente)
    ? (valor as AclaracionPendiente)
    : null
}

function mapearContextoProducto(valor: unknown): ContextoProductoLead {
  const vacio = contextoProductoVacio()
  if (typeof valor !== 'object' || valor === null) {
    return vacio
  }
  const registro = valor as Record<string, unknown>
  const sugerencias = Array.isArray(registro.sugerencias)
    ? registro.sugerencias
        .map((item) => mapearSugerencia(item))
        .filter((item): item is SugerenciaProductoLead => item !== null)
    : []
  return {
    ultimaConsulta: typeof registro.ultimaConsulta === 'string' ? registro.ultimaConsulta : null,
    sugerencias,
    rechazados: Array.isArray(registro.rechazados)
      ? registro.rechazados.filter((item): item is string => typeof item === 'string')
      : [],
    ultimaMarca: typeof registro.ultimaMarca === 'string' ? registro.ultimaMarca : null,
    consultasOrientacion: enteroNoNegativo(registro.consultasOrientacion),
    fallosProducto: enteroNoNegativo(registro.fallosProducto),
  }
}

function mapearSugerencia(valor: unknown): SugerenciaProductoLead | null {
  if (typeof valor !== 'object' || valor === null) {
    return null
  }
  const registro = valor as Record<string, unknown>
  if (
    typeof registro.id !== 'string' ||
    typeof registro.nombre !== 'string' ||
    registro.nombre.trim().length === 0
  ) {
    return null
  }
  return {
    id: registro.id,
    nombre: registro.nombre,
    url: typeof registro.url === 'string' ? registro.url : null,
    marca: typeof registro.marca === 'string' ? registro.marca : null,
    puntuacion:
      typeof registro.puntuacion === 'number' && Number.isFinite(registro.puntuacion)
        ? registro.puntuacion
        : 0,
  }
}

function enteroNoNegativo(valor: unknown): number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0 ? valor : 0
}

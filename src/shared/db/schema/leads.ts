import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { conversaciones } from './conversaciones.js'
import { enumeracionEstadoLead, enumeracionPasoLead } from './enumeraciones.js'

type ProductoCatalogoJson = {
  nombre: string
  url: string | null
  cantidad: number | null
}

type SugerenciaProductoJson = {
  id: string
  nombre: string
  url: string | null
  marca: string | null
  puntuacion: number
}

type ContextoProductoJson = {
  ultimaConsulta: string | null
  sugerencias: SugerenciaProductoJson[]
  rechazados: string[]
  ultimaMarca: string | null
  consultasOrientacion: number
  fallosProducto: number
}

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    idConversacion: uuid('id_conversacion')
      .notNull()
      .unique()
      .references(() => conversaciones.id, { onDelete: 'cascade' }),
    nombre: text('nombre'),
    nombreRechazado: boolean('nombre_rechazado').notNull().default(false),
    correo: text('correo'),
    modelos: text('modelos'),
    cantidad: integer('cantidad'),
    cantidadAproximada: text('cantidad_aproximada'),
    ciudad: text('ciudad'),
    ubicacionTipo: text('ubicacion_tipo'),
    ubicacionNombre: text('ubicacion_nombre'),
    ubicacionPais: text('ubicacion_pais'),
    ubicacionEntidad: text('ubicacion_entidad'),
    ubicacionMunicipio: text('ubicacion_municipio'),
    ubicacionLocalidad: text('ubicacion_localidad'),
    ubicacionCvegeo: text('ubicacion_cvegeo'),
    ubicacionCompleta: boolean('ubicacion_completa').notNull().default(false),
    productosCatalogo: jsonb('productos_catalogo')
      .$type<ProductoCatalogoJson[]>()
      .notNull()
      .default([]),
    solicitudProductoTexto: text('solicitud_producto_texto'),
    contextoProducto: jsonb('contexto_producto').$type<ContextoProductoJson>(),
    aclaracionPendiente: text('aclaracion_pendiente'),
    pasoActual: enumeracionPasoLead('paso_actual').notNull().default('nombre'),
    estado: enumeracionEstadoLead('estado').notNull().default('capturando'),
    completadoEn: timestamp('completado_en', { withTimezone: true }),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (tabla) => [
    index('leads_estado_idx').on(tabla.estado),
    index('leads_ubicacion_entidad_idx').on(tabla.ubicacionEntidad),
    index('leads_ubicacion_municipio_idx').on(tabla.ubicacionMunicipio),
  ],
)

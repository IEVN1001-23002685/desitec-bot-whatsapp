import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { conversaciones } from './conversaciones.js'
import { enumeracionEstadoLead, enumeracionPasoLead } from './enumeraciones.js'

export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    idConversacion: uuid('id_conversacion')
      .notNull()
      .unique()
      .references(() => conversaciones.id, { onDelete: 'cascade' }),
    nombre: text('nombre'),
    correo: text('correo'),
    modelos: text('modelos'),
    cantidad: integer('cantidad'),
    ciudad: text('ciudad'),
    pasoActual: enumeracionPasoLead('paso_actual').notNull().default('nombre'),
    estado: enumeracionEstadoLead('estado').notNull().default('capturando'),
    completadoEn: timestamp('completado_en', { withTimezone: true }),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (tabla) => [index('leads_estado_idx').on(tabla.estado)],
)

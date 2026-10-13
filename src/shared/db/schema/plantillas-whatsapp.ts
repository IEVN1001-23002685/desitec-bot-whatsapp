import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const plantillasWhatsApp = pgTable(
  'plantillas_whatsapp',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codigo: text('codigo').notNull().unique(),
    nombreMeta: text('nombre_meta').notNull(),
    idioma: text('idioma').notNull().default('es'),
    categoria: text('categoria'),
    componentes: jsonb('componentes').notNull().default({}),
    activa: boolean('activa').notNull().default(true),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (tabla) => [index('plantillas_whatsapp_activas_idx').on(tabla.activa)],
)

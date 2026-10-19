import { boolean, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const guionFlujoLead = pgTable('guion_flujo_lead', {
  id: uuid('id').primaryKey().defaultRandom(),
  clave: text('clave').notNull().unique(),
  orden: integer('orden').notNull(),
  texto: text('texto').notNull(),
  activo: boolean('activo').notNull().default(true),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
})

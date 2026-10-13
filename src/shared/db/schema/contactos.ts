import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const contactos = pgTable('contactos', {
  id: uuid('id').primaryKey().defaultRandom(),
  idWa: text('id_wa').notNull().unique(),
  nombrePerfil: text('nombre_perfil'),
  creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
})
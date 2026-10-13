import { index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { contactos } from './contactos.js'
import { enumeracionEstadoConversacion } from './enumeraciones.js'
import { cuentasWhatsApp } from './cuentas-whatsapp.js'

export const conversaciones = pgTable(
  'conversaciones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    idCuentaWhatsApp: uuid('id_cuenta_whatsapp')
      .notNull()
      .references(() => cuentasWhatsApp.id, { onDelete: 'restrict' }),
    idContacto: uuid('id_contacto')
      .notNull()
      .references(() => contactos.id, { onDelete: 'restrict' }),
    estado: enumeracionEstadoConversacion('estado').notNull().default('abierta'),
    ultimoMensajeEn: timestamp('ultimo_mensaje_en', { withTimezone: true }),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (tabla) => [
    uniqueIndex('conversaciones_cuenta_contacto_uk').on(tabla.idCuentaWhatsApp, tabla.idContacto),
    index('conversaciones_contacto_idx').on(tabla.idContacto),
  ],
)
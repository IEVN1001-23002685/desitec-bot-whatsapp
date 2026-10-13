import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { cuentasWhatsApp } from './cuentas-whatsapp.js'
import { plantillasWhatsApp } from './plantillas-whatsapp.js'

export const reglasSeguimiento = pgTable(
  'reglas_seguimiento',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codigo: text('codigo').notNull().unique(),
    nombre: text('nombre').notNull(),
    idCuentaWhatsApp: uuid('id_cuenta_whatsapp')
      .notNull()
      .references(() => cuentasWhatsApp.id, { onDelete: 'restrict' }),
    demoraHoras: integer('demora_horas').notNull(),
    idPlantilla: uuid('id_plantilla').references(() => plantillasWhatsApp.id, {
      onDelete: 'set null',
    }),
    cuerpo: text('cuerpo'),
    activa: boolean('activa').notNull().default(true),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (tabla) => [
    index('reglas_seguimiento_cuenta_idx').on(tabla.idCuentaWhatsApp),
    index('reglas_seguimiento_activas_idx').on(tabla.activa),
  ],
)

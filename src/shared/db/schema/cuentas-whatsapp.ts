import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { enumeracionProveedorMensajeria } from './enumeraciones.js'

export const cuentasWhatsApp = pgTable(
  'cuentas_whatsapp',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codigo: text('codigo').notNull().unique(),
    nombreComercial: text('nombre_comercial').notNull(),
    idNumeroTelefono: text('id_numero_telefono').notNull().unique(),
    telefonoVisible: text('telefono_visible').notNull(),
    tokenAcceso: text('token_acceso'),
    proveedor: enumeracionProveedorMensajeria('proveedor').notNull().default('meta'),
    credencialRef: text('credencial_ref'),
    webhookSecretRef: text('webhook_secret_ref'),
    estaActiva: boolean('esta_activa').notNull().default(true),
    creadoEn: timestamp('creado_en', { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true }).notNull().defaultNow(),
  },
  (tabla) => [index('cuentas_whatsapp_activas_idx').on(tabla.estaActiva)],
)

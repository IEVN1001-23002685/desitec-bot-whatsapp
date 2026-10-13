import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { esperarBaseDeDatos } from '../../src/shared/db/esperar-bd.js'
import { cuentasWhatsApp } from '../../src/shared/db/schema/index.js'
import { cuentasPrueba } from '../helpers/en-memoria.js'
import type { BaseDeDatos } from '../../src/shared/db/tipos.js'

export const CADENA_PRUEBA =
  process.env.TEST_DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5432/desitec_bot_test'

export function nombreBaseDeDatosPrueba(): string {
  return new URL(CADENA_PRUEBA).pathname.replace(/^\//, '')
}

function cadenaAdministracion(): string {
  const url = new URL(CADENA_PRUEBA)
  url.pathname = '/postgres'
  return url.toString()
}

export function crearPoolPrueba(): Pool {
  return new Pool({ connectionString: CADENA_PRUEBA })
}

export async function crearBaseDeDatosDePrueba(): Promise<void> {
  const pool = new Pool({ connectionString: cadenaAdministracion(), max: 1 })
  try {
    await esperarBaseDeDatos(pool)
    const encontrada = await pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      nombreBaseDeDatosPrueba(),
    ])
    if (encontrada.rowCount === 0) {
      const nombre = nombreBaseDeDatosPrueba().replaceAll('"', '""')
      await pool.query(`CREATE DATABASE "${nombre}"`)
    }
  } finally {
    await pool.end()
  }

  const base = crearPoolPrueba()
  try {
    await esperarBaseDeDatos(base)
    await migrate(drizzle(base), { migrationsFolder: './drizzle' })
  } finally {
    await base.end()
  }
}

export async function truncarTablas(pool: Pool): Promise<void> {
  await pool.query(
    'TRUNCATE TABLE eventos_webhook, mensajes, conversaciones, contactos, cuentas_whatsapp RESTART IDENTITY CASCADE',
  )
}

export async function sembrarCuentas(baseDeDatos: BaseDeDatos): Promise<void> {
  for (const cuenta of cuentasPrueba()) {
    await baseDeDatos.insert(cuentasWhatsApp).values({
      codigo: cuenta.codigo,
      nombreComercial: cuenta.nombreComercial,
      idNumeroTelefono: cuenta.idNumeroTelefono,
      telefonoVisible: cuenta.telefonoVisible,
      estaActiva: cuenta.estaActiva,
    })
  }
}
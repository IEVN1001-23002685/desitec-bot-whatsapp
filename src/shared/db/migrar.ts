import 'dotenv/config'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { esperarBaseDeDatos } from './esperar-bd.js'

async function migrar(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('Falta la variable de entorno DATABASE_URL')
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10_000,
  })

  try {
    await esperarBaseDeDatos(pool)
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' })
    console.info('Migraciones aplicadas correctamente')
  } catch (error) {
    console.error('Error al aplicar migraciones:', (error as Error).cause ?? error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

migrar().catch((error) => {
  console.error('Error al aplicar migraciones', error)
  process.exit(1)
})

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as esquema from './schema/index.js'
import type { BaseDeDatos } from './tipos.js'

export type ConexionBaseDeDatos = {
  baseDeDatos: BaseDeDatos
  pool: Pool
  cerrar: () => Promise<void>
}

export function crearBaseDeDatos(cadenaConexion: string): ConexionBaseDeDatos {
  const pool = new Pool({ connectionString: cadenaConexion })
  const baseDeDatos = drizzle(pool, { schema: esquema })

  return {
    baseDeDatos,
    pool,
    cerrar: async () => {
      await pool.end()
    },
  }
}
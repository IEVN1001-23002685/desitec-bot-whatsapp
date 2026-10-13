import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as esquema from './schema/index.js'

export type BaseDeDatos = NodePgDatabase<typeof esquema>
export type Transaccion = Parameters<Parameters<BaseDeDatos['transaction']>[0]>[0]

import type { Pool } from 'pg'

export async function esperarBaseDeDatos(pool: Pool, intentos = 15): Promise<void> {
  for (let intento = 1; intento <= intentos; intento += 1) {
    try {
      const cliente = await pool.connect()
      try {
        await cliente.query('SELECT 1')
      } finally {
        cliente.release()
      }
      return
    } catch (error) {
      if (intento === intentos) {
        throw error
      }
      const espera = Math.min(500 * 2 ** (intento - 1), 5000)
      console.warn(
        `Base de datos no disponible (intento ${intento}/${intentos}); reintento en ${espera} ms`,
      )
      await new Promise((resolver) => setTimeout(resolver, espera))
    }
  }
}

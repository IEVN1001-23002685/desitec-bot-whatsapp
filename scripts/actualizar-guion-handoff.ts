import 'dotenv/config'
import { and, eq } from 'drizzle-orm'
import { crearBaseDeDatos } from '../src/shared/db/cliente-bd.js'
import { esperarBaseDeDatos } from '../src/shared/db/esperar-bd.js'
import {
  TEXTO_PASO_A_ASESOR,
  TEXTO_PASO_A_ASESOR_ANTERIOR,
} from '../src/shared/db/guion-flujo-lead-inicial.js'
import { guionFlujoLead } from '../src/shared/db/schema/index.js'

async function actualizarGuionHandoff(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('Falta la variable de entorno DATABASE_URL')
  }

  const { baseDeDatos, pool, cerrar } = crearBaseDeDatos(connectionString)

  try {
    await esperarBaseDeDatos(pool)
    const actualizadas = await baseDeDatos
      .update(guionFlujoLead)
      .set({ texto: TEXTO_PASO_A_ASESOR, actualizadoEn: new Date() })
      .where(
        and(
          eq(guionFlujoLead.clave, 'paso_a_asesor'),
          eq(guionFlujoLead.texto, TEXTO_PASO_A_ASESOR_ANTERIOR),
        ),
      )
      .returning({ id: guionFlujoLead.id })

    if (actualizadas.length === 0) {
      console.info('No se actualizó paso_a_asesor: no conserva el texto anterior')
    } else {
      console.info('Se actualizó el texto de paso_a_asesor')
    }
  } finally {
    await cerrar()
  }
}

actualizarGuionHandoff().catch((error) => {
  console.error('Error al actualizar el guion de handoff', error)
  process.exitCode = 1
})

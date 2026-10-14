import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { ErrorDeValidacion, ErrorNoAutorizado } from '../../../../shared/errors/error-de-app.js'
import type { ProgramarSeguimientos } from '../../application/use-cases/programar-seguimientos.js'

const esquemaProgramar = z.object({
  idConversacion: z.string().uuid(),
})

export type OpcionesRutasSeguimientos = {
  programarSeguimientos: ProgramarSeguimientos
  claveInterna: string
}

export function rutasSeguimientos(opciones: OpcionesRutasSeguimientos): FastifyPluginAsync {
  return async (aplicacion) => {
    aplicacion.post('/api/seguimientos', async (solicitud, respuesta) => {
      const cabecera = solicitud.headers['x-api-key-interna']
      const clave = typeof cabecera === 'string' ? cabecera : undefined
      if (!claveValida(clave, opciones.claveInterna)) {
        throw new ErrorNoAutorizado()
      }

      const parseado = esquemaProgramar.safeParse(solicitud.body)
      if (!parseado.success) {
        throw new ErrorDeValidacion('Cuerpo de seguimiento malformado')
      }

      const resultado = await opciones.programarSeguimientos.ejecutar(parseado.data)

      return respuesta.status(201).send({
        programados: resultado.programados,
      })
    })
  }
}

function claveValida(recibida: string | undefined, esperada: string): boolean {
  if (!recibida) {
    return false
  }
  const a = Buffer.from(recibida)
  const b = Buffer.from(esperada)
  if (a.length !== b.length) {
    return false
  }
  return timingSafeEqual(a, b)
}

import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { ErrorDeAplicacion } from '../errors/error-de-app.js'

export function registrarManejadorErrores(aplicacion: FastifyInstance): void {
  aplicacion.setErrorHandler((error, solicitud, respuesta) => {
    if (error instanceof ZodError) {
      solicitud.log.warn(
        { cantidadProblemas: error.issues.length },
        'validación de solicitud fallida',
      )
      return respuesta.status(400).send({ error: 'VALIDATION_ERROR' })
    }

    if (error instanceof ErrorDeAplicacion) {
      if (error.codigoEstado >= 500) {
        solicitud.log.error({ codigo: error.codigo }, 'error de aplicación')
      } else {
        solicitud.log.warn({ codigo: error.codigo }, 'solicitud rechazada')
      }
      return respuesta.status(error.codigoEstado).send({ error: error.codigo })
    }

    solicitud.log.error({ err: error }, 'error no controlado')
    return respuesta.status(500).send({ error: 'INTERNAL_ERROR' })
  })

  aplicacion.setNotFoundHandler((solicitud, respuesta) => {
    return respuesta.status(404).send({ error: 'NOT_FOUND' })
  })
}
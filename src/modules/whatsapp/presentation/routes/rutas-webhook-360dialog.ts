import type { FastifyPluginAsync } from 'fastify'
import type { RecibirEvento360Dialog } from '../../application/use-cases/recibir-evento-360dialog.js'

export type OpcionesRutasWebhook360Dialog = {
  recibirEvento: RecibirEvento360Dialog
  ruta?: string
}

export function rutasWebhook360Dialog(opciones: OpcionesRutasWebhook360Dialog): FastifyPluginAsync {
  return async (aplicacion) => {
    aplicacion.post(opciones.ruta ?? '/webhooks/360dialog', async (solicitud, respuesta) => {
      const token = solicitud.headers['x-webhook-token']

      await opciones.recibirEvento.ejecutar({
        cuerpoCrudo: solicitud.cuerpoCrudo,
        cargaUtil: solicitud.body,
        tokenCabecera: typeof token === 'string' ? token : undefined,
      })

      return respuesta.status(200).send({ recibido: true })
    })
  }
}

import type { FastifyPluginAsync } from 'fastify'
import { ErrorDeFirma, ErrorDeValidacion } from '../../../../shared/errors/error-de-app.js'
import { verificarFirma } from '../../../../shared/security/firma.js'
import { esquemaPayloadWebhookMeta } from '../../domain/types/payload-webhook.js'
import type { RecibirEventoWhatsApp } from '../../application/use-cases/recibir-evento-whatsapp.js'
import type { VerificarWebhookWhatsApp } from '../../application/use-cases/verificar-webhook-whatsapp.js'

export type OpcionesRutasWebhookWhatsApp = {
  verificarWebhook: VerificarWebhookWhatsApp
  recibirEvento: RecibirEventoWhatsApp
  secretoApp: string
}

export function rutasWebhookWhatsApp(opciones: OpcionesRutasWebhookWhatsApp): FastifyPluginAsync {
  return async (aplicacion) => {
    aplicacion.get('/webhooks/whatsapp', async (solicitud, respuesta) => {
      const consulta = solicitud.query as Record<string, unknown>
      const desafio = opciones.verificarWebhook.ejecutar({
        modo: comoCadena(consulta['hub.mode']),
        token: comoCadena(consulta['hub.verify_token']),
        desafio: comoCadena(consulta['hub.challenge']),
      })
      return respuesta.type('text/plain; charset=utf-8').send(desafio)
    })

    aplicacion.post('/webhooks/whatsapp', async (solicitud, respuesta) => {
      const firma = solicitud.headers['x-hub-signature-256']
      const firmaCabecera = typeof firma === 'string' ? firma : undefined

      if (!verificarFirma(solicitud.cuerpoCrudo, firmaCabecera, opciones.secretoApp)) {
        throw new ErrorDeFirma()
      }

      const parseado = esquemaPayloadWebhookMeta.safeParse(solicitud.body)
      if (!parseado.success) {
        throw new ErrorDeValidacion('Carga útil de webhook de WhatsApp malformada')
      }

      await opciones.recibirEvento.ejecutar({
        cuerpoCrudo: solicitud.cuerpoCrudo,
        payload: parseado.data,
      })

      return respuesta.status(200).send({ recibido: true })
    })
  }
}

function comoCadena(valor: unknown): string | undefined {
  return typeof valor === 'string' ? valor : undefined
}

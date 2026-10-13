import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { ErrorDeValidacion, ErrorNoAutorizado } from '../../../../shared/errors/error-de-app.js'
import { esIdWaValido } from '../../../../shared/security/validadores.js'
import type { EnviarMensajeSaliente } from '../../application/use-cases/enviar-mensaje-saliente.js'

const esquemaCuerpoMensaje = z.object({
  codigoCuenta: z.string().min(1),
  idWa: z.string().refine((valor) => esIdWaValido(valor), 'idWa inválido'),
  cuerpo: z.string().min(1).max(4096),
})

export type OpcionesRutasMensajes = {
  enviarMensaje: EnviarMensajeSaliente
  claveInterna: string
}

export function rutasMensajes(opciones: OpcionesRutasMensajes): FastifyPluginAsync {
  return async (aplicacion) => {
    aplicacion.post('/api/mensajes', async (solicitud, respuesta) => {
      const cabecera = solicitud.headers['x-api-key-interna']
      const clave = typeof cabecera === 'string' ? cabecera : undefined
      if (!claveValida(clave, opciones.claveInterna)) {
        throw new ErrorNoAutorizado()
      }

      const parseado = esquemaCuerpoMensaje.safeParse(solicitud.body)
      if (!parseado.success) {
        throw new ErrorDeValidacion('Cuerpo de mensaje saliente malformado')
      }

      const resultado = await opciones.enviarMensaje.ejecutar({
        codigoCuenta: parseado.data.codigoCuenta,
        idWa: parseado.data.idWa,
        cuerpo: parseado.data.cuerpo,
      })

      return respuesta.status(200).send({
        enviado: true,
        idMensajeMeta: resultado.idMensajeMeta,
        idConversacion: resultado.idConversacion,
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

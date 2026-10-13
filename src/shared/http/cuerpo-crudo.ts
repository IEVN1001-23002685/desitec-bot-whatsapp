import type { FastifyInstance } from 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    cuerpoCrudo: Buffer
  }
}

export function registrarCuerpoCrudo(aplicacion: FastifyInstance): void {
  aplicacion.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (solicitud, cuerpo, completar) => {
      const crudo = cuerpo as unknown as Buffer
      solicitud.cuerpoCrudo = crudo

      if (crudo.length === 0) {
        completar(null, undefined)
        return
      }

      try {
        completar(null, JSON.parse(crudo.toString('utf8')))
      } catch (error) {
        completar(error instanceof Error ? error : new Error('Cuerpo JSON inválido'), undefined)
      }
    },
  )
}
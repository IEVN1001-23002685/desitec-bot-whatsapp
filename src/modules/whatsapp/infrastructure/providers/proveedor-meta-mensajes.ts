import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ErrorDeEnvioMensaje } from '../../../../shared/errors/error-de-app.js'
import type { RegistradorApp } from '../../../../shared/logging/registrador.js'
import type {
  EntradaEnviarMensaje,
  ProveedorMensajes,
  ResultadoEnviarMensaje,
} from '../../domain/ports/proveedor-mensajes.js'

const TIEMPO_ESPERA_POR_DEFECTO_MS = 10_000

const esquemaRespuestaEnvioMeta = z.object({
  messages: z.array(z.object({ id: z.string().min(1) })).min(1),
})

export type OpcionesProveedorMetaMensajes = {
  versionApi: string
  dryRun: boolean
  registrador: RegistradorApp
  tiempoEsperaMs?: number
}

export class ProveedorMetaMensajes implements ProveedorMensajes {
  constructor(private readonly opciones: OpcionesProveedorMetaMensajes) {}

  async enviar(entrada: EntradaEnviarMensaje): Promise<ResultadoEnviarMensaje> {
    if (this.opciones.dryRun) {
      const idMensajeMeta = `dry-run-${randomUUID()}`
      this.opciones.registrador.info(
        { idNumeroTelefono: entrada.idNumeroTelefono, idWa: entrada.idWa },
        'envio simulado (DRY_RUN), sin llamada a Meta',
      )
      return { idMensajeMeta }
    }

    const url = `https://graph.facebook.com/${this.opciones.versionApi}/${entrada.idNumeroTelefono}/messages`
    const controlador = new AbortController()
    const temporizador = setTimeout(
      () => controlador.abort(),
      this.opciones.tiempoEsperaMs ?? TIEMPO_ESPERA_POR_DEFECTO_MS,
    )

    let respuesta: Response
    try {
      respuesta = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${entrada.tokenAcceso}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: entrada.idWa,
          type: 'text',
          text: { body: entrada.cuerpo },
        }),
        signal: controlador.signal,
      })
    } catch (error) {
      throw new ErrorDeEnvioMensaje(
        esAbortado(error)
          ? 'Tiempo de espera agotado al enviar el mensaje a Meta'
          : 'Fallo de red al enviar el mensaje a Meta',
      )
    } finally {
      clearTimeout(temporizador)
    }

    if (!respuesta.ok) {
      throw new ErrorDeEnvioMensaje(`Meta respondio con estado ${respuesta.status}`)
    }

    const parseado = esquemaRespuestaEnvioMeta.safeParse(await leerJson(respuesta))
    const primero = parseado.success ? parseado.data.messages[0] : undefined
    if (!primero) {
      throw new ErrorDeEnvioMensaje('Respuesta de Meta sin id de mensaje')
    }

    return { idMensajeMeta: primero.id }
  }
}

function esAbortado(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

async function leerJson(respuesta: Response): Promise<unknown> {
  try {
    return await respuesta.json()
  } catch {
    return null
  }
}

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
const REINTENTOS_POR_DEFECTO = 2
const ESPERA_BASE_REINTENTO_MS = 500

const esquemaRespuestaEnvio360 = z.object({
  messages: z.array(z.object({ id: z.string().min(1) })).min(1),
})

export type OpcionesProveedor360DialogMensajes = {
  baseUrl: string
  dryRun: boolean
  registrador: RegistradorApp
  tiempoEsperaMs?: number
  reintentos?: number
  esperaBaseReintentoMs?: number
}

export class Proveedor360DialogMensajes implements ProveedorMensajes {
  constructor(private readonly opciones: OpcionesProveedor360DialogMensajes) {}

  async enviar(entrada: EntradaEnviarMensaje): Promise<ResultadoEnviarMensaje> {
    if (this.opciones.dryRun) {
      const idMensajeMeta = `dry-run-${randomUUID()}`
      this.opciones.registrador.info(
        { idNumeroTelefono: entrada.idNumeroTelefono, idWa: entrada.idWa },
        'envio simulado (DRY_RUN), sin llamada a 360dialog',
      )
      return { idMensajeMeta }
    }

    const url = `${this.quitarBarraFinal(this.opciones.baseUrl)}/messages`
    const cuerpo = construirCuerpo(entrada)
    const reintentos = this.opciones.reintentos ?? REINTENTOS_POR_DEFECTO

    let intento = 0
    for (;;) {
      const respuesta = await this.enviarUnaVez(url, entrada.credencial, cuerpo)

      if (respuesta.ok) {
        const parseado = esquemaRespuestaEnvio360.safeParse(await leerJson(respuesta))
        const primero = parseado.success ? parseado.data.messages[0] : undefined
        if (!primero) {
          throw new ErrorDeEnvioMensaje('Respuesta de 360dialog sin id de mensaje')
        }
        return { idMensajeMeta: primero.id }
      }

      if (esReintentable(respuesta.status) && intento < reintentos) {
        intento += 1
        await esperar(this.esperaBase() * 2 ** (intento - 1))
        continue
      }

      throw new ErrorDeEnvioMensaje(`360dialog respondio con estado ${respuesta.status}`)
    }
  }

  private async enviarUnaVez(url: string, credencial: string, cuerpo: unknown): Promise<Response> {
    const controlador = new AbortController()
    const temporizador = setTimeout(
      () => controlador.abort(),
      this.opciones.tiempoEsperaMs ?? TIEMPO_ESPERA_POR_DEFECTO_MS,
    )
    try {
      return await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'D360-API-KEY': credencial,
        },
        body: JSON.stringify(cuerpo),
        signal: controlador.signal,
      })
    } catch (error) {
      throw new ErrorDeEnvioMensaje(
        esAbortado(error)
          ? 'Tiempo de espera agotado al enviar el mensaje a 360dialog'
          : 'Fallo de red al enviar el mensaje a 360dialog',
      )
    } finally {
      clearTimeout(temporizador)
    }
  }

  private quitarBarraFinal(valor: string): string {
    return valor.endsWith('/') ? valor.slice(0, -1) : valor
  }

  private esperaBase(): number {
    return this.opciones.esperaBaseReintentoMs ?? ESPERA_BASE_REINTENTO_MS
  }
}

function construirCuerpo(entrada: EntradaEnviarMensaje): unknown {
  if (entrada.tipo === 'text') {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: entrada.idWa,
      type: 'text',
      text: { body: entrada.cuerpo },
    }
  }
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: entrada.idWa,
    type: 'template',
    template: {
      name: entrada.nombrePlantilla,
      language: { code: entrada.idiomaPlantilla },
      components:
        entrada.parametros && entrada.parametros.length > 0
          ? [
              {
                type: 'body',
                parameters: entrada.parametros.map((p) => ({
                  type: p.tipo,
                  text: p.texto,
                })),
              },
            ]
          : undefined,
    },
  }
}

function esReintentable(estado: number): boolean {
  return estado === 429 || estado >= 500
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

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms))
}

import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProveedorMetaMensajes } from '../src/modules/whatsapp/infrastructure/providers/proveedor-meta-mensajes.js'
import { ErrorDeEnvioMensaje } from '../src/shared/errors/error-de-app.js'
import { crearRegistrador } from '../src/shared/logging/registrador.js'

const entrada = {
  idNumeroTelefono: '111111111111111',
  tokenAcceso: 'token-secreto',
  idWa: '5215512345678',
  tipo: 'text' as const,
  cuerpo: 'Hola cliente',
}

function crearProveedor(dryRun = false): ProveedorMetaMensajes {
  return new ProveedorMetaMensajes({
    versionApi: 'v21.0',
    dryRun,
    registrador: crearRegistrador('silent'),
  })
}

function respuestaJson(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ProveedorMetaMensajes', () => {
  it('envia el mensaje a la Graph API y devuelve el id de Meta', async () => {
    const fetchFalso = vi
      .fn()
      .mockResolvedValue(respuestaJson({ messages: [{ id: 'wamid.ENVIADO.1' }] }))
    vi.stubGlobal('fetch', fetchFalso)

    const resultado = await crearProveedor().enviar(entrada)

    expect(resultado.idMensajeMeta).toBe('wamid.ENVIADO.1')
    expect(fetchFalso).toHaveBeenCalledOnce()

    const [url, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://graph.facebook.com/v21.0/111111111111111/messages')
    expect(opciones.method).toBe('POST')
    expect((opciones.headers as Record<string, string>).authorization).toBe('Bearer token-secreto')
    expect(JSON.parse(opciones.body as string)).toEqual({
      messaging_product: 'whatsapp',
      to: '5215512345678',
      type: 'text',
      text: { body: 'Hola cliente' },
    })
  })

  it('con DRY_RUN no llama a la red y devuelve un id simulado', async () => {
    const fetchFalso = vi.fn()
    vi.stubGlobal('fetch', fetchFalso)

    const resultado = await crearProveedor(true).enviar(entrada)

    expect(fetchFalso).not.toHaveBeenCalled()
    expect(resultado.idMensajeMeta).toMatch(/^dry-run-/)
  })

  it('lanza error de envio cuando Meta responde con estado de error', async () => {
    const fetchFalso = vi
      .fn()
      .mockResolvedValue(respuestaJson({ error: { message: 'invalid token' } }, 401))
    vi.stubGlobal('fetch', fetchFalso)

    await expect(crearProveedor().enviar(entrada)).rejects.toBeInstanceOf(ErrorDeEnvioMensaje)
  })

  it('lanza error de envio cuando la respuesta no trae id de mensaje', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respuestaJson({ messages: [] }))
    vi.stubGlobal('fetch', fetchFalso)

    await expect(crearProveedor().enviar(entrada)).rejects.toMatchObject({
      codigo: 'MESSAGE_SEND_FAILED',
      codigoEstado: 502,
    })
  })

  it('lanza error de envio cuando la peticion se aborta por tiempo de espera', async () => {
    const abortado = new Error('The operation was aborted')
    abortado.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortado))

    await expect(crearProveedor().enviar(entrada)).rejects.toMatchObject({
      codigo: 'MESSAGE_SEND_FAILED',
    })
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Proveedor360DialogMensajes } from '../src/modules/whatsapp/infrastructure/providers/proveedor-360dialog-mensajes.js'
import { ErrorDeEnvioMensaje } from '../src/shared/errors/error-de-app.js'
import { crearRegistrador } from '../src/shared/logging/registrador.js'

const entradaTexto = {
  idNumeroTelefono: '111111111111111',
  proveedor: '360dialog' as const,
  credencial: 'api-key-secreta',
  idWa: '5215512345678',
  tipo: 'text' as const,
  cuerpo: 'Hola cliente',
}

function crearProveedor(opciones: { dryRun?: boolean } = {}): Proveedor360DialogMensajes {
  return new Proveedor360DialogMensajes({
    baseUrl: 'https://waba-v2.360dialog.io/',
    dryRun: opciones.dryRun ?? false,
    registrador: crearRegistrador('silent'),
    tiempoEsperaMs: 50,
    reintentos: 2,
    esperaBaseReintentoMs: 1,
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

describe('Proveedor360DialogMensajes', () => {
  it('envia texto con la cabecera D360-API-KEY y devuelve el id', async () => {
    const fetchFalso = vi
      .fn()
      .mockResolvedValue(respuestaJson({ messages: [{ id: 'wamid.360.1' }] }))
    vi.stubGlobal('fetch', fetchFalso)

    const resultado = await crearProveedor().enviar(entradaTexto)

    expect(resultado.idMensajeMeta).toBe('wamid.360.1')
    const [url, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://waba-v2.360dialog.io/messages')
    expect(opciones.method).toBe('POST')
    const cabeceras = opciones.headers as Record<string, string>
    expect(cabeceras['D360-API-KEY']).toBe('api-key-secreta')
    expect(cabeceras.authorization).toBeUndefined()
    expect(JSON.parse(opciones.body as string)).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '5215512345678',
      type: 'text',
      text: { body: 'Hola cliente' },
    })
  })

  it('envia plantilla con parametros y sin components si no hay parametros', async () => {
    const fetchFalso = vi
      .fn()
      .mockImplementation(async () => respuestaJson({ messages: [{ id: 'wamid.360.2' }] }))
    vi.stubGlobal('fetch', fetchFalso)

    await crearProveedor().enviar({
      tipo: 'template',
      proveedor: '360dialog',
      idNumeroTelefono: '111111111111111',
      credencial: 'api-key-secreta',
      idWa: '5215512345678',
      nombrePlantilla: 'seguimiento_24h',
      idiomaPlantilla: 'es_ES',
      parametros: [{ tipo: 'text', texto: 'Hola Cliente' }],
    })

    const [, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(opciones.body as string)).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '5215512345678',
      type: 'template',
      template: {
        name: 'seguimiento_24h',
        language: { code: 'es_ES' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'Hola Cliente' }] }],
      },
    })

    fetchFalso.mockClear()
    await crearProveedor().enviar({
      tipo: 'template',
      proveedor: '360dialog',
      idNumeroTelefono: '111111111111111',
      credencial: 'api-key-secreta',
      idWa: '5215512345678',
      nombrePlantilla: 'seguimiento_24h',
      idiomaPlantilla: 'es_ES',
    })
    const [, opcionesSinParametros] = fetchFalso.mock.calls[0] as [string, RequestInit]
    const cuerpo = JSON.parse(opcionesSinParametros.body as string) as {
      template: { components?: unknown }
    }
    expect(cuerpo.template.components).toBeUndefined()
  })

  it('con DRY_RUN no llama a la red y devuelve un id simulado', async () => {
    const fetchFalso = vi.fn()
    vi.stubGlobal('fetch', fetchFalso)

    const resultado = await crearProveedor({ dryRun: true }).enviar(entradaTexto)

    expect(fetchFalso).not.toHaveBeenCalled()
    expect(resultado.idMensajeMeta).toMatch(/^dry-run-/)
  })

  it('no reintenta errores 401 ni 400 y lanza error de envio', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respuestaJson({ error: 'unauthorized' }, 401))
    vi.stubGlobal('fetch', fetchFalso)

    await expect(crearProveedor().enviar(entradaTexto)).rejects.toBeInstanceOf(ErrorDeEnvioMensaje)
    expect(fetchFalso).toHaveBeenCalledTimes(1)
  })

  it('reintenta 429 y 500 y termina lanzando error tras agotar intentos', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respuestaJson({ error: 'too many' }, 429))
    vi.stubGlobal('fetch', fetchFalso)

    await expect(crearProveedor().enviar(entradaTexto)).rejects.toMatchObject({
      codigo: 'MESSAGE_SEND_FAILED',
    })
    expect(fetchFalso).toHaveBeenCalledTimes(3)

    fetchFalso.mockClear()
    fetchFalso.mockResolvedValue(respuestaJson({ error: 'boom' }, 503))
    await expect(crearProveedor().enviar(entradaTexto)).rejects.toBeInstanceOf(ErrorDeEnvioMensaje)
    expect(fetchFalso).toHaveBeenCalledTimes(3)
  })

  it('se recupera si un reintento responde 200', async () => {
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(respuestaJson({ error: 'busy' }, 429))
      .mockResolvedValueOnce(respuestaJson({ messages: [{ id: 'wamid.360.3' }] }))
    vi.stubGlobal('fetch', fetchFalso)

    const resultado = await crearProveedor().enviar(entradaTexto)

    expect(resultado.idMensajeMeta).toBe('wamid.360.3')
    expect(fetchFalso).toHaveBeenCalledTimes(2)
  })

  it('lanza error de envio cuando la respuesta 200 no trae id', async () => {
    const fetchFalso = vi.fn().mockResolvedValue(respuestaJson({ messages: [] }))
    vi.stubGlobal('fetch', fetchFalso)

    await expect(crearProveedor().enviar(entradaTexto)).rejects.toMatchObject({
      codigo: 'MESSAGE_SEND_FAILED',
      codigoEstado: 502,
    })
  })

  it('lanza error de envio cuando la peticion se aborta por tiempo de espera', async () => {
    const abortado = new Error('The operation was aborted')
    abortado.name = 'AbortError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortado))

    await expect(crearProveedor().enviar(entradaTexto)).rejects.toMatchObject({
      codigo: 'MESSAGE_SEND_FAILED',
    })
  })
})

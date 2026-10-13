import { describe, it, beforeEach, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import {
  crearAppPrueba,
  construirCuerpoWebhook,
  firmar,
  mensajeTexto,
  cuentasPrueba,
  type AlmacenEnMemoria,
} from './helpers/en-memoria.js'

describe('POST /webhooks/whatsapp (firma HMAC)', () => {
  const secretoApp = 'app-secret-123'
  let app: FastifyInstance
  let almacen: AlmacenEnMemoria

  beforeEach(() => {
    const preparacion = crearAppPrueba({ cuentas: cuentasPrueba(), secretoApp })
    app = preparacion.app
    almacen = preparacion.almacen
  })

  it('acepta una firma valida y persiste el mensaje', async () => {
    const cuerpo = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [mensajeTexto({ id: 'wamid.VALID1', from: '5215512345601' })],
    })

    const resp = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': firmar(cuerpo, secretoApp),
      },
      payload: cuerpo,
    })

    expect(resp.statusCode).toBe(200)
    expect(almacen.mensajes).toHaveLength(1)
    expect(almacen.mensajes[0]?.idMensajeMeta).toBe('wamid.VALID1')
  })

  it('rechaza una firma invalida con 401 sin persistir nada', async () => {
    const cuerpo = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [mensajeTexto({ id: 'wamid.INVALID1' })],
    })

    const resp = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': firmar(cuerpo, 'wrong-secret'),
      },
      payload: cuerpo,
    })

    expect(resp.statusCode).toBe(401)
    expect(resp.json()).toEqual({ error: 'INVALID_SIGNATURE' })
    expect(almacen.mensajes).toHaveLength(0)
  })

  it('rechaza la ausencia de cabecera de firma con 401', async () => {
    const cuerpo = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [mensajeTexto({ id: 'wamid.NOHEADER' })],
    })

    const resp = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: { 'content-type': 'application/json' },
      payload: cuerpo,
    })

    expect(resp.statusCode).toBe(401)
    expect(almacen.mensajes).toHaveLength(0)
  })

  it('rechaza una firma que no corresponde al cuerpo enviado', async () => {
    const original = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [mensajeTexto({ id: 'wamid.TAMPERED' })],
    })
    const alterado = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [mensajeTexto({ id: 'wamid.TAMPERED', body: 'mensaje alterado' })],
    })

    const resp = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': firmar(original, secretoApp),
      },
      payload: alterado,
    })

    expect(resp.statusCode).toBe(401)
    expect(almacen.mensajes).toHaveLength(0)
  })
})

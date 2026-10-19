import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import {
  crearAppPrueba,
  construirCuerpoWebhook,
  firmar,
  mensajeTexto,
  cuentasPrueba,
  AlmacenEnMemoria,
  PausadorSeguimientosFalso,
  ProcesadorAutorespuestaFalso,
} from './helpers/en-memoria.js'

const secretoApp = 'app-secret-123'

describe('POST /webhooks/whatsapp (reprocesamiento y persistencia)', () => {
  let app: FastifyInstance
  let almacen: AlmacenEnMemoria

  beforeEach(() => {
    const preparacion = crearAppPrueba({ cuentas: cuentasPrueba(), secretoApp })
    app = preparacion.app
    almacen = preparacion.almacen
  })

  async function post(cuerpo: string): Promise<number> {
    const resp = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': firmar(cuerpo, secretoApp),
      },
      payload: cuerpo,
    })
    return resp.statusCode
  }

  it('recibe eventos dirigidos a cada una de las tres cuentas', async () => {
    for (const idNumeroTelefono of ['111111111111111', '222222222222222', '333333333333333']) {
      const cuerpo = construirCuerpoWebhook({
        idNumeroTelefono,
        messages: [
          mensajeTexto({ id: `wamid.ACCOUNT.${idNumeroTelefono}`, from: '5215512345678' }),
        ],
      })
      const estado = await post(cuerpo)
      expect(estado).toBe(200)
    }

    expect(almacen.mensajes).toHaveLength(3)
    expect(almacen.mensajes.map((mensaje) => mensaje.idCuentaWhatsApp).sort()).toEqual([
      'cuenta-comercial',
      'cuenta-postventa',
      'cuenta-soporte',
    ])
  })

  it('procesa multiples mensajes dentro de un mismo webhook', async () => {
    const cuerpo = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [
        mensajeTexto({ id: 'wamid.MULTI.1', from: '5215512345678' }),
        mensajeTexto({ id: 'wamid.MULTI.2', from: '5215512345678' }),
      ],
    })

    const estado = await post(cuerpo)
    expect(estado).toBe(200)
    expect(almacen.mensajes).toHaveLength(2)
  })

  it('cuando hay varios entry/changes acumula todos los mensajes', async () => {
    const cuerpo = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'ENTRY_1',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: '111111111111111' },
                contacts: [{ wa_id: '5215512345678' }],
                messages: [mensajeTexto({ id: 'wamid.ENTRY.1' })],
              },
            },
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: '222222222222222' },
                contacts: [{ wa_id: '5215512345602' }],
                messages: [mensajeTexto({ id: 'wamid.ENTRY.2', from: '5215512345602' })],
              },
            },
          ],
        },
        {
          id: 'ENTRY_2',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: '333333333333333' },
                contacts: [{ wa_id: '5215512345603' }],
                messages: [mensajeTexto({ id: 'wamid.ENTRY.3', from: '5215512345603' })],
              },
            },
          ],
        },
      ],
    })

    const estado = await post(cuerpo)
    expect(estado).toBe(200)
    expect(almacen.mensajes).toHaveLength(3)
  })

  it('no duplica mensajes cuando Meta reenvia el mismo webhook', async () => {
    const cuerpo = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [mensajeTexto({ id: 'wamid.DUP.1', from: '5215512345678' })],
    })

    expect(await post(cuerpo)).toBe(200)
    expect(await post(cuerpo)).toBe(200)

    expect(almacen.mensajes).toHaveLength(1)
    expect(almacen.eventos).toHaveLength(1)
    expect(almacen.eventos[0]?.estado).toBe('procesado')
  })

  it('reutiliza un contacto existente', async () => {
    almacen.contactos.push({
      id: 'contacto-existente',
      idWa: '5215512345678',
      nombrePerfil: 'Cliente existente',
    })

    const cuerpo = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [mensajeTexto({ id: 'wamid.CONTACT.1', from: '5215512345678' })],
    })

    expect(await post(cuerpo)).toBe(200)
    expect(almacen.contactos).toHaveLength(1)
    expect(almacen.contactos[0]?.id).toBe('contacto-existente')
    expect(almacen.mensajes[0]?.idMensajeMeta).toBe('wamid.CONTACT.1')
  })

  it('crea un contacto nuevo al recibir un mensaje desconocido', async () => {
    const cuerpo = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [mensajeTexto({ id: 'wamid.NEWCONTACT', from: '5215512399999', body: 'Hola' })],
    })

    expect(await post(cuerpo)).toBe(200)
    expect(almacen.contactos).toHaveLength(1)
    expect(almacen.contactos[0]?.idWa).toBe('5215512399999')
    expect(almacen.contactos[0]?.nombrePerfil).toBe('Cliente 9999')
  })

  it('mantiene conversaciones independientes del mismo cliente en distintas lineas', async () => {
    const viaLinea1 = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [mensajeTexto({ id: 'wamid.LINES.1', from: '5215512345678' })],
    })
    const viaLinea2 = construirCuerpoWebhook({
      idNumeroTelefono: '222222222222222',
      messages: [mensajeTexto({ id: 'wamid.LINES.2', from: '5215512345678' })],
    })

    expect(await post(viaLinea1)).toBe(200)
    expect(await post(viaLinea2)).toBe(200)

    expect(almacen.contactos).toHaveLength(1)
    expect(almacen.conversaciones).toHaveLength(2)
    expect(
      almacen.conversaciones.map((conversacion) => conversacion.idCuentaWhatsApp).sort(),
    ).toEqual(['cuenta-comercial', 'cuenta-soporte'])
    expect(almacen.conversaciones.map((conversacion) => conversacion.idContacto)).toEqual([
      almacen.contactos[0]?.id,
      almacen.contactos[0]?.id,
    ])
  })

  it('mantiene la misma conversacion si el cliente sigue escribiendo a la misma linea', async () => {
    const primero = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [mensajeTexto({ id: 'wamid.CONV.1', from: '5215512345678' })],
    })
    const segundo = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [mensajeTexto({ id: 'wamid.CONV.2', from: '5215512345678' })],
    })

    expect(await post(primero)).toBe(200)
    expect(await post(segundo)).toBe(200)

    expect(almacen.conversaciones).toHaveLength(1)
    expect(almacen.mensajes).toHaveLength(2)
  })

  it('procesa eventos de estado de mensajes sin crear mensajes entrantes', async () => {
    const cuerpo = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      statuses: [
        {
          id: 'wamid.STATUS.1',
          status: 'delivered',
          timestamp: '1700000000',
          recipient_id: '5215512345678',
        },
      ],
    })

    const estado = await post(cuerpo)
    expect(estado).toBe(200)
    expect(almacen.mensajes).toHaveLength(0)
    expect(almacen.eventos[0]?.estado).toBe('procesado')
  })

  it('rechaza con 400 un evento malformado', async () => {
    const malformado = JSON.stringify({ object: 'whatsapp_business_account' })

    const resp = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': firmar(malformado, secretoApp),
      },
      payload: malformado,
    })

    expect(resp.statusCode).toBe(400)
    expect(resp.json()).toEqual({ error: 'VALIDATION_ERROR' })
    expect(almacen.mensajes).toHaveLength(0)
  })

  it('registra de forma controlada tipos de mensaje no soportados', async () => {
    const cuerpo = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'ENTRY_UNSUPPORTED',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: '111111111111111' },
                contacts: [{ profile: { name: 'Cliente' }, wa_id: '5215512345678' }],
                messages: [
                  {
                    id: 'wamid.IMAGE.1',
                    from: '5215512345678',
                    timestamp: '1700000000',
                    type: 'image',
                    image: { mime_type: 'image/jpeg', sha256: 'abc', id: 'media-id' },
                  },
                ],
              },
            },
          ],
        },
      ],
    })

    const estado = await post(cuerpo)
    expect(estado).toBe(200)
    expect(almacen.mensajes).toHaveLength(1)
    expect(almacen.mensajes[0]?.tipo).toBe('image')
    expect(almacen.mensajes[0]?.cuerpo).toBeNull()
    expect(almacen.eventos[0]?.estado).toBe('procesado')
  })
})

describe('POST /webhooks/whatsapp (pausa de seguimientos por respuesta)', () => {
  function prepararApp(pausador: PausadorSeguimientosFalso) {
    const preparacion = crearAppPrueba({ cuentas: cuentasPrueba(), secretoApp, pausador })
    preparacion.almacen.contactos.push({
      id: 'contacto-1',
      idWa: '5215512345678',
      nombrePerfil: 'Cliente',
    })
    preparacion.almacen.conversaciones.push({
      id: 'conversacion-1',
      idCuentaWhatsApp: 'cuenta-comercial',
      idContacto: 'contacto-1',
      estado: 'abierta',
      ultimoMensajeEn: null,
    })
    return preparacion
  }

  async function post(app: FastifyInstance, cuerpo: string): Promise<number> {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': firmar(cuerpo, secretoApp),
      },
      payload: cuerpo,
    })
    return respuesta.statusCode
  }

  it('pausa los seguimientos de la conversacion cuando el cliente responde', async () => {
    const pausador = new PausadorSeguimientosFalso({ pausados: { 'conversacion-1': 2 } })
    const { app } = prepararApp(pausador)
    const cuerpo = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [mensajeTexto({ id: 'wamid.PAUSA.1', from: '5215512345678' })],
    })

    expect(await post(app, cuerpo)).toBe(200)
    expect(pausador.llamadas).toEqual(['conversacion-1'])
  })

  it('no vuelve a pausar cuando Meta reenvia el mismo webhook', async () => {
    const pausador = new PausadorSeguimientosFalso()
    const { app } = prepararApp(pausador)
    const cuerpo = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [mensajeTexto({ id: 'wamid.PAUSA.DUP', from: '5215512345678' })],
    })

    expect(await post(app, cuerpo)).toBe(200)
    expect(await post(app, cuerpo)).toBe(200)
    expect(pausador.llamadas).toEqual(['conversacion-1'])
  })

  it('no interrumpe la recepcion del mensaje si la pausa falla', async () => {
    const pausador = new PausadorSeguimientosFalso({ error: new Error('bd caida') })
    const { app, almacen } = prepararApp(pausador)
    const cuerpo = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [mensajeTexto({ id: 'wamid.PAUSA.ERROR', from: '5215512345678' })],
    })

    expect(await post(app, cuerpo)).toBe(200)
    expect(almacen.mensajes).toHaveLength(1)
    expect(almacen.eventos[0]?.estado).toBe('procesado')
  })
})

describe('POST /webhooks/whatsapp (autorespuesta)', () => {
  async function post(app: FastifyInstance, cuerpo: string): Promise<number> {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': firmar(cuerpo, secretoApp),
      },
      payload: cuerpo,
    })
    return respuesta.statusCode
  }

  it('invoca el procesador con el mensaje nuevo', async () => {
    const procesador = new ProcesadorAutorespuestaFalso()
    const { app } = crearAppPrueba({
      cuentas: cuentasPrueba(),
      secretoApp,
      procesadorAutorespuesta: procesador,
    })
    const cuerpo = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [
        mensajeTexto({ id: 'wamid.BOT.1', from: '5215512345678', body: 'Hola, quiero cotizar' }),
      ],
    })

    expect(await post(app, cuerpo)).toBe(200)
    expect(procesador.llamadas).toHaveLength(1)
    expect(procesador.llamadas[0]).toMatchObject({
      codigoCuenta: 'linea-comercial',
      idWa: '5215512345678',
      texto: 'Hola, quiero cotizar',
    })
  })

  it('no invoca el procesador cuando Meta reenvia el mismo webhook', async () => {
    const procesador = new ProcesadorAutorespuestaFalso()
    const { app } = crearAppPrueba({
      cuentas: cuentasPrueba(),
      secretoApp,
      procesadorAutorespuesta: procesador,
    })
    const cuerpo = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [mensajeTexto({ id: 'wamid.BOT.DUP', from: '5215512345678' })],
    })

    expect(await post(app, cuerpo)).toBe(200)
    expect(await post(app, cuerpo)).toBe(200)
    expect(procesador.llamadas).toHaveLength(1)
  })

  it('no interrumpe la recepcion si el procesador falla', async () => {
    const procesador = new ProcesadorAutorespuestaFalso({ error: new Error('bot caido') })
    const { app, almacen } = crearAppPrueba({
      cuentas: cuentasPrueba(),
      secretoApp,
      procesadorAutorespuesta: procesador,
    })
    const cuerpo = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [mensajeTexto({ id: 'wamid.BOT.ERROR', from: '5215512345678' })],
    })

    expect(await post(app, cuerpo)).toBe(200)
    expect(almacen.mensajes).toHaveLength(1)
    expect(almacen.eventos[0]?.estado).toBe('procesado')
  })
})

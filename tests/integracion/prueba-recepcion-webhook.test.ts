import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { desc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { crearApp } from '../../src/app.js'
import { crearBaseDeDatos } from '../../src/shared/db/cliente-bd.js'
import { crearRegistrador } from '../../src/shared/logging/registrador.js'
import { CADENA_PRUEBA, sembrarCuentas, truncarTablas } from './base-datos.js'
import { construirCuerpoWebhook, firmar, mensajeTexto } from '../helpers/en-memoria.js'
import { RepositorioDrizzleCuentaWhatsApp } from '../../src/modules/whatsapp/infrastructure/repositories/repositorio-drizzle-cuenta-whatsapp.js'
import { RepositorioDrizzleEventoWebhook } from '../../src/modules/whatsapp/infrastructure/repositories/repositorio-drizzle-evento-webhook.js'
import { RepositorioDrizzleEstadoMensaje } from '../../src/modules/whatsapp/infrastructure/repositories/repositorio-drizzle-estado-mensaje.js'
import { TransaccionDrizzleMensajeEntrante } from '../../src/modules/whatsapp/infrastructure/transactions/transaccion-drizzle-mensaje-entrante.js'
import { VerificarWebhookWhatsApp } from '../../src/modules/whatsapp/application/use-cases/verificar-webhook-whatsapp.js'
import { ResolverCuentaWhatsApp } from '../../src/modules/whatsapp/application/use-cases/resolver-cuenta-whatsapp.js'
import { RegistrarMensajeEntrante } from '../../src/modules/whatsapp/application/use-cases/registrar-mensaje-entrante.js'
import { RecibirEventoWhatsApp } from '../../src/modules/whatsapp/application/use-cases/recibir-evento-whatsapp.js'
import {
  contactos,
  conversaciones,
  eventosWebhook,
  mensajes,
} from '../../src/shared/db/schema/index.js'
import type { BaseDeDatos } from '../../src/shared/db/tipos.js'

const secretoApp = 'app-secret-123'

function crearAppIntegracion(baseDeDatos: BaseDeDatos, secreto: string): FastifyInstance {
  const registrador = crearRegistrador('silent')
  const cuentas = new RepositorioDrizzleCuentaWhatsApp(baseDeDatos)
  const eventos = new RepositorioDrizzleEventoWebhook(baseDeDatos)
  const estados = new RepositorioDrizzleEstadoMensaje(baseDeDatos)
  const transaccion = new TransaccionDrizzleMensajeEntrante(baseDeDatos)

  return crearApp({
    registrador,
    webhook: {
      verificarWebhook: new VerificarWebhookWhatsApp('test-verify-token'),
      recibirEvento: new RecibirEventoWhatsApp(
        eventos,
        new ResolverCuentaWhatsApp(cuentas),
        new RegistrarMensajeEntrante(transaccion),
        estados,
        registrador,
      ),
      secretoApp: secreto,
    },
  })
}

describe('POST /webhooks/whatsapp con repositorios reales', () => {
  let pool: Pool
  let baseDeDatos: BaseDeDatos
  let app: FastifyInstance

  beforeAll(() => {
    const conexion = crearBaseDeDatos(CADENA_PRUEBA)
    baseDeDatos = conexion.baseDeDatos
    pool = conexion.pool
    app = crearAppIntegracion(baseDeDatos, secretoApp)
  })

  afterAll(async () => {
    await app.close()
    await pool.end()
  })

  beforeEach(async () => {
    await truncarTablas(pool)
    await sembrarCuentas(baseDeDatos)
  })

  async function post(cuerpo: string): Promise<number> {
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

  async function contarMensajes(): Promise<number> {
    return (await baseDeDatos.select().from(mensajes)).length
  }

  async function ultimoEvento(): Promise<typeof eventosWebhook.$inferSelect | undefined> {
    const filas = await baseDeDatos
      .select()
      .from(eventosWebhook)
      .orderBy(desc(eventosWebhook.recibidoEn))
      .limit(1)
    return filas[0]
  }

  it('persiste un mensaje entrante para una cuenta conocida', async () => {
    const cuerpo = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [mensajeTexto({ id: 'wamid.INTEG.1', from: '5215512345678' })],
    })

    expect(await post(cuerpo)).toBe(200)
    expect(await contarMensajes()).toBe(1)
    expect((await ultimoEvento())?.estado).toBe('procesado')
  })

  it('no duplica mensajes cuando Meta reenvia el mismo webhook', async () => {
    const cuerpo = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [mensajeTexto({ id: 'wamid.INTEG.DUP', from: '5215512345678' })],
    })

    expect(await post(cuerpo)).toBe(200)
    expect(await post(cuerpo)).toBe(200)

    expect(await contarMensajes()).toBe(1)
    expect(await baseDeDatos.select().from(eventosWebhook)).toHaveLength(1)
    expect((await ultimoEvento())?.estado).toBe('procesado')
  })

  it('persiste un mismo contacto y conversacion con dos mensajes seguidos', async () => {
    const primero = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [mensajeTexto({ id: 'wamid.INTEG.CONV.1', from: '5215512345678' })],
    })
    const segundo = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [mensajeTexto({ id: 'wamid.INTEG.CONV.2', from: '5215512345678' })],
    })

    expect(await post(primero)).toBe(200)
    expect(await post(segundo)).toBe(200)

    expect(await contarMensajes()).toBe(2)
    expect(await baseDeDatos.select().from(contactos)).toHaveLength(1)
    expect(await baseDeDatos.select().from(conversaciones)).toHaveLength(1)
  })

  it('ignora cuentas desconocidas sin persistir mensajes', async () => {
    const cuerpo = construirCuerpoWebhook({
      idNumeroTelefono: '999999999999999',
      messages: [mensajeTexto({ id: 'wamid.INTEG.DESCONOCIDA', from: '5215512345678' })],
    })

    expect(await post(cuerpo)).toBe(200)
    expect(await contarMensajes()).toBe(0)
    expect((await ultimoEvento())?.estado).toBe('ignorado')
  })

  it('actualiza el estado de un mensaje previamente persistido', async () => {
    const entrante = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      messages: [mensajeTexto({ id: 'wamid.INTEG.ESTADO.1', from: '5215512345678' })],
    })
    expect(await post(entrante)).toBe(200)

    const estadosCuerpo = construirCuerpoWebhook({
      idNumeroTelefono: '111111111111111',
      statuses: [
        {
          id: 'wamid.INTEG.ESTADO.1',
          status: 'delivered',
          timestamp: '1700000000',
          recipient_id: '5215512345678',
        },
      ],
    })
    expect(await post(estadosCuerpo)).toBe(200)

    const filas = await baseDeDatos
      .select()
      .from(mensajes)
      .where(eq(mensajes.idMensajeMeta, 'wamid.INTEG.ESTADO.1'))
    expect(filas[0]?.estado).toBe('delivered')
  })
})

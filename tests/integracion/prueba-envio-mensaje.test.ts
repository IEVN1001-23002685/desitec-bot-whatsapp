import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { crearApp } from '../../src/app.js'
import { crearBaseDeDatos } from '../../src/shared/db/cliente-bd.js'
import { crearRegistrador } from '../../src/shared/logging/registrador.js'
import { CADENA_PRUEBA, sembrarCuentas, truncarTablas } from './base-datos.js'
import { ProveedorMensajesFalso } from '../helpers/en-memoria.js'
import { RepositorioDrizzleCuentaWhatsApp } from '../../src/modules/whatsapp/infrastructure/repositories/repositorio-drizzle-cuenta-whatsapp.js'
import { RepositorioDrizzleEventoWebhook } from '../../src/modules/whatsapp/infrastructure/repositories/repositorio-drizzle-evento-webhook.js'
import { RepositorioDrizzleEstadoMensaje } from '../../src/modules/whatsapp/infrastructure/repositories/repositorio-drizzle-estado-mensaje.js'
import { TransaccionDrizzleMensajeEntrante } from '../../src/modules/whatsapp/infrastructure/transactions/transaccion-drizzle-mensaje-entrante.js'
import { VerificarWebhookWhatsApp } from '../../src/modules/whatsapp/application/use-cases/verificar-webhook-whatsapp.js'
import { ResolverCuentaWhatsApp } from '../../src/modules/whatsapp/application/use-cases/resolver-cuenta-whatsapp.js'
import { RegistrarMensajeEntrante } from '../../src/modules/whatsapp/application/use-cases/registrar-mensaje-entrante.js'
import { EnviarMensajeSaliente } from '../../src/modules/whatsapp/application/use-cases/enviar-mensaje-saliente.js'
import { RecibirEventoWhatsApp } from '../../src/modules/whatsapp/application/use-cases/recibir-evento-whatsapp.js'
import { contactos, conversaciones, mensajes } from '../../src/shared/db/schema/index.js'
import type { BaseDeDatos } from '../../src/shared/db/tipos.js'

const CLAVE = 'clave-integracion'

function crearAppIntegracion(
  baseDeDatos: BaseDeDatos,
  proveedor: ProveedorMensajesFalso,
  ventanaAtencionActiva: boolean,
): FastifyInstance {
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
      secretoApp: 'app-secret-123',
    },
    mensajes: {
      enviarMensaje: new EnviarMensajeSaliente(cuentas, transaccion, proveedor, {
        ventanaAtencionActiva,
      }),
      claveInterna: CLAVE,
    },
  })
}

describe('POST /api/mensajes con repositorios reales', () => {
  let pool: Pool
  let baseDeDatos: BaseDeDatos
  let proveedor: ProveedorMensajesFalso
  let app: FastifyInstance
  let appVentanaActiva: FastifyInstance

  beforeAll(() => {
    const conexion = crearBaseDeDatos(CADENA_PRUEBA)
    baseDeDatos = conexion.baseDeDatos
    pool = conexion.pool
    proveedor = new ProveedorMensajesFalso({ idMensajeMeta: 'wamid.INTEG.ENVIO.1' })
    app = crearAppIntegracion(baseDeDatos, proveedor, false)
    appVentanaActiva = crearAppIntegracion(baseDeDatos, proveedor, true)
  })

  afterAll(async () => {
    await app.close()
    await appVentanaActiva.close()
    await pool.end()
  })

  beforeEach(async () => {
    await truncarTablas(pool)
    await sembrarCuentas(baseDeDatos)
  })

  async function enviar(
    aplicacion: FastifyInstance,
    cuerpo: Record<string, unknown>,
    conClave = true,
  ) {
    return aplicacion.inject({
      method: 'POST',
      url: '/api/mensajes',
      headers: conClave ? { 'x-api-key-interna': CLAVE } : {},
      payload: cuerpo,
    })
  }

  it('persiste el mensaje saliente con el id de Meta', async () => {
    const respuesta = await enviar(app, {
      codigoCuenta: 'linea-comercial',
      idWa: '5215512345678',
      cuerpo: 'Buen dia',
    })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json()).toMatchObject({ enviado: true, idMensajeMeta: 'wamid.INTEG.ENVIO.1' })

    const filas = await baseDeDatos.select().from(mensajes)
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      direccion: 'saliente',
      estado: 'enviado',
      cuerpo: 'Buen dia',
      idMensajeMeta: 'wamid.INTEG.ENVIO.1',
    })
    expect(await baseDeDatos.select().from(contactos)).toHaveLength(1)
    expect(await baseDeDatos.select().from(conversaciones)).toHaveLength(1)
  })

  it('rechaza con 401 sin la clave interna y no persiste nada', async () => {
    const respuesta = await enviar(
      app,
      { codigoCuenta: 'linea-comercial', idWa: '5215512345678', cuerpo: 'Hola' },
      false,
    )

    expect(respuesta.statusCode).toBe(401)
    expect(await baseDeDatos.select().from(mensajes)).toHaveLength(0)
  })

  it('rechaza con 404 cuando la cuenta no existe', async () => {
    const respuesta = await enviar(app, {
      codigoCuenta: 'linea-inexistente',
      idWa: '5215512345678',
      cuerpo: 'Hola',
    })

    expect(respuesta.statusCode).toBe(404)
    expect(respuesta.json()).toEqual({ error: 'ACCOUNT_NOT_FOUND' })
  })

  it('rechaza con 409 fuera de la ventana de atencion', async () => {
    const respuesta = await enviar(appVentanaActiva, {
      codigoCuenta: 'linea-comercial',
      idWa: '5215512345678',
      cuerpo: 'Hola',
    })

    expect(respuesta.statusCode).toBe(409)
    expect(respuesta.json()).toEqual({ error: 'WINDOW_CLOSED' })
    expect(await baseDeDatos.select().from(mensajes)).toHaveLength(0)
  })

  it('actualiza el estado del saliente cuando llega un status de Meta', async () => {
    const respuesta = await enviar(app, {
      codigoCuenta: 'linea-comercial',
      idWa: '5215512345678',
      cuerpo: 'Buen dia',
    })
    expect(respuesta.statusCode).toBe(200)

    const estados = new RepositorioDrizzleEstadoMensaje(baseDeDatos)
    expect(await estados.actualizarEstado('wamid.INTEG.ENVIO.1', 'delivered')).toBe(true)

    const filas = await baseDeDatos
      .select()
      .from(mensajes)
      .where(eq(mensajes.idMensajeMeta, 'wamid.INTEG.ENVIO.1'))
    expect(filas[0]?.estado).toBe('delivered')
  })
})

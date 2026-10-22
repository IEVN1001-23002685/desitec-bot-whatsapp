import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { desc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { crearApp } from '../../src/app.js'
import { crearBaseDeDatos } from '../../src/shared/db/cliente-bd.js'
import { crearRegistrador } from '../../src/shared/logging/registrador.js'
import { CADENA_PRUEBA, truncarTablas } from './base-datos.js'
import { RecibirEvento360Dialog } from '../../src/modules/whatsapp/application/use-cases/recibir-evento-360dialog.js'
import { ProcesarEventosWebhookPendientes } from '../../src/modules/whatsapp/application/use-cases/procesar-eventos-webhook-pendientes.js'
import { ProcesarPayloadWhatsApp } from '../../src/modules/whatsapp/application/use-cases/procesar-payload-whatsapp.js'
import { RegistrarMensajeEntrante } from '../../src/modules/whatsapp/application/use-cases/registrar-mensaje-entrante.js'
import { RegistrarMensajeSalienteHumano } from '../../src/modules/whatsapp/application/use-cases/registrar-mensaje-saliente-humano.js'
import { ResolverCuentaWhatsApp } from '../../src/modules/whatsapp/application/use-cases/resolver-cuenta-whatsapp.js'
import { PausadorSeguimientosRespuesta } from '../../src/modules/followups/infrastructure/adapters/pausador-seguimientos-respuesta.js'
import { RepositorioDrizzleCuentaWhatsApp } from '../../src/modules/whatsapp/infrastructure/repositories/repositorio-drizzle-cuenta-whatsapp.js'
import { RepositorioDrizzleEstadoMensaje } from '../../src/modules/whatsapp/infrastructure/repositories/repositorio-drizzle-estado-mensaje.js'
import { RepositorioDrizzleEventoWebhook } from '../../src/modules/whatsapp/infrastructure/repositories/repositorio-drizzle-evento-webhook.js'
import { RepositorioDrizzleSeguimientoProgramado } from '../../src/modules/followups/infrastructure/repositories/repositorio-drizzle-seguimiento-programado.js'
import { ResolverSecretoWebhookEntorno } from '../../src/modules/whatsapp/infrastructure/resolvers/resolver-secreto-webhook-entorno.js'
import { TransaccionDrizzleMensajeEntrante } from '../../src/modules/whatsapp/infrastructure/transactions/transaccion-drizzle-mensaje-entrante.js'
import {
  contactos,
  conversaciones,
  cuentasWhatsApp,
  eventosWebhook,
  mensajes,
  reglasSeguimiento,
  seguimientosProgramados,
} from '../../src/shared/db/schema/index.js'
import type { BaseDeDatos } from '../../src/shared/db/tipos.js'

const ID_NUMERO_TELEFONO = '444444444444444'
const SECRETO_WEBHOOK = 'secreto-webhook-360'

type Escenario = {
  app: FastifyInstance
  procesarEventos: ProcesarEventosWebhookPendientes
  baseDeDatos: BaseDeDatos
  idCuenta: string
}

async function crearEscenario(baseDeDatos: BaseDeDatos): Promise<Escenario> {
  const registrador = crearRegistrador('silent')
  const cuentas = new RepositorioDrizzleCuentaWhatsApp(baseDeDatos)
  const eventos = new RepositorioDrizzleEventoWebhook(baseDeDatos)
  const estados = new RepositorioDrizzleEstadoMensaje(baseDeDatos)
  const transaccion = new TransaccionDrizzleMensajeEntrante(baseDeDatos)
  const pausador = new PausadorSeguimientosRespuesta(
    new RepositorioDrizzleSeguimientoProgramado(baseDeDatos),
  )
  const recibirEvento = new RecibirEvento360Dialog(
    eventos,
    new ResolverSecretoWebhookEntorno(cuentas, {
      D360_WEBHOOK_SECRET_LINEA_COMERCIAL: SECRETO_WEBHOOK,
    }),
    registrador,
  )
  const procesarEventos = new ProcesarEventosWebhookPendientes(
    eventos,
    new ProcesarPayloadWhatsApp(
      new ResolverCuentaWhatsApp(cuentas),
      new RegistrarMensajeEntrante(transaccion),
      estados,
      registrador,
      new RegistrarMensajeSalienteHumano(transaccion),
      pausador,
    ),
    registrador,
  )
  const app = crearApp({ registrador, webhook360: { recibirEvento } })

  const filas = await baseDeDatos
    .insert(cuentasWhatsApp)
    .values({
      codigo: 'linea-comercial',
      nombreComercial: 'Linea Comercial',
      idNumeroTelefono: ID_NUMERO_TELEFONO,
      telefonoVisible: '+5210000000001',
      tokenAcceso: null,
      proveedor: '360dialog',
      credencialRef: 'D360_API_KEY_LINEA_COMERCIAL',
      webhookSecretRef: 'D360_WEBHOOK_SECRET_LINEA_COMERCIAL',
      estaActiva: true,
    })
    .returning({ id: cuentasWhatsApp.id })
  const cuenta = filas[0]
  if (!cuenta) {
    throw new Error('No se pudo sembrar la cuenta de prueba')
  }

  return { app, procesarEventos, baseDeDatos, idCuenta: cuenta.id }
}

function cuerpoMensaje(idMensaje: string, from = '5215512345678'): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA-360',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '+5210000000000',
                phone_number_id: ID_NUMERO_TELEFONO,
              },
              contacts: [{ profile: { name: 'Cliente' }, wa_id: from }],
              messages: [
                {
                  id: idMensaje,
                  from,
                  timestamp: '1700000000',
                  type: 'text',
                  text: { body: 'Hola' },
                },
              ],
            },
          },
        ],
      },
    ],
  })
}

function cuerpoEcho(idEcho: string, to = '5215512345678'): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA-360',
        changes: [
          {
            field: 'smb_message_echoes',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '+5210000000000',
                phone_number_id: ID_NUMERO_TELEFONO,
              },
              message_echoes: [
                {
                  id: idEcho,
                  from: '5210000000000',
                  to,
                  timestamp: '1700000200',
                  type: 'text',
                  text: { body: 'Respuesta del asesor' },
                },
              ],
            },
          },
        ],
      },
    ],
  })
}

describe('POST /webhooks/360dialog con repositorios reales', () => {
  let pool: Pool
  let baseDeDatos: BaseDeDatos
  let escenario: Escenario

  beforeAll(() => {
    const conexion = crearBaseDeDatos(CADENA_PRUEBA)
    baseDeDatos = conexion.baseDeDatos
    pool = conexion.pool
  })

  afterAll(async () => {
    await escenario?.app.close()
    await pool.end()
  })

  beforeEach(async () => {
    await escenario?.app.close()
    await truncarTablas(pool)
    escenario = await crearEscenario(baseDeDatos)
  })

  async function publicar(
    cuerpo: string,
    token: string | undefined = SECRETO_WEBHOOK,
  ): Promise<{ status: number }> {
    const respuesta = await escenario.app.inject({
      method: 'POST',
      url: '/webhooks/360dialog',
      headers: {
        'content-type': 'application/json',
        ...(token === undefined ? {} : { 'x-webhook-token': token }),
      },
      payload: cuerpo,
    })
    return { status: respuesta.statusCode }
  }

  it('persiste el evento como recibido de 360dialog y no lo procesa en la peticion', async () => {
    const respuesta = await publicar(cuerpoMensaje('wamid.INTEG.360.1'))

    expect(respuesta.status).toBe(200)
    const eventos = await baseDeDatos.select().from(eventosWebhook)
    expect(eventos).toHaveLength(1)
    expect(eventos[0]).toMatchObject({ fuente: '360dialog', estado: 'recibido' })
    expect(await baseDeDatos.select().from(mensajes)).toHaveLength(0)
  })

  it('rechaza un token incorrecto sin persistir el evento', async () => {
    const respuesta = await publicar(cuerpoMensaje('wamid.INTEG.360.2'), 'token-equivocado')

    expect(respuesta.status).toBe(401)
    expect(await baseDeDatos.select().from(eventosWebhook)).toHaveLength(0)
  })

  it('el worker procesa el evento y registra el mensaje entrante', async () => {
    await publicar(cuerpoMensaje('wamid.INTEG.360.3'))

    const resultado = await escenario.procesarEventos.ejecutar()

    expect(resultado).toEqual({ procesados: 1, ignorados: 0, fallidos: 0 })
    const almacenados = await baseDeDatos.select().from(mensajes)
    expect(almacenados).toHaveLength(1)
    expect(almacenados[0]).toMatchObject({
      direccion: 'entrante',
      idMensajeMeta: 'wamid.INTEG.360.3',
      idCuentaWhatsApp: escenario.idCuenta,
    })
    const eventos = await baseDeDatos.select().from(eventosWebhook)
    expect(eventos[0]?.estado).toBe('procesado')
  })

  it('regatea un eco como saliente humano y pausa el seguimiento pendiente', async () => {
    const [contacto] = await baseDeDatos
      .insert(contactos)
      .values({ idWa: '5215512345678' })
      .returning({ id: contactos.id })
    if (!contacto) {
      throw new Error('No se pudo sembrar el contacto')
    }
    const [conversacion] = await baseDeDatos
      .insert(conversaciones)
      .values({
        idCuentaWhatsApp: escenario.idCuenta,
        idContacto: contacto.id,
        ultimoMensajeEn: new Date('2026-01-01T10:00:00.000Z'),
      })
      .returning({ id: conversaciones.id })
    if (!conversacion) {
      throw new Error('No se pudo sembrar la conversacion')
    }
    const [regla] = await baseDeDatos
      .insert(reglasSeguimiento)
      .values({
        codigo: 'regla-1',
        nombre: 'Regla 1',
        idCuentaWhatsApp: escenario.idCuenta,
        demoraHoras: 24,
        cuerpo: 'Hola',
        activa: true,
      })
      .returning({ id: reglasSeguimiento.id })
    if (!regla) {
      throw new Error('No se pudo sembrar la regla')
    }
    await baseDeDatos.insert(seguimientosProgramados).values({
      idConversacion: conversacion.id,
      idReglaSeguimiento: regla.id,
      programadoPara: new Date('2026-01-01T00:00:00.000Z'),
    })

    await publicar(cuerpoEcho('wamid.INTEG.360.ECHO.1'))
    const resultado = await escenario.procesarEventos.ejecutar()

    expect(resultado.procesados).toBe(1)
    const salientes = await baseDeDatos
      .select()
      .from(mensajes)
      .where(eq(mensajes.direccion, 'saliente'))
    expect(salientes).toHaveLength(1)
    expect(salientes[0]?.idMensajeMeta).toBe('wamid.INTEG.360.ECHO.1')
    expect(salientes[0]?.cuerpo).toBe('Respuesta del asesor')

    const seguimientos = await baseDeDatos
      .select()
      .from(seguimientosProgramados)
      .orderBy(desc(seguimientosProgramados.creadoEn))
    expect(seguimientos[0]?.estado).toBe('cancelado')
    expect(seguimientos[0]?.motivoCancelacion).toBe('respuesta_asesor')

    const conversacionesGuardadas = await baseDeDatos.select().from(conversaciones)
    expect(conversacionesGuardadas[0]?.ultimoMensajeEn?.toISOString()).toBe(
      '2026-01-01T10:00:00.000Z',
    )
  })
})

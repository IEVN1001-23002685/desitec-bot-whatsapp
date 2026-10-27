import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { crearApp } from '../../src/app.js'
import { crearBaseDeDatos } from '../../src/shared/db/cliente-bd.js'
import { crearRegistrador } from '../../src/shared/logging/registrador.js'
import { CADENA_PRUEBA, sembrarCuentas, sembrarGuionLead, truncarTablas } from './base-datos.js'
import {
  construirCuerpoWebhook,
  firmar,
  mensajeTexto,
  ProveedorMensajesFalso,
  ResolverCredencialCuentaFalso,
} from '../helpers/en-memoria.js'
import { RepositorioDrizzleCuentaWhatsApp } from '../../src/modules/whatsapp/infrastructure/repositories/repositorio-drizzle-cuenta-whatsapp.js'
import { RepositorioDrizzleEventoWebhook } from '../../src/modules/whatsapp/infrastructure/repositories/repositorio-drizzle-evento-webhook.js'
import { RepositorioDrizzleEstadoMensaje } from '../../src/modules/whatsapp/infrastructure/repositories/repositorio-drizzle-estado-mensaje.js'
import { TransaccionDrizzleMensajeEntrante } from '../../src/modules/whatsapp/infrastructure/transactions/transaccion-drizzle-mensaje-entrante.js'
import { VerificarWebhookWhatsApp } from '../../src/modules/whatsapp/application/use-cases/verificar-webhook-whatsapp.js'
import { ResolverCuentaWhatsApp } from '../../src/modules/whatsapp/application/use-cases/resolver-cuenta-whatsapp.js'
import { RegistrarMensajeEntrante } from '../../src/modules/whatsapp/application/use-cases/registrar-mensaje-entrante.js'
import { RecibirEventoWhatsApp } from '../../src/modules/whatsapp/application/use-cases/recibir-evento-whatsapp.js'
import { EnviarMensajeSaliente } from '../../src/modules/whatsapp/application/use-cases/enviar-mensaje-saliente.js'
import { ProcesarMensajeAutorespuesta } from '../../src/modules/autorespuestas/application/use-cases/procesar-mensaje-autorespuesta.js'
import { RepositorioDrizzleGuionLead } from '../../src/modules/autorespuestas/infrastructure/repositories/repositorio-drizzle-guion-lead.js'
import { RepositorioDrizzleLead } from '../../src/modules/autorespuestas/infrastructure/repositories/repositorio-drizzle-lead.js'
import { leads, mensajes } from '../../src/shared/db/schema/index.js'
import { GUION_FLUJO_LEAD_INICIAL } from '../../src/shared/db/guion-flujo-lead-inicial.js'
import type { BaseDeDatos } from '../../src/shared/db/tipos.js'

const secretoApp = 'app-secret-123'

function textoGuion(clave: string): string {
  const entrada = GUION_FLUJO_LEAD_INICIAL.find((item) => item.clave === clave)
  if (!entrada) {
    throw new Error(`el guion inicial no tiene la clave ${clave}`)
  }
  return entrada.texto
}

function crearAppIntegracion(
  baseDeDatos: BaseDeDatos,
  proveedor: ProveedorMensajesFalso,
): FastifyInstance {
  const registrador = crearRegistrador('silent')
  const cuentas = new RepositorioDrizzleCuentaWhatsApp(baseDeDatos)
  const eventos = new RepositorioDrizzleEventoWebhook(baseDeDatos)
  const estados = new RepositorioDrizzleEstadoMensaje(baseDeDatos)
  const transaccion = new TransaccionDrizzleMensajeEntrante(baseDeDatos)
  const enviarMensaje = new EnviarMensajeSaliente(
    cuentas,
    transaccion,
    proveedor,
    new ResolverCredencialCuentaFalso(),
    {
      ventanaAtencionActiva: false,
    },
  )
  const procesadorAutorespuesta = new ProcesarMensajeAutorespuesta(
    new RepositorioDrizzleLead(baseDeDatos),
    new RepositorioDrizzleGuionLead(baseDeDatos),
    enviarMensaje,
  )

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
        undefined,
        procesadorAutorespuesta,
      ),
      secretoApp,
    },
  })
}

describe('Captura de leads contra PostgreSQL real', () => {
  let pool: Pool
  let baseDeDatos: BaseDeDatos
  let app: FastifyInstance
  let proveedor: ProveedorMensajesFalso

  beforeAll(() => {
    const conexion = crearBaseDeDatos(CADENA_PRUEBA)
    baseDeDatos = conexion.baseDeDatos
    pool = conexion.pool
    proveedor = new ProveedorMensajesFalso()
    app = crearAppIntegracion(baseDeDatos, proveedor)
  })

  afterAll(async () => {
    await app.close()
    await pool.end()
  })

  beforeEach(async () => {
    await truncarTablas(pool)
    await sembrarCuentas(baseDeDatos)
    await sembrarGuionLead(baseDeDatos)
    proveedor.envios.length = 0
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

  async function enviarMensaje(id: string, body: string): Promise<number> {
    return post(
      construirCuerpoWebhook({
        idNumeroTelefono: '111111111111111',
        messages: [mensajeTexto({ id, from: '5215512345678', body })],
      }),
    )
  }

  it('crea el lead y responde la bienvenida con el primer mensaje', async () => {
    expect(await enviarMensaje('wamid.BOT.1', 'Hola')).toBe(200)

    const filasLead = await baseDeDatos.select().from(leads)
    expect(filasLead).toHaveLength(1)
    expect(filasLead[0]).toMatchObject({ pasoActual: 'nombre', estado: 'capturando' })

    const salientes = await baseDeDatos
      .select()
      .from(mensajes)
      .where(eq(mensajes.direccion, 'saliente'))
    expect(salientes).toHaveLength(1)
    expect(salientes[0]?.cuerpo).toBe(textoGuion('bienvenida'))
  })

  it('captura producto, cantidad y ciudad desde el primer mensaje', async () => {
    expect(
      await enviarMensaje(
        'wamid.BOT.P1',
        'Hola, necesito cotizar 6 estaciones manuales para Querétaro',
      ),
    ).toBe(200)

    const filasLead = await baseDeDatos.select().from(leads)
    expect(filasLead[0]).toMatchObject({
      nombre: null,
      correo: null,
      modelos: 'estaciones manuales (6)',
      cantidad: 6,
      ciudad: 'Querétaro',
      pasoActual: 'nombre',
      estado: 'capturando',
    })

    const salientes = await baseDeDatos
      .select()
      .from(mensajes)
      .where(eq(mensajes.direccion, 'saliente'))
    expect(salientes).toHaveLength(1)
    expect(salientes[0]?.cuerpo).toBe(textoGuion('bienvenida'))

    expect(await enviarMensaje('wamid.BOT.P2', 'Ana')).toBe(200)
    expect(await enviarMensaje('wamid.BOT.P3', 'ana@example.com')).toBe(200)

    const filasFinales = await baseDeDatos.select().from(leads)
    expect(filasFinales[0]).toMatchObject({
      nombre: 'Ana',
      correo: 'ana@example.com',
      cantidad: 6,
      ciudad: 'Querétaro',
      estado: 'listo_pipedrive',
    })
    expect(proveedor.envios).toHaveLength(3)
    expect(proveedor.envios[2]).toMatchObject({
      tipo: 'text',
      cuerpo: textoGuion('confirmacion'),
    })
  })

  it('captura todos los datos y completa el lead', async () => {
    expect(await enviarMensaje('wamid.BOT.F1', 'Hola')).toBe(200)
    expect(await enviarMensaje('wamid.BOT.F2', 'Ana')).toBe(200)
    expect(await enviarMensaje('wamid.BOT.F3', 'ana@example.com')).toBe(200)
    expect(await enviarMensaje('wamid.BOT.F4', 'Modelo X')).toBe(200)
    expect(await enviarMensaje('wamid.BOT.F5', '3')).toBe(200)
    expect(await enviarMensaje('wamid.BOT.F6', 'Puebla')).toBe(200)

    const filasLead = await baseDeDatos.select().from(leads)
    expect(filasLead[0]).toMatchObject({
      nombre: 'Ana',
      correo: 'ana@example.com',
      modelos: 'Modelo X',
      cantidad: 3,
      ciudad: 'Puebla',
      estado: 'listo_pipedrive',
    })
    expect(filasLead[0]?.completadoEn).not.toBeNull()
    expect(proveedor.envios).toHaveLength(6)
    expect(proveedor.envios[5]).toMatchObject({ tipo: 'text', cuerpo: textoGuion('confirmacion') })
  })

  it('vuelve a pedir el correo invalido sin avanzar el paso', async () => {
    expect(await enviarMensaje('wamid.BOT.E1', 'Hola')).toBe(200)
    expect(await enviarMensaje('wamid.BOT.E2', 'Ana')).toBe(200)
    expect(await enviarMensaje('wamid.BOT.E3', 'correo-malo')).toBe(200)

    const filasLead = await baseDeDatos.select().from(leads)
    expect(filasLead[0]).toMatchObject({ correo: null, pasoActual: 'correo', estado: 'capturando' })
    expect(proveedor.envios[2]).toMatchObject({
      tipo: 'text',
      cuerpo: textoGuion('correo_invalido'),
    })
  })

  it('deriva a un asesor sin guardar la solicitud como dato del lead', async () => {
    expect(await enviarMensaje('wamid.BOT.A1', 'Hola')).toBe(200)
    expect(await enviarMensaje('wamid.BOT.A2', 'Ana')).toBe(200)
    expect(await enviarMensaje('wamid.BOT.A3', 'ana@example.com')).toBe(200)
    expect(await enviarMensaje('wamid.BOT.A4', 'Modelo X')).toBe(200)
    expect(await enviarMensaje('wamid.BOT.A5', 'Quiero hablar con una persona')).toBe(200)

    const filasLead = await baseDeDatos.select().from(leads)
    expect(filasLead[0]).toMatchObject({
      nombre: 'Ana',
      correo: 'ana@example.com',
      modelos: 'Modelo X',
      cantidad: null,
      pasoActual: 'cantidad',
      estado: 'en_asesor',
    })
    expect(proveedor.envios).toHaveLength(5)
    expect(proveedor.envios[4]).toMatchObject({
      tipo: 'text',
      cuerpo: textoGuion('paso_a_asesor'),
    })

    expect(await enviarMensaje('wamid.BOT.A6', '3')).toBe(200)

    expect(proveedor.envios).toHaveLength(5)
    const filasDespues = await baseDeDatos.select().from(leads)
    expect(filasDespues[0]).toMatchObject({ cantidad: null, estado: 'en_asesor' })
  })
})

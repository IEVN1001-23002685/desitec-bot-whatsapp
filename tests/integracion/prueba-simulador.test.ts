import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { crearApp } from '../../src/app.js'
import { crearBaseDeDatos } from '../../src/shared/db/cliente-bd.js'
import { crearRegistrador } from '../../src/shared/logging/registrador.js'
import { CADENA_PRUEBA, sembrarGuionLead, truncarTablas } from './base-datos.js'
import { cuentasWhatsApp } from '../../src/shared/db/schema/index.js'
import { ProcesarMensajeAutorespuesta } from '../../src/modules/autorespuestas/application/use-cases/procesar-mensaje-autorespuesta.js'
import { RepositorioDrizzleCuentaWhatsApp } from '../../src/modules/whatsapp/infrastructure/repositories/repositorio-drizzle-cuenta-whatsapp.js'
import { RepositorioDrizzleEventoWebhook } from '../../src/modules/whatsapp/infrastructure/repositories/repositorio-drizzle-evento-webhook.js'
import { RepositorioDrizzleEstadoMensaje } from '../../src/modules/whatsapp/infrastructure/repositories/repositorio-drizzle-estado-mensaje.js'
import { TransaccionDrizzleMensajeEntrante } from '../../src/modules/whatsapp/infrastructure/transactions/transaccion-drizzle-mensaje-entrante.js'
import { RepositorioDrizzleLead } from '../../src/modules/autorespuestas/infrastructure/repositories/repositorio-drizzle-lead.js'
import { RepositorioDrizzleGuionLead } from '../../src/modules/autorespuestas/infrastructure/repositories/repositorio-drizzle-guion-lead.js'
import { EnviarMensajeSaliente } from '../../src/modules/whatsapp/application/use-cases/enviar-mensaje-saliente.js'
import { RecibirEventoWhatsApp } from '../../src/modules/whatsapp/application/use-cases/recibir-evento-whatsapp.js'
import { ResolverCuentaWhatsApp } from '../../src/modules/whatsapp/application/use-cases/resolver-cuenta-whatsapp.js'
import { RegistrarMensajeEntrante } from '../../src/modules/whatsapp/application/use-cases/registrar-mensaje-entrante.js'
import { RegistrarMensajeSalienteHumano } from '../../src/modules/whatsapp/application/use-cases/registrar-mensaje-saliente-humano.js'
import { ProveedorSimuladoMensajes } from '../../src/modules/whatsapp/infrastructure/providers/proveedor-simulado-mensajes.js'
import { EnrutadorProveedorMensajes } from '../../src/modules/whatsapp/infrastructure/providers/enrutador-proveedor-mensajes.js'
import { ResolverCredencialCuentaEntorno } from '../../src/modules/whatsapp/infrastructure/resolvers/resolver-credencial-cuenta-entorno.js'
import { PausadorSeguimientosRespuesta } from '../../src/modules/followups/infrastructure/adapters/pausador-seguimientos-respuesta.js'
import { RepositorioDrizzleSeguimientoProgramado } from '../../src/modules/followups/infrastructure/repositories/repositorio-drizzle-seguimiento-programado.js'
import type { BaseDeDatos } from '../../src/shared/db/tipos.js'

const CODIGO_CUENTA = 'simulador'
const ID_NUMERO = 'sim-cuenta-000000000001'
const ID_WA = '5219999999999'

async function sembrarCuentaSimulador(baseDeDatos: BaseDeDatos): Promise<void> {
  await baseDeDatos
    .insert(cuentasWhatsApp)
    .values({
      codigo: CODIGO_CUENTA,
      nombreComercial: 'Cuenta Simulada',
      idNumeroTelefono: ID_NUMERO,
      telefonoVisible: '+5210000000000',
      tokenAcceso: 'sim-token',
      proveedor: '360dialog',
      credencialRef: null,
      webhookSecretRef: null,
      estaActiva: true,
    })
    .onConflictDoNothing({ target: cuentasWhatsApp.codigo })
}

describe('simulador de conversaciones (integracion)', () => {
  let pool: Pool
  let baseDeDatos: BaseDeDatos
  let app: FastifyInstance

  beforeAll(() => {
    const conexion = crearBaseDeDatos(CADENA_PRUEBA)
    baseDeDatos = conexion.baseDeDatos
    pool = conexion.pool

    const registrador = crearRegistrador('silent')
    const cuentas = new RepositorioDrizzleCuentaWhatsApp(baseDeDatos)
    const eventos = new RepositorioDrizzleEventoWebhook(baseDeDatos)
    const estados = new RepositorioDrizzleEstadoMensaje(baseDeDatos)
    const transaccion = new TransaccionDrizzleMensajeEntrante(baseDeDatos)
    const proveedor = new EnrutadorProveedorMensajes({
      meta: new ProveedorSimuladoMensajes({ registrador }),
      '360dialog': new ProveedorSimuladoMensajes({ registrador }),
    })
    const enviarMensaje = new EnviarMensajeSaliente(
      cuentas,
      transaccion,
      proveedor,
      new ResolverCredencialCuentaEntorno(),
      { ventanaAtencionActiva: false },
    )
    const seguimientosProgramados = new RepositorioDrizzleSeguimientoProgramado(baseDeDatos)
    const pausador = new PausadorSeguimientosRespuesta(seguimientosProgramados)
    const procesadorAutorespuesta = new ProcesarMensajeAutorespuesta(
      new RepositorioDrizzleLead(baseDeDatos),
      new RepositorioDrizzleGuionLead(baseDeDatos),
      enviarMensaje,
      [],
      pausador,
      registrador,
    )

    const recibirEvento = new RecibirEventoWhatsApp(
      eventos,
      new ResolverCuentaWhatsApp(cuentas),
      new RegistrarMensajeEntrante(transaccion),
      estados,
      registrador,
      pausador,
      procesadorAutorespuesta,
      new RegistrarMensajeSalienteHumano(transaccion),
    )

    app = crearApp({
      registrador,
      simulador: {
        baseDeDatos,
        recibirEvento,
        codigoCuenta: CODIGO_CUENTA,
        idNumeroTelefono: ID_NUMERO,
        telefonoVisible: '+5210000000000',
        idWaSimulado: ID_WA,
        nombreContacto: 'Cliente Simulado',
      },
    })
  })

  afterAll(async () => {
    await app.close()
    await pool.end()
  })

  beforeEach(async () => {
    await truncarTablas(pool)
    await sembrarGuionLead(baseDeDatos)
    await sembrarCuentaSimulador(baseDeDatos)
  })

  it('sirve la interfaz web del simulador', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/simulador' })
    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.headers['content-type']).toContain('text/html')
    expect(respuesta.body).toContain('Simulador de conversaciones')
  })

  it('persiste inbound y respuesta simulada sin llamadas externas', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/simulador/mensaje',
      payload: { texto: 'Hola' },
    })
    expect(respuesta.statusCode).toBe(200)
    const datos = respuesta.json()
    expect(datos.mensajes).toHaveLength(2)
    expect(datos.mensajes[0].direccion).toBe('entrante')
    expect(datos.mensajes[1].direccion).toBe('saliente')
    expect(datos.mensajes[1].direccion).toBe('saliente')
  })

  it('completa una conversacion y marca el lead listo_pipedrive', async () => {
    const pasos = ['Hola', 'Ana', 'ana@example.com', 'Modelo X', '3', 'Puebla']
    let ultimo: unknown
    for (const texto of pasos) {
      const respuesta = await app.inject({
        method: 'POST',
        url: '/api/simulador/mensaje',
        payload: { texto },
      })
      expect(respuesta.statusCode).toBe(200)
      ultimo = respuesta.json()
    }
    const ultimoObj = ultimo as { lead?: Record<string, unknown> }
    expect(ultimoObj.lead).toMatchObject({
      nombre: 'Ana',
      correo: 'ana@example.com',
    })
  })

  it('reinicia solo la conversacion sintetica y conserva otros datos', async () => {
    await app.inject({ method: 'POST', url: '/api/simulador/mensaje', payload: { texto: 'Hola' } })

    // Insertar una conversacion ajena
    const [contactoAjeno] = await baseDeDatos
      .insert((await import('../../src/shared/db/schema/contactos.js')).contactos)
      .values({ idWa: '5210000000001', nombrePerfil: 'Ajeno' })
      .returning()
    const [cuenta] = await baseDeDatos
      .select()
      .from(cuentasWhatsApp)
      .where(eq(cuentasWhatsApp.codigo, CODIGO_CUENTA))
      .limit(1)
    if (!cuenta || !contactoAjeno) {
      throw new Error('no se pudo preparar la conversacion ajena')
    }
    await baseDeDatos
      .insert((await import('../../src/shared/db/schema/conversaciones.js')).conversaciones)
      .values({
        idCuentaWhatsApp: cuenta.id,
        idContacto: contactoAjeno.id,
        estado: 'abierta',
        ultimoMensajeEn: new Date(),
      })

    const respuesta = await app.inject({ method: 'POST', url: '/api/simulador/reiniciar' })
    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json().reiniciado).toBe(true)

    const estado = await app.inject({ method: 'GET', url: '/api/simulador/estado' })
    expect(estado.json().mensajes).toHaveLength(0)
    expect(estado.json().lead).toBeNull()

    const conversacionesAjena = await baseDeDatos
      .select()
      .from((await import('../../src/shared/db/schema/conversaciones.js')).conversaciones)
    expect(conversacionesAjena.length).toBeGreaterThanOrEqual(1)
  })
})

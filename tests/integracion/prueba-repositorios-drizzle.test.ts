import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Pool } from 'pg'
import { crearBaseDeDatos } from '../../src/shared/db/cliente-bd.js'
import { CADENA_PRUEBA, sembrarCuentas, truncarTablas } from './base-datos.js'
import { RepositorioDrizzleCuentaWhatsApp } from '../../src/modules/whatsapp/infrastructure/repositories/repositorio-drizzle-cuenta-whatsapp.js'
import { RepositorioDrizzleEventoWebhook } from '../../src/modules/whatsapp/infrastructure/repositories/repositorio-drizzle-evento-webhook.js'
import { RepositorioDrizzleEstadoMensaje } from '../../src/modules/whatsapp/infrastructure/repositories/repositorio-drizzle-estado-mensaje.js'
import { RepositorioDrizzleContacto } from '../../src/modules/contacts/infrastructure/repositories/repositorio-drizzle-contacto.js'
import { RepositorioDrizzleConversacion } from '../../src/modules/conversations/infrastructure/repositories/repositorio-drizzle-conversacion.js'
import { RepositorioDrizzleMensaje } from '../../src/modules/conversations/infrastructure/repositories/repositorio-drizzle-mensaje.js'
import {
  contactos,
  conversaciones,
  cuentasWhatsApp,
  mensajes,
} from '../../src/shared/db/schema/index.js'
import type { BaseDeDatos } from '../../src/shared/db/tipos.js'

describe('Repositorios Drizzle contra PostgreSQL real', () => {
  let pool: Pool
  let baseDeDatos: BaseDeDatos

  beforeAll(() => {
    const conexion = crearBaseDeDatos(CADENA_PRUEBA)
    baseDeDatos = conexion.baseDeDatos
    pool = conexion.pool
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(async () => {
    await truncarTablas(pool)
    await sembrarCuentas(baseDeDatos)
  })

  it('cuenta whatsapp: busca por id de numero y lista activas', async () => {
    const repositorio = new RepositorioDrizzleCuentaWhatsApp(baseDeDatos)

    const comercial = await repositorio.buscarPorIdNumeroTelefono('111111111111111')
    expect(comercial).not.toBeNull()
    expect(comercial?.codigo).toBe('linea-comercial')
    expect(comercial?.estaActiva).toBe(true)

    expect(await repositorio.listarActivas()).toHaveLength(3)

    await baseDeDatos
      .update(cuentasWhatsApp)
      .set({ estaActiva: false, actualizadoEn: new Date() })
      .where(eq(cuentasWhatsApp.codigo, 'linea-soporte'))

    expect(await repositorio.buscarPorIdNumeroTelefono('222222222222222')).toBeNull()
    expect(await repositorio.listarActivas()).toHaveLength(2)
  })

  it('contacto: crea y reutiliza por idWa', async () => {
    let idCreado = ''
    await baseDeDatos.transaction(async (transaccion) => {
      const repositorio = new RepositorioDrizzleContacto(transaccion)
      const creado = await repositorio.crear({ idWa: '5215512345678', nombrePerfil: 'Cliente' })
      idCreado = creado.id
      expect(creado.idWa).toBe('5215512345678')

      const encontrado = await repositorio.buscarPorIdWa('5215512345678')
      expect(encontrado?.id).toBe(creado.id)

      const repetido = await repositorio.crear({
        idWa: '5215512345678',
        nombrePerfil: 'Cliente',
      })
      expect(repetido.id).toBe(creado.id)
    })

    expect(idCreado).not.toBe('')
    expect((await baseDeDatos.select().from(contactos))).toHaveLength(1)
  })

  it('conversacion: crea por cuenta+contacto, es idempotente y actualiza el ultimo mensaje', async () => {
    const cuenta = await new RepositorioDrizzleCuentaWhatsApp(baseDeDatos).buscarPorIdNumeroTelefono(
      '111111111111111',
    )
    if (!cuenta) {
      throw new Error('cuenta no sembrada')
    }

    let idConversacion = ''
    await baseDeDatos.transaction(async (transaccion) => {
      const contacto = await new RepositorioDrizzleContacto(transaccion).crear({
        idWa: '5215512345678',
        nombrePerfil: null,
      })
      const repositorio = new RepositorioDrizzleConversacion(transaccion)
      const en = new Date('2026-01-01T10:00:00.000Z')

      const creada = await repositorio.crear({
        idCuentaWhatsApp: cuenta.id,
        idContacto: contacto.id,
        en,
      })
      idConversacion = creada.id
      expect(creada.estado).toBe('abierta')

      const repetida = await repositorio.crear({
        idCuentaWhatsApp: cuenta.id,
        idContacto: contacto.id,
        en,
      })
      expect(repetida.id).toBe(creada.id)

      const en2 = new Date('2026-01-02T10:00:00.000Z')
      await repositorio.actualizarUltimoMensaje(creada.id, en2)

      const actualizada = await repositorio.buscarPorCuentaYContacto(cuenta.id, contacto.id)
      expect(actualizada?.ultimoMensajeEn?.toISOString()).toBe(en2.toISOString())
    })

    expect(idConversacion).not.toBe('')
    expect((await baseDeDatos.select().from(conversaciones))).toHaveLength(1)
  })

  it('mensaje: inserta un mensaje entrante y no duplica por idMensajeMeta', async () => {
    const resultados: boolean[] = await baseDeDatos.transaction(async (transaccion) => {
      const cuenta = await new RepositorioDrizzleCuentaWhatsApp(baseDeDatos).buscarPorIdNumeroTelefono(
        '111111111111111',
      )
      if (!cuenta) {
        throw new Error('cuenta no sembrada')
      }
      const contacto = await new RepositorioDrizzleContacto(transaccion).crear({
        idWa: '5215512345678',
        nombrePerfil: null,
      })
      const conversacion = await new RepositorioDrizzleConversacion(transaccion).crear({
        idCuentaWhatsApp: cuenta.id,
        idContacto: contacto.id,
        en: new Date(),
      })
      const repositorio = new RepositorioDrizzleMensaje(transaccion)
      const entrada = {
        idConversacion: conversacion.id,
        idCuentaWhatsApp: cuenta.id,
        idMensajeMeta: 'wamid.INTEG.1',
        tipo: 'text',
        cuerpo: 'Hola',
        cargaUtil: { id: 'wamid.INTEG.1', from: '5215512345678' },
        marcaTiempoMeta: new Date(),
      }

      const primero = await repositorio.insertarEntrante(entrada)
      const segundo = await repositorio.insertarEntrante(entrada)
      expect(segundo.id).toBe(primero.id)
      return [primero.insertado, segundo.insertado]
    })

    expect(resultados).toEqual([true, false])
    expect((await baseDeDatos.select().from(mensajes))).toHaveLength(1)
  })

  it('estado de mensaje: actualiza por idMensajeMeta y devuelve false si no existe', async () => {
    await baseDeDatos.transaction(async (transaccion) => {
      const cuenta = await new RepositorioDrizzleCuentaWhatsApp(baseDeDatos).buscarPorIdNumeroTelefono(
        '111111111111111',
      )
      if (!cuenta) {
        throw new Error('cuenta no sembrada')
      }
      const contacto = await new RepositorioDrizzleContacto(transaccion).crear({
        idWa: '5215512345678',
        nombrePerfil: null,
      })
      const conversacion = await new RepositorioDrizzleConversacion(transaccion).crear({
        idCuentaWhatsApp: cuenta.id,
        idContacto: contacto.id,
        en: new Date(),
      })
      await new RepositorioDrizzleMensaje(transaccion).insertarEntrante({
        idConversacion: conversacion.id,
        idCuentaWhatsApp: cuenta.id,
        idMensajeMeta: 'wamid.INTEG.ESTADO.1',
        tipo: 'text',
        cuerpo: 'Hola',
        cargaUtil: null,
        marcaTiempoMeta: null,
      })
    })

    const repositorio = new RepositorioDrizzleEstadoMensaje(baseDeDatos)
    expect(await repositorio.actualizarEstado('wamid.INTEG.ESTADO.1', 'delivered')).toBe(true)
    expect(await repositorio.actualizarEstado('wamid.INTEG.DESCONOCIDO', 'failed')).toBe(false)

    const filas = await baseDeDatos
      .select()
      .from(mensajes)
      .where(eq(mensajes.idMensajeMeta, 'wamid.INTEG.ESTADO.1'))
    expect(filas[0]?.estado).toBe('delivered')
  })

  it('evento de webhook: registra una sola vez y actualiza el estado', async () => {
    const repositorio = new RepositorioDrizzleEventoWebhook(baseDeDatos)
    const entrada = {
      claveEvento: 'clave-integrador-1',
      tipoObjeto: 'whatsapp_business_account',
      cargaUtilOriginal: { object: 'whatsapp_business_account' },
    }

    const primero = await repositorio.intentarRegistrar(entrada)
    expect(primero.insertado).toBe(true)

    const segundo = await repositorio.intentarRegistrar(entrada)
    expect(segundo.insertado).toBe(false)
    expect(segundo.id).toBe(primero.id)

    const buscado = await repositorio.buscarPorClaveEvento('clave-integrador-1')
    expect(buscado?.estado).toBe('recibido')

    await repositorio.marcarEstado('clave-integrador-1', 'procesado', null)
    const procesado = await repositorio.buscarPorClaveEvento('clave-integrador-1')
    expect(procesado?.estado).toBe('procesado')
  })
})
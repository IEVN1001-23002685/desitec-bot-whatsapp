import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Pool } from 'pg'
import { crearBaseDeDatos } from '../../src/shared/db/cliente-bd.js'
import { CADENA_PRUEBA, sembrarCuentas, truncarTablas } from './base-datos.js'
import { RepositorioDrizzleCuentaWhatsApp } from '../../src/modules/whatsapp/infrastructure/repositories/repositorio-drizzle-cuenta-whatsapp.js'
import { TransaccionDrizzleMensajeEntrante } from '../../src/modules/whatsapp/infrastructure/transactions/transaccion-drizzle-mensaje-entrante.js'
import { RepositorioDrizzleContacto } from '../../src/modules/contacts/infrastructure/repositories/repositorio-drizzle-contacto.js'
import { RepositorioDrizzleConversacion } from '../../src/modules/conversations/infrastructure/repositories/repositorio-drizzle-conversacion.js'
import { RepositorioDrizzleDestinoSeguimiento } from '../../src/modules/followups/infrastructure/repositories/repositorio-drizzle-destino-seguimiento.js'
import { RepositorioDrizzlePlantilla } from '../../src/modules/followups/infrastructure/repositories/repositorio-drizzle-plantilla.js'
import { RepositorioDrizzleReglaSeguimiento } from '../../src/modules/followups/infrastructure/repositories/repositorio-drizzle-regla-seguimiento.js'
import { RepositorioDrizzleSeguimientoProgramado } from '../../src/modules/followups/infrastructure/repositories/repositorio-drizzle-seguimiento-programado.js'
import { VerificadorEstadoComercialLocal } from '../../src/modules/followups/infrastructure/verificadores/verificador-estado-comercial-local.js'
import { EnviarSeguimientoProgramado } from '../../src/modules/followups/application/use-cases/enviar-seguimiento-programado.js'
import { ProcesarSeguimientosPendientes } from '../../src/modules/followups/application/use-cases/procesar-seguimientos-pendientes.js'
import {
  cuentasWhatsApp,
  mensajes,
  plantillasWhatsApp,
  reglasSeguimiento,
} from '../../src/shared/db/schema/index.js'
import { ProveedorMensajesFalso } from '../helpers/en-memoria.js'
import type { BaseDeDatos } from '../../src/shared/db/tipos.js'

type Escenario = {
  idConversacion: string
  idPlantilla: string
  idRegla: string
}

async function sembrarEscenario(
  baseDeDatos: BaseDeDatos,
  parametros: string[] = [],
): Promise<Escenario> {
  const cuenta = await new RepositorioDrizzleCuentaWhatsApp(baseDeDatos).buscarPorCodigo(
    'linea-comercial',
  )
  if (!cuenta) {
    throw new Error('cuenta no sembrada')
  }

  const { idConversacion } = await baseDeDatos.transaction(async (transaccion) => {
    const contacto = await new RepositorioDrizzleContacto(transaccion).crear({
      idWa: '5215512345678',
      nombrePerfil: 'Cliente',
    })
    const conversacion = await new RepositorioDrizzleConversacion(transaccion).crear({
      idCuentaWhatsApp: cuenta.id,
      idContacto: contacto.id,
      en: new Date(),
    })
    return { idConversacion: conversacion.id }
  })

  const [plantilla] = await baseDeDatos
    .insert(plantillasWhatsApp)
    .values({
      codigo: 'seguimiento_24h',
      nombreMeta: 'seguimiento_24h',
      idioma: 'es_ES',
      categoria: 'marketing',
      componentes: { type: 'body', text: 'Hola' },
    })
    .returning()
  if (!plantilla) {
    throw new Error('no se pudo crear la plantilla')
  }

  const [regla] = await baseDeDatos
    .insert(reglasSeguimiento)
    .values({
      codigo: 'seguimiento_24h',
      nombre: 'Seguimiento 24h',
      idCuentaWhatsApp: cuenta.id,
      demoraHoras: 24,
      idPlantilla: plantilla.id,
      cuerpo: 'Seguimiento a las 24 horas',
      parametros,
    })
    .returning()
  if (!regla) {
    throw new Error('no se pudo crear la regla')
  }

  return { idConversacion, idPlantilla: plantilla.id, idRegla: regla.id }
}

describe('Seguimientos contra PostgreSQL real', () => {
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

  it('destino de seguimiento: resuelve telefono, token y contacto de la conversacion', async () => {
    const escenario = await sembrarEscenario(baseDeDatos)
    const destino = await new RepositorioDrizzleDestinoSeguimiento(baseDeDatos).obtenerDestino(
      escenario.idConversacion,
    )

    expect(destino).not.toBeNull()
    expect(destino?.idNumeroTelefono).toBe('111111111111111')
    expect(destino?.tokenAcceso).toBe('token-comercial')
    expect(destino?.idWa).toBe('5215512345678')
    expect(destino?.nombreContacto).toBe('Cliente')
    expect(destino?.nombreCuenta).toBe('Linea Comercial')
    expect(destino?.telefonoVisible).toBe('+5210000000001')

    const inexistente = await new RepositorioDrizzleDestinoSeguimiento(baseDeDatos).obtenerDestino(
      '00000000-0000-4000-8000-000000000000',
    )
    expect(inexistente).toBeNull()
  })

  it('procesa un seguimiento pendiente con plantilla y persiste el saliente', async () => {
    const escenario = await sembrarEscenario(baseDeDatos)
    const seguimientos = new RepositorioDrizzleSeguimientoProgramado(baseDeDatos)
    const programado = await seguimientos.programar({
      idConversacion: escenario.idConversacion,
      idReglaSeguimiento: escenario.idRegla,
      programadoPara: new Date(Date.now() - 60_000),
    })

    const proveedor = new ProveedorMensajesFalso({ idMensajeMeta: 'wamid.INTEG.SEG.1' })
    const enviarSeguimiento = new EnviarSeguimientoProgramado(
      new RepositorioDrizzleReglaSeguimiento(baseDeDatos),
      new RepositorioDrizzlePlantilla(baseDeDatos),
      new RepositorioDrizzleDestinoSeguimiento(baseDeDatos),
      new VerificadorEstadoComercialLocal(),
      proveedor,
      new TransaccionDrizzleMensajeEntrante(baseDeDatos),
    )
    const procesar = new ProcesarSeguimientosPendientes(seguimientos, enviarSeguimiento)

    const resultado = await procesar.ejecutar({ limite: 10 })

    expect(resultado).toEqual({ procesados: 1, enviados: 1, fallidos: 0, cancelados: 0 })
    expect(proveedor.envios[0]).toMatchObject({
      tipo: 'template',
      nombrePlantilla: 'seguimiento_24h',
    })

    const actualizado = await seguimientos.obtenerPorId(programado.id)
    expect(actualizado?.estado).toBe('enviado')
    expect(actualizado?.idMensajeMeta).toBe('wamid.INTEG.SEG.1')

    const salientes = await baseDeDatos
      .select()
      .from(mensajes)
      .where(eq(mensajes.direccion, 'saliente'))
    expect(salientes).toHaveLength(1)
    expect(salientes[0]?.idMensajeMeta).toBe('wamid.INTEG.SEG.1')
  })

  it('resuelve los parametros de la regla con los datos reales de la conversacion', async () => {
    const escenario = await sembrarEscenario(baseDeDatos, ['Hola {{nombre}} de {{cuenta}}'])
    const seguimientos = new RepositorioDrizzleSeguimientoProgramado(baseDeDatos)
    await seguimientos.programar({
      idConversacion: escenario.idConversacion,
      idReglaSeguimiento: escenario.idRegla,
      programadoPara: new Date(Date.now() - 60_000),
    })

    const proveedor = new ProveedorMensajesFalso()
    const enviarSeguimiento = new EnviarSeguimientoProgramado(
      new RepositorioDrizzleReglaSeguimiento(baseDeDatos),
      new RepositorioDrizzlePlantilla(baseDeDatos),
      new RepositorioDrizzleDestinoSeguimiento(baseDeDatos),
      new VerificadorEstadoComercialLocal(),
      proveedor,
      new TransaccionDrizzleMensajeEntrante(baseDeDatos),
    )
    const procesar = new ProcesarSeguimientosPendientes(seguimientos, enviarSeguimiento)

    const resultado = await procesar.ejecutar({ limite: 10 })

    expect(resultado.enviados).toBe(1)
    expect(proveedor.envios[0]).toMatchObject({
      tipo: 'template',
      parametros: [{ tipo: 'text', texto: 'Hola Cliente de Linea Comercial' }],
    })
  })

  it('marca fallido cuando la cuenta no tiene token de acceso', async () => {
    const cuenta = await new RepositorioDrizzleCuentaWhatsApp(baseDeDatos).buscarPorCodigo(
      'linea-comercial',
    )
    if (!cuenta) throw new Error('cuenta no sembrada')

    const { idConversacion, idRegla } = await baseDeDatos.transaction(async (transaccion) => {
      const contacto = await new RepositorioDrizzleContacto(transaccion).crear({
        idWa: '5215598765432',
        nombrePerfil: 'Sin Token',
      })
      const conversacion = await new RepositorioDrizzleConversacion(transaccion).crear({
        idCuentaWhatsApp: cuenta.id,
        idContacto: contacto.id,
        en: new Date(),
      })

      await baseDeDatos
        .update(cuentasWhatsApp)
        .set({ tokenAcceso: null })
        .where(eq(cuentasWhatsApp.id, cuenta.id))

      const [plantilla] = await baseDeDatos
        .insert(plantillasWhatsApp)
        .values({
          codigo: 'plantilla_sin_token',
          nombreMeta: 'plantilla_sin_token',
          idioma: 'es_ES',
          categoria: 'marketing',
          componentes: { type: 'body', text: 'Hola' },
        })
        .returning()
      if (!plantilla) throw new Error('no se pudo crear la plantilla')

      const [regla] = await baseDeDatos
        .insert(reglasSeguimiento)
        .values({
          codigo: 'plantilla_sin_token',
          nombre: 'Plantilla Sin Token',
          idCuentaWhatsApp: cuenta.id,
          demoraHoras: 1,
          idPlantilla: plantilla.id,
          cuerpo: 'Cuerpo alternativo',
        })
        .returning()
      if (!regla) throw new Error('no se pudo crear la regla')

      return { idConversacion: conversacion.id, idRegla: regla.id }
    })

    const seguimientos = new RepositorioDrizzleSeguimientoProgramado(baseDeDatos)
    const programado = await seguimientos.programar({
      idConversacion,
      idReglaSeguimiento: idRegla,
      programadoPara: new Date(Date.now() - 60_000),
    })

    const proveedor = new ProveedorMensajesFalso()
    const enviarSeguimiento = new EnviarSeguimientoProgramado(
      new RepositorioDrizzleReglaSeguimiento(baseDeDatos),
      new RepositorioDrizzlePlantilla(baseDeDatos),
      new RepositorioDrizzleDestinoSeguimiento(baseDeDatos),
      new VerificadorEstadoComercialLocal(),
      proveedor,
      new TransaccionDrizzleMensajeEntrante(baseDeDatos),
    )
    const procesar = new ProcesarSeguimientosPendientes(seguimientos, enviarSeguimiento)

    const resultado = await procesar.ejecutar({ limite: 10 })

    expect(resultado).toEqual({ procesados: 1, enviados: 0, fallidos: 1, cancelados: 0 })
    expect(proveedor.envios).toHaveLength(0)

    const actualizado = await seguimientos.obtenerPorId(programado.id)
    expect(actualizado?.estado).toBe('fallido')
    expect(actualizado?.error).toContain('token')
  })
})

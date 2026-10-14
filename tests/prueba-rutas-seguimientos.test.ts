import { describe, expect, it } from 'vitest'
import { crearAppPrueba, cuentasPrueba } from './helpers/en-memoria.js'
import type { ReglaSeguimiento } from '../src/modules/followups/domain/entities/regla-seguimiento.js'

const CLAVE = 'clave-interna-test'

function regla(sobrescrituras: Partial<ReglaSeguimiento> = {}): ReglaSeguimiento {
  return {
    id: 'regla-1',
    codigo: 'seguimiento_24h',
    nombre: 'Seguimiento 24h',
    idCuentaWhatsApp: 'cuenta-comercial',
    demoraHoras: 24,
    idPlantilla: null,
    cuerpo: 'Seguimiento',
    activa: true,
    ...sobrescrituras,
  }
}

describe('POST /api/seguimientos', () => {
  it('programa seguimientos para las reglas activas con la clave correcta', async () => {
    const { app, almacen } = crearAppPrueba({
      cuentas: cuentasPrueba(),
      claveInterna: CLAVE,
      reglasSeguimiento: [regla()],
    })

    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/seguimientos',
      headers: { 'x-api-key-interna': CLAVE },
      payload: { idConversacion: '11111111-1111-4111-8111-111111111111' },
    })

    expect(respuesta.statusCode).toBe(201)
    expect(respuesta.json()).toEqual({ programados: 1 })
    expect(almacen.seguimientosProgramados).toHaveLength(1)
    expect(almacen.seguimientosProgramados[0]).toMatchObject({
      idConversacion: '11111111-1111-4111-8111-111111111111',
      idReglaSeguimiento: 'regla-1',
      estado: 'pendiente',
      intentos: 0,
    })
  })

  it('rechaza con 401 cuando falta la cabecera de clave interna', async () => {
    const { app } = crearAppPrueba({
      cuentas: cuentasPrueba(),
      claveInterna: CLAVE,
      reglasSeguimiento: [regla()],
    })

    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/seguimientos',
      payload: { idConversacion: '11111111-1111-4111-8111-111111111111' },
    })

    expect(respuesta.statusCode).toBe(401)
    expect(respuesta.json()).toEqual({ error: 'UNAUTHORIZED' })
  })

  it('responde 400 con un cuerpo malformado', async () => {
    const { app } = crearAppPrueba({
      cuentas: cuentasPrueba(),
      claveInterna: CLAVE,
      reglasSeguimiento: [regla()],
    })

    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/seguimientos',
      headers: { 'x-api-key-interna': CLAVE },
      payload: { idConversacion: 'no-es-uuid' },
    })

    expect(respuesta.statusCode).toBe(400)
    expect(respuesta.json()).toEqual({ error: 'VALIDATION_ERROR' })
  })

  it('no registra el endpoint cuando no hay clave interna configurada', async () => {
    const { app } = crearAppPrueba({
      cuentas: cuentasPrueba(),
      reglasSeguimiento: [regla()],
    })

    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/seguimientos',
      headers: { 'x-api-key-interna': CLAVE },
      payload: { idConversacion: '11111111-1111-4111-8111-111111111111' },
    })

    expect(respuesta.statusCode).toBe(404)
    expect(respuesta.json()).toEqual({ error: 'NOT_FOUND' })
  })
})

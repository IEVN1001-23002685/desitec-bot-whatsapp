import { describe, expect, it } from 'vitest'
import { ProveedorMensajesFalso, crearAppPrueba, cuentasPrueba } from './helpers/en-memoria.js'

const CLAVE = 'clave-interna-test'
const CUERPO = {
  codigoCuenta: 'linea-comercial',
  idWa: '5215512345678',
  cuerpo: 'Hola cliente',
}

describe('POST /api/mensajes', () => {
  it('envia y persiste el mensaje saliente con la clave correcta', async () => {
    const proveedor = new ProveedorMensajesFalso({ idMensajeMeta: 'wamid.RUTA.1' })
    const { app, almacen } = crearAppPrueba({
      cuentas: cuentasPrueba(),
      claveInterna: CLAVE,
      proveedor,
    })

    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/mensajes',
      headers: { 'x-api-key-interna': CLAVE },
      payload: CUERPO,
    })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json()).toMatchObject({ enviado: true, idMensajeMeta: 'wamid.RUTA.1' })
    expect(proveedor.envios).toHaveLength(1)
    expect(almacen.mensajes).toHaveLength(1)
    expect(almacen.mensajes[0]).toMatchObject({ direccion: 'saliente', estado: 'enviado' })
  })

  it('rechaza con 401 cuando falta la cabecera de clave interna', async () => {
    const { app } = crearAppPrueba({ cuentas: cuentasPrueba(), claveInterna: CLAVE })

    const respuesta = await app.inject({ method: 'POST', url: '/api/mensajes', payload: CUERPO })

    expect(respuesta.statusCode).toBe(401)
    expect(respuesta.json()).toEqual({ error: 'UNAUTHORIZED' })
  })

  it('rechaza con 401 cuando la clave interna es incorrecta', async () => {
    const { app } = crearAppPrueba({ cuentas: cuentasPrueba(), claveInterna: CLAVE })

    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/mensajes',
      headers: { 'x-api-key-interna': 'clave-equivocada-de-distinta-longitud' },
      payload: CUERPO,
    })

    expect(respuesta.statusCode).toBe(401)
    expect(respuesta.json()).toEqual({ error: 'UNAUTHORIZED' })
  })

  it('responde 400 con un cuerpo malformado', async () => {
    const { app } = crearAppPrueba({ cuentas: cuentasPrueba(), claveInterna: CLAVE })

    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/mensajes',
      headers: { 'x-api-key-interna': CLAVE },
      payload: { codigoCuenta: 'linea-comercial', idWa: 'no-numerico', cuerpo: '' },
    })

    expect(respuesta.statusCode).toBe(400)
    expect(respuesta.json()).toEqual({ error: 'VALIDATION_ERROR' })
  })

  it('responde 409 cuando la ventana de atencion esta activa y no hay entrantes', async () => {
    const { app } = crearAppPrueba({
      cuentas: cuentasPrueba(),
      claveInterna: CLAVE,
      ventanaAtencionActiva: true,
    })

    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/mensajes',
      headers: { 'x-api-key-interna': CLAVE },
      payload: CUERPO,
    })

    expect(respuesta.statusCode).toBe(409)
    expect(respuesta.json()).toEqual({ error: 'WINDOW_CLOSED' })
  })

  it('no registra el endpoint cuando no hay clave interna configurada', async () => {
    const { app } = crearAppPrueba({ cuentas: cuentasPrueba() })

    const respuesta = await app.inject({
      method: 'POST',
      url: '/api/mensajes',
      headers: { 'x-api-key-interna': CLAVE },
      payload: CUERPO,
    })

    expect(respuesta.statusCode).toBe(404)
    expect(respuesta.json()).toEqual({ error: 'NOT_FOUND' })
  })
})

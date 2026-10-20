import { describe, expect, it } from 'vitest'
import { EnviarMensajeSaliente } from '../src/modules/whatsapp/application/use-cases/enviar-mensaje-saliente.js'
import { ErrorDeEnvioMensaje } from '../src/shared/errors/error-de-app.js'
import {
  AlmacenEnMemoria,
  ProveedorMensajesFalso,
  RepositorioCuentaWhatsAppEnMemoria,
  ResolverCredencialCuentaFalso,
  TransaccionMensajeEntranteEnMemoria,
  cuentasPrueba,
} from './helpers/en-memoria.js'
import type { CuentaWhatsApp } from '../src/modules/whatsapp/domain/entities/cuenta-whatsapp.js'

const AHORA = new Date('2026-06-01T12:00:00.000Z')
const HORA_MS = 3_600_000

function crearCaso(
  almacen: AlmacenEnMemoria,
  proveedor: ProveedorMensajesFalso,
  opciones: { ventanaAtencionActiva: boolean; cuentas?: CuentaWhatsApp[] },
): EnviarMensajeSaliente {
  return new EnviarMensajeSaliente(
    new RepositorioCuentaWhatsAppEnMemoria(opciones.cuentas ?? cuentasPrueba()),
    new TransaccionMensajeEntranteEnMemoria(almacen),
    proveedor,
    new ResolverCredencialCuentaFalso(),
    { ventanaAtencionActiva: opciones.ventanaAtencionActiva },
  )
}

function sembrarEntrante(almacen: AlmacenEnMemoria, creadoEn: Date, idWa = '5215512345678'): void {
  almacen.contactos.push({ id: 'contacto-1', idWa, nombrePerfil: null })
  almacen.conversaciones.push({
    id: 'conversacion-1',
    idCuentaWhatsApp: 'cuenta-comercial',
    idContacto: 'contacto-1',
    estado: 'abierta',
    ultimoMensajeEn: creadoEn,
  })
  almacen.mensajes.push({
    id: 'mensaje-1',
    idConversacion: 'conversacion-1',
    idCuentaWhatsApp: 'cuenta-comercial',
    direccion: 'entrante',
    idMensajeMeta: 'wamid.ENTRANTE.1',
    tipo: 'text',
    cuerpo: 'Hola',
    estado: null,
    creadoEn,
  })
}

describe('EnviarMensajeSaliente', () => {
  it('envia y persiste el mensaje saliente con la ventana desactivada', async () => {
    const almacen = new AlmacenEnMemoria()
    const proveedor = new ProveedorMensajesFalso({ idMensajeMeta: 'wamid.SAL.1' })
    const caso = crearCaso(almacen, proveedor, { ventanaAtencionActiva: false })

    const resultado = await caso.ejecutar({
      codigoCuenta: 'linea-comercial',
      idWa: '5215512345678',
      cuerpo: 'Hola cliente',
      ahora: AHORA,
    })

    expect(resultado).toEqual({ idMensajeMeta: 'wamid.SAL.1', idConversacion: 'conversacion-1' })
    expect(proveedor.envios).toHaveLength(1)
    expect(proveedor.envios[0]).toMatchObject({
      idNumeroTelefono: '111111111111111',
      proveedor: 'meta',
      credencial: 'token-comercial',
      idWa: '5215512345678',
      cuerpo: 'Hola cliente',
    })
    expect(almacen.mensajes).toHaveLength(1)
    expect(almacen.mensajes[0]).toMatchObject({
      direccion: 'saliente',
      estado: 'enviado',
      cuerpo: 'Hola cliente',
      idCuentaWhatsApp: 'cuenta-comercial',
      idMensajeMeta: 'wamid.SAL.1',
    })
    expect(almacen.conversaciones).toHaveLength(1)
    expect(almacen.conversaciones[0]?.ultimoMensajeEn?.toISOString()).toBe(AHORA.toISOString())
  })

  it('permite enviar con la ventana activa si hay un entrante reciente', async () => {
    const almacen = new AlmacenEnMemoria()
    sembrarEntrante(almacen, new Date(AHORA.getTime() - HORA_MS))
    const proveedor = new ProveedorMensajesFalso({ idMensajeMeta: 'wamid.SAL.2' })
    const caso = crearCaso(almacen, proveedor, { ventanaAtencionActiva: true })

    const resultado = await caso.ejecutar({
      codigoCuenta: 'linea-comercial',
      idWa: '5215512345678',
      cuerpo: 'Respuesta',
      ahora: AHORA,
    })

    expect(resultado.idMensajeMeta).toBe('wamid.SAL.2')
    expect(almacen.mensajes).toHaveLength(2)
  })

  it('bloquea el envio con la ventana activa si no hay entrantes', async () => {
    const almacen = new AlmacenEnMemoria()
    const proveedor = new ProveedorMensajesFalso()
    const caso = crearCaso(almacen, proveedor, { ventanaAtencionActiva: true })

    await expect(
      caso.ejecutar({
        codigoCuenta: 'linea-comercial',
        idWa: '5215512345678',
        cuerpo: 'Hola',
        ahora: AHORA,
      }),
    ).rejects.toMatchObject({ codigo: 'WINDOW_CLOSED', codigoEstado: 409 })

    expect(proveedor.envios).toHaveLength(0)
    expect(almacen.mensajes).toHaveLength(0)
  })

  it('bloquea el envio con la ventana activa si el ultimo entrante supera 24 horas', async () => {
    const almacen = new AlmacenEnMemoria()
    sembrarEntrante(almacen, new Date(AHORA.getTime() - 25 * HORA_MS))
    const proveedor = new ProveedorMensajesFalso()
    const caso = crearCaso(almacen, proveedor, { ventanaAtencionActiva: true })

    await expect(
      caso.ejecutar({
        codigoCuenta: 'linea-comercial',
        idWa: '5215512345678',
        cuerpo: 'Hola',
        ahora: AHORA,
      }),
    ).rejects.toMatchObject({ codigo: 'WINDOW_CLOSED' })

    expect(proveedor.envios).toHaveLength(0)
  })

  it('lanza error si la cuenta no existe', async () => {
    const almacen = new AlmacenEnMemoria()
    const caso = crearCaso(almacen, new ProveedorMensajesFalso(), {
      ventanaAtencionActiva: false,
    })

    await expect(
      caso.ejecutar({ codigoCuenta: 'linea-inexistente', idWa: '5215512345678', cuerpo: 'Hola' }),
    ).rejects.toMatchObject({ codigo: 'ACCOUNT_NOT_FOUND', codigoEstado: 404 })
  })

  it('lanza error si la cuenta no tiene token configurado', async () => {
    const almacen = new AlmacenEnMemoria()
    const cuentas = cuentasPrueba().map((cuenta) =>
      cuenta.codigo === 'linea-comercial' ? { ...cuenta, tokenAcceso: null } : cuenta,
    )
    const caso = crearCaso(almacen, new ProveedorMensajesFalso(), {
      ventanaAtencionActiva: false,
      cuentas,
    })

    await expect(
      caso.ejecutar({ codigoCuenta: 'linea-comercial', idWa: '5215512345678', cuerpo: 'Hola' }),
    ).rejects.toMatchObject({ codigo: 'ACCOUNT_NO_TOKEN', codigoEstado: 503 })
  })

  it('propaga el fallo del proveedor sin persistir el saliente', async () => {
    const almacen = new AlmacenEnMemoria()
    const proveedor = new ProveedorMensajesFalso({ error: new ErrorDeEnvioMensaje('boom') })
    const caso = crearCaso(almacen, proveedor, { ventanaAtencionActiva: false })

    await expect(
      caso.ejecutar({
        codigoCuenta: 'linea-comercial',
        idWa: '5215512345678',
        cuerpo: 'Hola',
        ahora: AHORA,
      }),
    ).rejects.toBeInstanceOf(ErrorDeEnvioMensaje)

    expect(almacen.mensajes).toHaveLength(0)
  })
})

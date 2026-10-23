import { describe, expect, it } from 'vitest'
import {
  AlmacenEnMemoria,
  ProcesadorAutorespuestaFalso,
  PausadorSeguimientosFalso,
  RepositorioCuentaWhatsAppEnMemoria,
  RepositorioEstadoMensajeEnMemoria,
  RepositorioEventoWebhookEnMemoria,
  ResolverSecretoWebhookCuentaFalso,
  TransaccionMensajeEntranteEnMemoria,
  crearAppPrueba,
} from './helpers/en-memoria.js'
import { RecibirEvento360Dialog } from '../src/modules/whatsapp/application/use-cases/recibir-evento-360dialog.js'
import { ProcesarEventosWebhookPendientes } from '../src/modules/whatsapp/application/use-cases/procesar-eventos-webhook-pendientes.js'
import { ProcesarPayloadWhatsApp } from '../src/modules/whatsapp/application/use-cases/procesar-payload-whatsapp.js'
import { RegistrarMensajeEntrante } from '../src/modules/whatsapp/application/use-cases/registrar-mensaje-entrante.js'
import { RegistrarMensajeSalienteHumano } from '../src/modules/whatsapp/application/use-cases/registrar-mensaje-saliente-humano.js'
import { ResolverCuentaWhatsApp } from '../src/modules/whatsapp/application/use-cases/resolver-cuenta-whatsapp.js'
import { crearRegistrador } from '../src/shared/logging/registrador.js'
import type { CuentaWhatsApp } from '../src/modules/whatsapp/domain/entities/cuenta-whatsapp.js'

const REGISTRADOR = crearRegistrador('silent')

function cuentas360(): CuentaWhatsApp[] {
  const base = [
    ['cuenta-comercial', 'linea-comercial', '111111111111111', '+5210000000001', 'comercial'],
    ['cuenta-soporte', 'linea-soporte', '222222222222222', '+5210000000002', 'soporte'],
    ['cuenta-postventa', 'linea-postventa', '333333333333333', '+5210000000003', 'postventa'],
  ] as const
  return base.map(([id, codigo, idNumeroTelefono, telefonoVisible, sufijo]) => ({
    id,
    codigo,
    nombreComercial: codigo,
    idNumeroTelefono,
    telefonoVisible,
    tokenAcceso: null,
    proveedor: '360dialog',
    credencialRef: `D360_API_KEY_${sufijo.toUpperCase()}`,
    webhookSecretRef: `D360_WEBHOOK_SECRET_${sufijo.toUpperCase()}`,
    estaActiva: true,
  }))
}

function secretosPrueba(): ResolverSecretoWebhookCuentaFalso {
  return new ResolverSecretoWebhookCuentaFalso({
    '111111111111111': 'secreto-comercial',
    '222222222222222': 'secreto-soporte',
    '333333333333333': 'secreto-postventa',
  })
}

function crearEscenario() {
  const almacen = new AlmacenEnMemoria()
  const cuentas = cuentas360()
  const secretos = secretosPrueba()
  const pausador = new PausadorSeguimientosFalso({ pausados: { 'conversacion-1': 1 } })
  const procesadorAutorespuesta = new ProcesadorAutorespuestaFalso()
  const recibirEvento = new RecibirEvento360Dialog(
    new RepositorioEventoWebhookEnMemoria(almacen),
    secretos,
    REGISTRADOR,
  )
  const procesarEventos = new ProcesarEventosWebhookPendientes(
    new RepositorioEventoWebhookEnMemoria(almacen),
    new ProcesarPayloadWhatsApp(
      new ResolverCuentaWhatsApp(new RepositorioCuentaWhatsAppEnMemoria(cuentas)),
      new RegistrarMensajeEntrante(new TransaccionMensajeEntranteEnMemoria(almacen)),
      new RepositorioEstadoMensajeEnMemoria(almacen),
      REGISTRADOR,
      new RegistrarMensajeSalienteHumano(new TransaccionMensajeEntranteEnMemoria(almacen)),
      pausador,
      procesadorAutorespuesta,
    ),
    REGISTRADOR,
  )
  const { app } = crearAppPrueba({
    cuentas,
    almacen,
    webhook360: { recibirEvento },
  })
  return { app, almacen, pausador, procesadorAutorespuesta, procesarEventos }
}

function cuerpoMensajes(opciones: {
  idNumeroTelefono?: string
  idMensaje?: string
  from?: string
  texto?: string
  field?: string
}): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA-360',
        changes: [
          {
            field: opciones.field ?? 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '+5210000000000',
                phone_number_id: opciones.idNumeroTelefono ?? '111111111111111',
              },
              contacts: [
                {
                  profile: { name: 'Cliente' },
                  wa_id: opciones.from ?? '5215512345678',
                },
              ],
              messages: [
                {
                  id: opciones.idMensaje ?? 'wamid.360.ENTRANTE.1',
                  from: opciones.from ?? '5215512345678',
                  timestamp: '1700000000',
                  type: 'text',
                  text: { body: opciones.texto ?? 'Hola' },
                },
              ],
            },
          },
        ],
      },
    ],
  })
}

function cuerpoEstados(idMensajeMeta: string): string {
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
                phone_number_id: '111111111111111',
              },
              statuses: [
                {
                  id: idMensajeMeta,
                  status: 'delivered',
                  timestamp: '1700000100',
                  recipient_id: '5215512345678',
                },
              ],
            },
          },
        ],
      },
    ],
  })
}

function cuerpoEcho(opciones: {
  idEcho?: string
  to?: string
  texto?: string
  idNumeroTelefono?: string
}): string {
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
                phone_number_id: opciones.idNumeroTelefono ?? '111111111111111',
              },
              message_echoes: [
                {
                  id: opciones.idEcho ?? 'wamid.360.ECHO.1',
                  from: '5210000000000',
                  to: opciones.to ?? '5215512345678',
                  timestamp: '1700000200',
                  type: 'text',
                  text: { body: opciones.texto ?? 'Respuesta del asesor' },
                },
              ],
            },
          },
        ],
      },
    ],
  })
}

function cuerpoSync(evento: string): string {
  return JSON.stringify({
    id: 'sync-1',
    event: evento,
    data: {
      metadata: {
        display_phone_number: '+5210000000000',
        phone_number_id: '111111111111111',
      },
      state_sync: [],
    },
  })
}

async function publicar(
  app: ReturnType<typeof crearAppPrueba>['app'],
  cuerpo: string,
  token?: string,
): Promise<{ status: number; json: unknown }> {
  const respuesta = await app.inject({
    method: 'POST',
    url: '/webhooks/360dialog',
    headers: {
      'content-type': 'application/json',
      ...(token === undefined ? {} : { 'x-webhook-token': token }),
    },
    payload: cuerpo,
  })
  return { status: respuesta.statusCode, json: respuesta.json() }
}

describe('POST /webhooks/360dialog', () => {
  it('acepta el evento con token valido y lo persiste sin procesarlo aun', async () => {
    const { app, almacen } = crearEscenario()

    const respuesta = await publicar(app, cuerpoMensajes({}), 'secreto-comercial')

    expect(respuesta.status).toBe(200)
    expect(respuesta.json).toEqual({ recibido: true })
    expect(almacen.eventos).toHaveLength(1)
    expect(almacen.eventos[0]).toMatchObject({ estado: 'recibido', fuente: '360dialog' })
    expect(almacen.mensajes).toHaveLength(0)
  })

  it('rechaza sin cabecera x-webhook-token', async () => {
    const { app, almacen } = crearEscenario()

    const respuesta = await publicar(app, cuerpoMensajes({}))

    expect(respuesta.status).toBe(401)
    expect(respuesta.json).toEqual({ error: 'UNAUTHORIZED' })
    expect(almacen.eventos).toHaveLength(0)
  })

  it('rechaza con token incorrecto', async () => {
    const { app, almacen } = crearEscenario()

    const respuesta = await publicar(app, cuerpoMensajes({}), 'token-equivocado')

    expect(respuesta.status).toBe(401)
    expect(respuesta.json).toEqual({ error: 'UNAUTHORIZED' })
    expect(almacen.eventos).toHaveLength(0)
  })

  it('rechaza cuando el phone_number_id no pertenece a ninguna cuenta', async () => {
    const { app } = crearEscenario()

    const respuesta = await publicar(
      app,
      cuerpoMensajes({ idNumeroTelefono: '999999999999999' }),
      'secreto-comercial',
    )

    expect(respuesta.status).toBe(401)
  })

  it('rechaza una carga util irreconocible con 400', async () => {
    const { app } = crearEscenario()

    const respuesta = await publicar(app, JSON.stringify({ foo: 'bar' }), 'secreto-comercial')

    expect(respuesta.status).toBe(400)
    expect(respuesta.json).toEqual({ error: 'VALIDATION_ERROR' })
  })

  it('ignora duplicados sin duplicar el evento', async () => {
    const { app, almacen } = crearEscenario()
    const cuerpo = cuerpoMensajes({})

    await publicar(app, cuerpo, 'secreto-comercial')
    const segunda = await publicar(app, cuerpo, 'secreto-comercial')

    expect(segunda.status).toBe(200)
    expect(almacen.eventos).toHaveLength(1)
  })

  it('autentica de forma independiente cada una de las tres lineas', async () => {
    const { app } = crearEscenario()
    const casos = [
      ['111111111111111', 'secreto-comercial'],
      ['222222222222222', 'secreto-soporte'],
      ['333333333333333', 'secreto-postventa'],
    ] as const

    for (const [id, secreto] of casos) {
      const respuesta = await publicar(
        app,
        cuerpoMensajes({ idNumeroTelefono: id, idMensaje: `wamid.360.${id}` }),
        secreto,
      )
      expect(respuesta.status).toBe(200)
    }

    const cruzado = await publicar(
      app,
      cuerpoMensajes({ idNumeroTelefono: '222222222222222', idMensaje: 'wamid.360.cruzado' }),
      'secreto-comercial',
    )
    expect(cruzado.status).toBe(401)
  })

  it('reconoce eventos de sincronizacion de coexistencia como ignorados', async () => {
    const { app, almacen } = crearEscenario()

    const sincronizacion = await publicar(
      app,
      cuerpoSync('smb_app_state_sync'),
      'secreto-comercial',
    )
    const historial = await publicar(app, cuerpoSync('history'), 'secreto-comercial')

    expect(sincronizacion.status).toBe(200)
    expect(historial.status).toBe(200)
    expect(almacen.eventos).toHaveLength(2)
    expect(almacen.eventos.map((evento) => evento.estado)).toEqual(['ignorado', 'ignorado'])
  })
})

describe('ProcesarEventosWebhookPendientes con eventos de 360dialog', () => {
  it('procesa un entrante persistido y lo registra como mensaje', async () => {
    const { app, almacen, procesarEventos } = crearEscenario()
    await publicar(app, cuerpoMensajes({}), 'secreto-comercial')

    const resultado = await procesarEventos.ejecutar()

    expect(resultado).toEqual({ procesados: 1, ignorados: 0, fallidos: 0 })
    expect(almacen.mensajes).toHaveLength(1)
    expect(almacen.mensajes[0]).toMatchObject({
      direccion: 'entrante',
      idMensajeMeta: 'wamid.360.ENTRANTE.1',
      cuerpo: 'Hola',
    })
    expect(almacen.eventos[0]?.estado).toBe('procesado')
  })

  it('no reprocesa eventos ya procesados', async () => {
    const { app, almacen, procesarEventos } = crearEscenario()
    await publicar(app, cuerpoMensajes({}), 'secreto-comercial')
    await procesarEventos.ejecutar()

    const segundo = await procesarEventos.ejecutar()

    expect(segundo).toEqual({ procesados: 0, ignorados: 0, fallidos: 0 })
    expect(almacen.mensajes).toHaveLength(1)
  })

  it('actualiza el estado de entrega de un saliente existente', async () => {
    const { app, almacen, procesarEventos } = crearEscenario()
    almacen.contactos.push({ id: 'contacto-1', idWa: '5215512345678', nombrePerfil: null })
    almacen.conversaciones.push({
      id: 'conversacion-1',
      idCuentaWhatsApp: 'cuenta-comercial',
      idContacto: 'contacto-1',
      estado: 'abierta',
      ultimoMensajeEn: new Date(),
    })
    almacen.mensajes.push({
      id: 'mensaje-1',
      idConversacion: 'conversacion-1',
      idCuentaWhatsApp: 'cuenta-comercial',
      direccion: 'saliente',
      idMensajeMeta: 'wamid.360.SALIENTE.1',
      tipo: 'text',
      cuerpo: 'Hola',
      estado: 'enviado',
      creadoEn: new Date(),
    })
    await publicar(app, cuerpoEstados('wamid.360.SALIENTE.1'), 'secreto-comercial')

    const resultado = await procesarEventos.ejecutar()

    expect(resultado.procesados).toBe(1)
    expect(almacen.mensajes[0]?.estado).toBe('delivered')
  })

  it('registra un eco como saliente humano, pausa seguimientos y no dispara el bot', async () => {
    const { app, almacen, pausador, procesadorAutorespuesta, procesarEventos } = crearEscenario()
    almacen.contactos.push({ id: 'contacto-1', idWa: '5215512345678', nombrePerfil: null })
    almacen.conversaciones.push({
      id: 'conversacion-1',
      idCuentaWhatsApp: 'cuenta-comercial',
      idContacto: 'contacto-1',
      estado: 'abierta',
      ultimoMensajeEn: new Date('2026-01-01T10:00:00.000Z'),
    })
    almacen.mensajes.push({
      id: 'mensaje-1',
      idConversacion: 'conversacion-1',
      idCuentaWhatsApp: 'cuenta-comercial',
      direccion: 'entrante',
      idMensajeMeta: 'wamid.360.ENTRANTE.PREVIO',
      tipo: 'text',
      cuerpo: 'Hola',
      estado: null,
      creadoEn: new Date('2026-01-01T10:00:00.000Z'),
    })
    await publicar(app, cuerpoEcho({}), 'secreto-comercial')

    const resultado = await procesarEventos.ejecutar()

    expect(resultado.procesados).toBe(1)
    expect(almacen.mensajes).toHaveLength(2)
    expect(almacen.mensajes[1]).toMatchObject({
      direccion: 'saliente',
      idMensajeMeta: 'wamid.360.ECHO.1',
      cuerpo: 'Respuesta del asesor',
    })
    expect(almacen.conversaciones[0]?.ultimoMensajeEn?.toISOString()).toBe(
      '2026-01-01T10:00:00.000Z',
    )
    expect(pausador.origenes).toEqual(['asesor'])
    expect(procesadorAutorespuesta.llamadas).toHaveLength(0)
  })

  it('ignora ecos duplicados sin volver a pausar', async () => {
    const { app, almacen, pausador, procesarEventos } = crearEscenario()
    await publicar(app, cuerpoEcho({}), 'secreto-comercial')
    await procesarEventos.ejecutar()

    almacen.eventos[0]!.estado = 'recibido'
    almacen.eventos[0]!.claveEvento = 'clave-forzada-distinta'
    await procesarEventos.ejecutar()

    expect(almacen.mensajes).toHaveLength(1)
    expect(pausador.origenes).toEqual(['asesor'])
  })

  it('deja en ignorado los eventos de cuentas desconocidas', async () => {
    const { almacen, procesarEventos, app } = crearEscenario()
    await publicar(app, cuerpoMensajes({ idNumeroTelefono: '222222222222222' }), 'secreto-soporte')
    almacen.eventos.push({
      id: 'evento-forzado',
      claveEvento: 'clave-forzada',
      fuente: '360dialog',
      tipoObjeto: 'whatsapp_business_account',
      estado: 'recibido',
      error: null,
      cargaUtilOriginal: JSON.parse(
        cuerpoMensajes({ idNumeroTelefono: '999999999999999', idMensaje: 'wamid.360.X' }),
      ),
    })

    const resultado = await procesarEventos.ejecutar()

    expect(resultado.procesados).toBe(1)
    expect(resultado.ignorados).toBe(1)
    expect(almacen.eventos.find((evento) => evento.claveEvento === 'clave-forzada')?.estado).toBe(
      'ignorado',
    )
  })

  it('no vuelve a procesar eventos de sincronizacion', async () => {
    const { app, almacen, procesarEventos } = crearEscenario()
    await publicar(app, cuerpoSync('smb_app_state_sync'), 'secreto-comercial')

    const resultado = await procesarEventos.ejecutar()

    expect(resultado).toEqual({ procesados: 0, ignorados: 0, fallidos: 0 })
    expect(almacen.eventos[0]?.estado).toBe('ignorado')
  })
})

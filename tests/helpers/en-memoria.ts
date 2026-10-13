import { createHmac } from 'node:crypto'
import { crearApp } from '../../src/app.js'
import { crearRegistrador } from '../../src/shared/logging/registrador.js'
import type { Contacto } from '../../src/modules/contacts/domain/entities/contacto.js'
import type { RepositorioContacto } from '../../src/modules/contacts/domain/ports/repositorio-contacto.js'
import type { Conversacion } from '../../src/modules/conversations/domain/entities/conversacion.js'
import type {
  EntradaCrearConversacion,
  RepositorioConversacion,
} from '../../src/modules/conversations/domain/ports/repositorio-conversacion.js'
import type {
  EntradaInsertarMensajeEntrante,
  EntradaInsertarMensajeSaliente,
  RepositorioMensaje,
} from '../../src/modules/conversations/domain/ports/repositorio-mensaje.js'
import type { CuentaWhatsApp } from '../../src/modules/whatsapp/domain/entities/cuenta-whatsapp.js'
import type { RepositorioCuentaWhatsApp } from '../../src/modules/whatsapp/domain/ports/repositorio-cuenta-whatsapp.js'
import type { RepositorioEventoWebhook } from '../../src/modules/whatsapp/domain/ports/repositorio-evento-webhook.js'
import type { RepositorioEstadoMensaje } from '../../src/modules/whatsapp/domain/ports/repositorio-estado-mensaje.js'
import type {
  ContextoMensajeEntrante,
  TransaccionMensajeEntrante,
} from '../../src/modules/whatsapp/application/ports/transaccion-mensaje-entrante.js'
import { VerificarWebhookWhatsApp } from '../../src/modules/whatsapp/application/use-cases/verificar-webhook-whatsapp.js'
import { ResolverCuentaWhatsApp } from '../../src/modules/whatsapp/application/use-cases/resolver-cuenta-whatsapp.js'
import { RegistrarMensajeEntrante } from '../../src/modules/whatsapp/application/use-cases/registrar-mensaje-entrante.js'
import { RecibirEventoWhatsApp } from '../../src/modules/whatsapp/application/use-cases/recibir-evento-whatsapp.js'

export type MensajeAlmacenado = {
  id: string
  idConversacion: string
  idCuentaWhatsApp: string
  direccion: 'entrante' | 'saliente'
  idMensajeMeta: string | null
  tipo: string
  cuerpo: string | null
  estado: string | null
  creadoEn: Date
}

export type EventoAlmacenado = {
  id: string
  claveEvento: string
  tipoObjeto: string | null
  estado: 'recibido' | 'procesado' | 'ignorado' | 'fallido'
  error: string | null
}

export class AlmacenEnMemoria {
  contactos: Contacto[] = []
  conversaciones: Conversacion[] = []
  mensajes: MensajeAlmacenado[] = []
  eventos: EventoAlmacenado[] = []
  contadores: Record<string, number> = {}
}

export function firmar(cuerpo: string, secreto: string): string {
  return `sha256=${createHmac('sha256', secreto).update(cuerpo).digest('hex')}`
}

export class RepositorioContactoEnMemoria implements RepositorioContacto {
  constructor(private readonly almacen: AlmacenEnMemoria) {}

  async buscarPorIdWa(idWa: string): Promise<Contacto | null> {
    return this.almacen.contactos.find((contacto) => contacto.idWa === idWa) ?? null
  }

  async crear(entrada: { idWa: string; nombrePerfil: string | null }): Promise<Contacto> {
    const existente = await this.buscarPorIdWa(entrada.idWa)
    if (existente) {
      return existente
    }
    const contacto: Contacto = {
      id: this.siguienteId('contacto'),
      idWa: entrada.idWa,
      nombrePerfil: entrada.nombrePerfil,
    }
    this.almacen.contactos.push(contacto)
    return contacto
  }

  private siguienteId(clave: string): string {
    const cuenta = (this.almacen.contadores[clave] ?? 0) + 1
    this.almacen.contadores[clave] = cuenta
    return `${clave}-${cuenta}`
  }
}

export class RepositorioConversacionEnMemoria implements RepositorioConversacion {
  constructor(private readonly almacen: AlmacenEnMemoria) {}

  async buscarPorCuentaYContacto(
    idCuentaWhatsApp: string,
    idContacto: string,
  ): Promise<Conversacion | null> {
    return (
      this.almacen.conversaciones.find(
        (conversacion) =>
          conversacion.idCuentaWhatsApp === idCuentaWhatsApp &&
          conversacion.idContacto === idContacto,
      ) ?? null
    )
  }

  async crear(entrada: EntradaCrearConversacion): Promise<Conversacion> {
    const existente = await this.buscarPorCuentaYContacto(
      entrada.idCuentaWhatsApp,
      entrada.idContacto,
    )
    if (existente) {
      return existente
    }
    const conversacion: Conversacion = {
      id: `conversacion-${(this.almacen.conversaciones.length + 1).toString()}`,
      idCuentaWhatsApp: entrada.idCuentaWhatsApp,
      idContacto: entrada.idContacto,
      estado: 'abierta',
      ultimoMensajeEn: entrada.en,
    }
    this.almacen.conversaciones.push(conversacion)
    return conversacion
  }

  async actualizarUltimoMensaje(idConversacion: string, en: Date): Promise<void> {
    const conversacion = this.almacen.conversaciones.find((item) => item.id === idConversacion)
    if (conversacion) {
      conversacion.ultimoMensajeEn = en
    }
  }
}

export class RepositorioMensajeEnMemoria implements RepositorioMensaje {
  constructor(private readonly almacen: AlmacenEnMemoria) {}

  async insertarEntrante(
    entrada: EntradaInsertarMensajeEntrante,
  ): Promise<{ insertado: boolean; id: string | null }> {
    const existente = this.almacen.mensajes.find(
      (mensaje) => mensaje.idMensajeMeta === entrada.idMensajeMeta,
    )
    if (existente) {
      return { insertado: false, id: null }
    }
    const mensaje: MensajeAlmacenado = {
      id: `mensaje-${(this.almacen.mensajes.length + 1).toString()}`,
      idConversacion: entrada.idConversacion,
      idCuentaWhatsApp: entrada.idCuentaWhatsApp,
      direccion: 'entrante',
      idMensajeMeta: entrada.idMensajeMeta,
      tipo: entrada.tipo,
      cuerpo: entrada.cuerpo,
      estado: null,
      creadoEn: entrada.marcaTiempoMeta ?? new Date(),
    }
    this.almacen.mensajes.push(mensaje)
    return { insertado: true, id: mensaje.id }
  }

  async insertarSaliente(entrada: EntradaInsertarMensajeSaliente): Promise<{ id: string }> {
    const mensaje: MensajeAlmacenado = {
      id: `mensaje-${(this.almacen.mensajes.length + 1).toString()}`,
      idConversacion: entrada.idConversacion,
      idCuentaWhatsApp: entrada.idCuentaWhatsApp,
      direccion: 'saliente',
      idMensajeMeta: entrada.idMensajeMeta,
      tipo: entrada.tipo,
      cuerpo: entrada.cuerpo,
      estado: entrada.estado,
      creadoEn: new Date(),
    }
    this.almacen.mensajes.push(mensaje)
    return { id: mensaje.id }
  }

  async buscarUltimoEntranteEn(idConversacion: string): Promise<Date | null> {
    const entrantes = this.almacen.mensajes.filter(
      (mensaje) => mensaje.idConversacion === idConversacion && mensaje.direccion === 'entrante',
    )
    if (entrantes.length === 0) {
      return null
    }
    let ultimo = entrantes[0]!.creadoEn
    for (const mensaje of entrantes) {
      if (mensaje.creadoEn.getTime() > ultimo.getTime()) {
        ultimo = mensaje.creadoEn
      }
    }
    return ultimo
  }
}

export class RepositorioEstadoMensajeEnMemoria implements RepositorioEstadoMensaje {
  constructor(private readonly almacen: AlmacenEnMemoria) {}

  async actualizarEstado(idMensajeMeta: string, estado: string): Promise<boolean> {
    const mensaje = this.almacen.mensajes.find((item) => item.idMensajeMeta === idMensajeMeta)
    if (!mensaje) {
      return false
    }
    mensaje.estado = estado
    return true
  }
}

export class RepositorioCuentaWhatsAppEnMemoria implements RepositorioCuentaWhatsApp {
  constructor(private readonly cuentas: CuentaWhatsApp[]) {}

  async buscarPorIdNumeroTelefono(idNumeroTelefono: string): Promise<CuentaWhatsApp | null> {
    const cuenta = this.cuentas.find(
      (item) => item.idNumeroTelefono === idNumeroTelefono && item.estaActiva,
    )
    return cuenta ?? null
  }

  async buscarPorCodigo(codigo: string): Promise<CuentaWhatsApp | null> {
    const cuenta = this.cuentas.find((item) => item.codigo === codigo && item.estaActiva)
    return cuenta ?? null
  }

  async listarActivas(): Promise<CuentaWhatsApp[]> {
    return this.cuentas.filter((item) => item.estaActiva)
  }
}

export class RepositorioEventoWebhookEnMemoria implements RepositorioEventoWebhook {
  constructor(private readonly almacen: AlmacenEnMemoria) {}

  async intentarRegistrar(entrada: {
    claveEvento: string
    tipoObjeto: string | null
    cargaUtilOriginal: unknown
  }): Promise<{ insertado: boolean; id: string }> {
    const existente = this.almacen.eventos.find(
      (evento) => evento.claveEvento === entrada.claveEvento,
    )
    if (existente) {
      return { insertado: false, id: existente.id }
    }
    const evento: EventoAlmacenado = {
      id: `evento-${(this.almacen.eventos.length + 1).toString()}`,
      claveEvento: entrada.claveEvento,
      tipoObjeto: entrada.tipoObjeto,
      estado: 'recibido',
      error: null,
    }
    this.almacen.eventos.push(evento)
    return { insertado: true, id: evento.id }
  }

  async buscarPorClaveEvento(
    claveEvento: string,
  ): Promise<{ id: string; estado: EventoAlmacenado['estado'] } | null> {
    const evento = this.almacen.eventos.find((item) => item.claveEvento === claveEvento)
    return evento ? { id: evento.id, estado: evento.estado } : null
  }

  async marcarEstado(
    claveEvento: string,
    estado: EventoAlmacenado['estado'],
    error: string | null,
  ): Promise<void> {
    const evento = this.almacen.eventos.find((item) => item.claveEvento === claveEvento)
    if (evento) {
      evento.estado = estado
      evento.error = error
    }
  }
}

export class TransaccionMensajeEntranteEnMemoria implements TransaccionMensajeEntrante {
  constructor(private readonly almacen: AlmacenEnMemoria) {}

  async ejecutar<T>(trabajo: (contexto: ContextoMensajeEntrante) => Promise<T>): Promise<T> {
    const instantanea = clonarAlmacen(this.almacen)
    const contexto: ContextoMensajeEntrante = {
      contactos: new RepositorioContactoEnMemoria(this.almacen),
      conversaciones: new RepositorioConversacionEnMemoria(this.almacen),
      mensajes: new RepositorioMensajeEnMemoria(this.almacen),
    }
    try {
      return await trabajo(contexto)
    } catch (error) {
      restaurarAlmacen(this.almacen, instantanea)
      throw error
    }
  }
}

type InstantaneaAlmacen = {
  contactos: Contacto[]
  conversaciones: Conversacion[]
  mensajes: MensajeAlmacenado[]
  eventos: EventoAlmacenado[]
}

function clonarAlmacen(almacen: AlmacenEnMemoria): InstantaneaAlmacen {
  return {
    contactos: almacen.contactos.map((contacto) => ({ ...contacto })),
    conversaciones: almacen.conversaciones.map((conversacion) => ({
      ...conversacion,
      ultimoMensajeEn: conversacion.ultimoMensajeEn ? new Date(conversacion.ultimoMensajeEn) : null,
    })),
    mensajes: almacen.mensajes.map((mensaje) => ({
      ...mensaje,
      creadoEn: new Date(mensaje.creadoEn),
    })),
    eventos: almacen.eventos.map((evento) => ({ ...evento })),
  }
}

function restaurarAlmacen(almacen: AlmacenEnMemoria, instantanea: InstantaneaAlmacen): void {
  almacen.contactos = instantanea.contactos.map((contacto) => ({ ...contacto }))
  almacen.conversaciones = instantanea.conversaciones.map((conversacion) => ({
    ...conversacion,
    ultimoMensajeEn: conversacion.ultimoMensajeEn ? new Date(conversacion.ultimoMensajeEn) : null,
  }))
  almacen.mensajes = instantanea.mensajes.map((mensaje) => ({
    ...mensaje,
    creadoEn: new Date(mensaje.creadoEn),
  }))
  almacen.eventos = instantanea.eventos.map((evento) => ({ ...evento }))
}

export type DependenciasAppPruebaWebhook = {
  cuentas: CuentaWhatsApp[]
  tokenVerificacion?: string
  secretoApp?: string
  almacen?: AlmacenEnMemoria
}

export function crearAppPrueba(dependencias: DependenciasAppPruebaWebhook) {
  const tokenVerificacion = dependencias.tokenVerificacion ?? 'test-verify-token'
  const secretoApp = dependencias.secretoApp ?? 'test-app-secret'
  const almacen = dependencias.almacen ?? new AlmacenEnMemoria()
  const registrador = crearRegistrador('silent')

  const cuentas = new RepositorioCuentaWhatsAppEnMemoria(dependencias.cuentas)
  const eventos = new RepositorioEventoWebhookEnMemoria(almacen)
  const estados = new RepositorioEstadoMensajeEnMemoria(almacen)
  const transaccion = new TransaccionMensajeEntranteEnMemoria(almacen)

  const aplicacion = crearApp({
    registrador,
    webhook: {
      verificarWebhook: new VerificarWebhookWhatsApp(tokenVerificacion),
      recibirEvento: new RecibirEventoWhatsApp(
        eventos,
        new ResolverCuentaWhatsApp(cuentas),
        new RegistrarMensajeEntrante(transaccion),
        estados,
        registrador,
      ),
      secretoApp,
    },
  })

  return { app: aplicacion, almacen, tokenVerificacion, secretoApp }
}

export function cuentasPrueba(): CuentaWhatsApp[] {
  return [
    {
      id: 'cuenta-comercial',
      codigo: 'linea-comercial',
      nombreComercial: 'Linea Comercial',
      idNumeroTelefono: '111111111111111',
      telefonoVisible: '+5210000000001',
      tokenAcceso: 'token-comercial',
      estaActiva: true,
    },
    {
      id: 'cuenta-soporte',
      codigo: 'linea-soporte',
      nombreComercial: 'Linea Soporte',
      idNumeroTelefono: '222222222222222',
      telefonoVisible: '+5210000000002',
      tokenAcceso: 'token-soporte',
      estaActiva: true,
    },
    {
      id: 'cuenta-postventa',
      codigo: 'linea-postventa',
      nombreComercial: 'Linea Postventa',
      idNumeroTelefono: '333333333333333',
      telefonoVisible: '+5210000000003',
      tokenAcceso: 'token-postventa',
      estaActiva: true,
    },
  ]
}

export function construirCuerpoWebhook(opciones: {
  idNumeroTelefono?: string
  messages?: unknown[]
  statuses?: unknown[]
  object?: string
}): string {
  const cuerpo = {
    object: opciones.object ?? 'whatsapp_business_account',
    entry: [
      {
        id: 'TEST_BUSINESS_ACCOUNT_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '+5210000000000',
                phone_number_id: opciones.idNumeroTelefono ?? '111111111111111',
              },
              ...(opciones.messages ? { contacts: bloqueContactos(opciones.messages) } : {}),
              ...(opciones.messages ? { messages: opciones.messages } : {}),
              ...(opciones.statuses ? { statuses: opciones.statuses } : {}),
            },
          },
        ],
      },
    ],
  }
  return JSON.stringify(cuerpo)
}

function bloqueContactos(messages: unknown[]): unknown[] {
  const idsWa: string[] = []
  for (const mensaje of messages as { from?: unknown }[]) {
    if (typeof mensaje.from === 'string' && !idsWa.includes(mensaje.from)) {
      idsWa.push(mensaje.from)
    }
  }
  return idsWa.map((idWa) => ({ profile: { name: `Cliente ${idWa.slice(-4)}` }, wa_id: idWa }))
}

export function mensajeTexto(sobrescrituras: {
  id?: string
  from?: string
  timestamp?: string
  body?: string
}): Record<string, unknown> {
  return {
    id: sobrescrituras.id ?? 'wamid.TEST0001',
    from: sobrescrituras.from ?? '5215512345678',
    timestamp: sobrescrituras.timestamp ?? '1700000000',
    type: 'text',
    text: {
      body: sobrescrituras.body ?? 'Hola',
    },
  }
}

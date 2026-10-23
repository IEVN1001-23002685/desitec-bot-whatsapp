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
  EntradaEnviarMensaje,
  ProveedorMensajes,
  ResultadoEnviarMensaje,
} from '../../src/modules/whatsapp/domain/ports/proveedor-mensajes.js'
import type {
  ContextoMensajeEntrante,
  TransaccionMensajeEntrante,
} from '../../src/modules/whatsapp/application/ports/transaccion-mensaje-entrante.js'
import type {
  OrigenPausa,
  PausadorSeguimientos,
} from '../../src/modules/whatsapp/application/ports/pausador-seguimientos.js'
import type { ResolverSecretoWebhookCuenta } from '../../src/modules/whatsapp/domain/ports/resolver-secreto-webhook.js'
import type {
  CredencialesCuenta,
  ResolverCredencialCuenta,
} from '../../src/modules/whatsapp/domain/ports/resolver-credencial-cuenta.js'
import type {
  EntradaProcesarAutorespuesta,
  ProcesadorAutorespuesta,
} from '../../src/modules/whatsapp/application/ports/procesador-autorespuesta.js'
import type { EntradaGuion } from '../../src/modules/autorespuestas/domain/entities/entrada-guion.js'
import type { Lead } from '../../src/modules/autorespuestas/domain/entities/lead.js'
import type {
  ActualizacionLead,
  EntradaCrearLead,
  RepositorioLead,
} from '../../src/modules/autorespuestas/domain/ports/repositorio-lead.js'
import type { RepositorioGuionLead } from '../../src/modules/autorespuestas/domain/ports/repositorio-guion-lead.js'
import { GUION_FLUJO_LEAD_INICIAL } from '../../src/shared/db/guion-flujo-lead-inicial.js'
import type { PlantillaWhatsApp } from '../../src/modules/followups/domain/entities/plantilla-whatsapp.js'
import type { ReglaSeguimiento } from '../../src/modules/followups/domain/entities/regla-seguimiento.js'
import type { SeguimientoProgramado } from '../../src/modules/followups/domain/entities/seguimiento-programado.js'
import type { EstadoSeguimiento } from '../../src/modules/followups/domain/types/estado-seguimiento.js'
import type { RepositorioPlantilla } from '../../src/modules/followups/domain/ports/repositorio-plantilla.js'
import type { RepositorioReglaSeguimiento } from '../../src/modules/followups/domain/ports/repositorio-regla-seguimiento.js'
import type {
  EntradaProgramarSeguimiento,
  RepositorioSeguimientoProgramado,
} from '../../src/modules/followups/domain/ports/repositorio-seguimiento-programado.js'
import type {
  DestinoSeguimiento,
  RepositorioDestinoSeguimiento,
} from '../../src/modules/followups/domain/ports/repositorio-destino-seguimiento.js'
import type { VerificadorEstadoComercial } from '../../src/modules/followups/domain/ports/verificador-estado-comercial.js'
import { ProgramarSeguimientos } from '../../src/modules/followups/application/use-cases/programar-seguimientos.js'
import { VerificarWebhookWhatsApp } from '../../src/modules/whatsapp/application/use-cases/verificar-webhook-whatsapp.js'
import { ResolverCuentaWhatsApp } from '../../src/modules/whatsapp/application/use-cases/resolver-cuenta-whatsapp.js'
import { RegistrarMensajeEntrante } from '../../src/modules/whatsapp/application/use-cases/registrar-mensaje-entrante.js'
import { EnviarMensajeSaliente } from '../../src/modules/whatsapp/application/use-cases/enviar-mensaje-saliente.js'
import { RecibirEventoWhatsApp } from '../../src/modules/whatsapp/application/use-cases/recibir-evento-whatsapp.js'
import type { OpcionesRutasWebhook360Dialog } from '../../src/modules/whatsapp/presentation/routes/rutas-webhook-360dialog.js'

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
  fuente: string
  tipoObjeto: string | null
  estado: 'recibido' | 'procesado' | 'ignorado' | 'fallido'
  error: string | null
  cargaUtilOriginal: unknown
}

export class AlmacenEnMemoria {
  contactos: Contacto[] = []
  conversaciones: Conversacion[] = []
  mensajes: MensajeAlmacenado[] = []
  eventos: EventoAlmacenado[] = []
  reglasSeguimiento: ReglaSeguimiento[] = []
  seguimientosProgramados: SeguimientoProgramado[] = []
  leads: Lead[] = []
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

  async insertarSalienteHumano(
    entrada: EntradaInsertarMensajeSaliente,
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
      direccion: 'saliente',
      idMensajeMeta: entrada.idMensajeMeta,
      tipo: entrada.tipo,
      cuerpo: entrada.cuerpo,
      estado: entrada.estado,
      creadoEn: entrada.marcaTiempoMeta ?? new Date(),
    }
    this.almacen.mensajes.push(mensaje)
    return { insertado: true, id: mensaje.id }
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

export class RepositorioPlantillaEnMemoria implements RepositorioPlantilla {
  constructor(private readonly plantillas: PlantillaWhatsApp[] = []) {}

  async buscarActivaPorId(id: string): Promise<PlantillaWhatsApp | null> {
    return this.plantillas.find((plantilla) => plantilla.id === id && plantilla.activa) ?? null
  }

  async buscarActivaPorCodigo(codigo: string): Promise<PlantillaWhatsApp | null> {
    return (
      this.plantillas.find((plantilla) => plantilla.codigo === codigo && plantilla.activa) ?? null
    )
  }

  async listarActivas(): Promise<PlantillaWhatsApp[]> {
    return this.plantillas.filter((plantilla) => plantilla.activa)
  }
}

export class RepositorioDestinoSeguimientoEnMemoria implements RepositorioDestinoSeguimiento {
  constructor(private readonly destinos: Record<string, DestinoSeguimiento> = {}) {}

  async obtenerDestino(idConversacion: string): Promise<DestinoSeguimiento | null> {
    return this.destinos[idConversacion] ?? null
  }
}

export class VerificadorEstadoComercialFalso implements VerificadorEstadoComercial {
  constructor(private readonly noSeguibles: string[] = []) {}

  async puedeSeguir(idConversacion: string): Promise<boolean> {
    return !this.noSeguibles.includes(idConversacion)
  }
}

export type PausadorSeguimientosFalsoOpciones = {
  pausados?: Record<string, number>
  error?: Error
}

export class PausadorSeguimientosFalso implements PausadorSeguimientos {
  readonly llamadas: string[] = []
  readonly origenes: OrigenPausa[] = []
  private readonly pausados: Record<string, number>
  private readonly error: Error | undefined

  constructor(opciones: PausadorSeguimientosFalsoOpciones = {}) {
    this.pausados = opciones.pausados ?? {}
    this.error = opciones.error
  }

  async pausarPorRespuesta(
    idConversacion: string,
    origen: OrigenPausa = 'cliente',
  ): Promise<number> {
    this.llamadas.push(idConversacion)
    this.origenes.push(origen)
    if (this.error) {
      throw this.error
    }
    return this.pausados[idConversacion] ?? 0
  }
}

export class ProcesadorAutorespuestaFalso implements ProcesadorAutorespuesta {
  readonly llamadas: EntradaProcesarAutorespuesta[] = []
  private readonly error: Error | undefined

  constructor(opciones: { error?: Error } = {}) {
    this.error = opciones.error
  }

  async procesar(entrada: EntradaProcesarAutorespuesta): Promise<void> {
    this.llamadas.push(entrada)
    if (this.error) {
      throw this.error
    }
  }
}

export class RepositorioLeadEnMemoria implements RepositorioLead {
  constructor(private readonly almacen: AlmacenEnMemoria) {}

  async buscarPorConversacion(idConversacion: string): Promise<Lead | null> {
    return this.almacen.leads.find((lead) => lead.idConversacion === idConversacion) ?? null
  }

  async crear(entrada: EntradaCrearLead): Promise<Lead> {
    const lead: Lead = {
      id: `lead-${(this.almacen.leads.length + 1).toString()}`,
      idConversacion: entrada.idConversacion,
      nombre: null,
      correo: null,
      modelos: null,
      cantidad: null,
      ciudad: null,
      pasoActual: 'nombre',
      estado: 'capturando',
      completadoEn: null,
    }
    this.almacen.leads.push(lead)
    return lead
  }

  async actualizar(id: string, cambios: ActualizacionLead): Promise<void> {
    const lead = this.almacen.leads.find((item) => item.id === id)
    if (!lead) {
      return
    }
    Object.assign(lead, cambios)
  }
}

export class RepositorioGuionLeadEnMemoria implements RepositorioGuionLead {
  constructor(private readonly entradas: EntradaGuion[] = []) {}

  async buscarActivaPorClave(clave: string): Promise<EntradaGuion | null> {
    return this.entradas.find((entrada) => entrada.clave === clave && entrada.activa) ?? null
  }
}

export function guionLeadPrueba(): EntradaGuion[] {
  return GUION_FLUJO_LEAD_INICIAL.map((entrada, indice) => ({
    id: `guion-${(indice + 1).toString()}`,
    clave: entrada.clave,
    orden: entrada.orden,
    texto: entrada.texto,
    activa: true,
  }))
}

export class RepositorioReglaSeguimientoEnMemoria implements RepositorioReglaSeguimiento {
  constructor(private readonly almacen: AlmacenEnMemoria) {}

  async buscarActivaPorId(id: string): Promise<ReglaSeguimiento | null> {
    return this.almacen.reglasSeguimiento.find((regla) => regla.id === id && regla.activa) ?? null
  }

  async buscarActivaPorCodigo(codigo: string): Promise<ReglaSeguimiento | null> {
    return (
      this.almacen.reglasSeguimiento.find((regla) => regla.codigo === codigo && regla.activa) ??
      null
    )
  }

  async buscarActivas(): Promise<ReglaSeguimiento[]> {
    return this.almacen.reglasSeguimiento.filter((regla) => regla.activa)
  }
}

export class RepositorioSeguimientoProgramadoEnMemoria implements RepositorioSeguimientoProgramado {
  constructor(private readonly almacen: AlmacenEnMemoria) {}

  async programar(entrada: EntradaProgramarSeguimiento): Promise<SeguimientoProgramado> {
    const seguimiento: SeguimientoProgramado = {
      id: `seguimiento-${(this.almacen.seguimientosProgramados.length + 1).toString()}`,
      idConversacion: entrada.idConversacion,
      idReglaSeguimiento: entrada.idReglaSeguimiento,
      programadoPara: entrada.programadoPara,
      estado: 'pendiente',
      intentos: 0,
      idMensajeMeta: null,
      error: null,
      motivoCancelacion: null,
      enviadoEn: null,
    }
    this.almacen.seguimientosProgramados.push(seguimiento)
    return seguimiento
  }

  async obtenerPendientesParaProcesar(limite: number): Promise<SeguimientoProgramado[]> {
    const ahora = Date.now()
    return this.almacen.seguimientosProgramados
      .filter(
        (seguimiento) =>
          seguimiento.estado === 'pendiente' && seguimiento.programadoPara.getTime() <= ahora,
      )
      .slice(0, limite)
  }

  async marcarEnProceso(id: string, enProceso: boolean): Promise<void> {
    this.cambiar(id, (seguimiento) => {
      seguimiento.estado = enProceso ? 'en_proceso' : 'pendiente'
    })
  }

  async marcarEnviado(id: string, idMensajeMeta: string, enviadoEn: Date): Promise<void> {
    this.cambiar(id, (seguimiento) => {
      seguimiento.estado = 'enviado'
      seguimiento.idMensajeMeta = idMensajeMeta
      seguimiento.enviadoEn = enviadoEn
    })
  }

  async marcarFallido(id: string, error: string): Promise<void> {
    this.cambiar(id, (seguimiento) => {
      seguimiento.estado = 'fallido'
      seguimiento.error = error
    })
  }

  async marcarCancelado(id: string, motivo: string): Promise<void> {
    this.cambiar(id, (seguimiento) => {
      seguimiento.estado = 'cancelado'
      seguimiento.motivoCancelacion = motivo
    })
  }

  async cancelarPendientesPorConversacion(idConversacion: string, motivo: string): Promise<number> {
    let cancelados = 0
    for (const seguimiento of this.almacen.seguimientosProgramados) {
      if (seguimiento.idConversacion === idConversacion && seguimiento.estado === 'pendiente') {
        seguimiento.estado = 'cancelado'
        seguimiento.motivoCancelacion = motivo
        cancelados++
      }
    }
    return cancelados
  }

  async obtenerPorId(id: string): Promise<SeguimientoProgramado | null> {
    return this.almacen.seguimientosProgramados.find((seguimiento) => seguimiento.id === id) ?? null
  }

  async cambiarEstado(id: string, estado: EstadoSeguimiento): Promise<void> {
    this.cambiar(id, (seguimiento) => {
      seguimiento.estado = estado
    })
  }

  private cambiar(id: string, mutar: (seguimiento: SeguimientoProgramado) => void): void {
    const seguimiento = this.almacen.seguimientosProgramados.find((item) => item.id === id)
    if (seguimiento) {
      mutar(seguimiento)
    }
  }
}

export class RepositorioEventoWebhookEnMemoria implements RepositorioEventoWebhook {
  constructor(private readonly almacen: AlmacenEnMemoria) {}

  async intentarRegistrar(entrada: {
    claveEvento: string
    tipoObjeto: string | null
    cargaUtilOriginal: unknown
    fuente?: string
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
      fuente: entrada.fuente ?? 'whatsapp',
      tipoObjeto: entrada.tipoObjeto,
      estado: 'recibido',
      error: null,
      cargaUtilOriginal: entrada.cargaUtilOriginal,
    }
    this.almacen.eventos.push(evento)
    return { insertado: true, id: evento.id }
  }

  async obtenerRecibidos(
    limite: number,
  ): Promise<{ claveEvento: string; fuente: string; cargaUtilOriginal: unknown }[]> {
    return this.almacen.eventos
      .filter((evento) => evento.estado === 'recibido')
      .slice(0, limite)
      .map((evento) => ({
        claveEvento: evento.claveEvento,
        fuente: evento.fuente,
        cargaUtilOriginal: evento.cargaUtilOriginal,
      }))
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

export type ProveedorMensajesFalsoOpciones = {
  idMensajeMeta?: string
  error?: Error
}

export class ProveedorMensajesFalso implements ProveedorMensajes {
  readonly envios: EntradaEnviarMensaje[] = []
  private readonly idMensajeMeta: string
  private readonly error: Error | undefined

  constructor(opciones: ProveedorMensajesFalsoOpciones = {}) {
    this.idMensajeMeta = opciones.idMensajeMeta ?? 'wamid.SALIENTE.FALSO'
    this.error = opciones.error
  }

  async enviar(entrada: EntradaEnviarMensaje): Promise<ResultadoEnviarMensaje> {
    this.envios.push(entrada)
    if (this.error) {
      throw this.error
    }
    return { idMensajeMeta: this.idMensajeMeta }
  }
}

export class ResolverCredencialCuentaFalso implements ResolverCredencialCuenta {
  constructor(private readonly valores: Record<string, string> = {}) {}

  resolver(cuenta: CredencialesCuenta): string | null {
    if (cuenta.credencialRef && this.valores[cuenta.credencialRef] !== undefined) {
      return this.valores[cuenta.credencialRef] ?? null
    }
    return cuenta.tokenAcceso
  }
}

export class ResolverSecretoWebhookCuentaFalso implements ResolverSecretoWebhookCuenta {
  readonly consultas: string[] = []

  constructor(private readonly secretos: Record<string, string> = {}) {}

  async obtener(idNumeroTelefono: string): Promise<string | null> {
    this.consultas.push(idNumeroTelefono)
    return this.secretos[idNumeroTelefono] ?? null
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
  claveInterna?: string
  proveedor?: ProveedorMensajes
  credenciales?: ResolverCredencialCuenta
  ventanaAtencionActiva?: boolean
  reglasSeguimiento?: ReglaSeguimiento[]
  pausador?: PausadorSeguimientos
  procesadorAutorespuesta?: ProcesadorAutorespuesta
  webhook360?: OpcionesRutasWebhook360Dialog
}

export function crearAppPrueba(dependencias: DependenciasAppPruebaWebhook) {
  const tokenVerificacion = dependencias.tokenVerificacion ?? 'test-verify-token'
  const secretoApp = dependencias.secretoApp ?? 'test-app-secret'
  const almacen = dependencias.almacen ?? new AlmacenEnMemoria()
  almacen.reglasSeguimiento = dependencias.reglasSeguimiento ?? almacen.reglasSeguimiento
  const registrador = crearRegistrador('silent')

  const cuentas = new RepositorioCuentaWhatsAppEnMemoria(dependencias.cuentas)
  const eventos = new RepositorioEventoWebhookEnMemoria(almacen)
  const estados = new RepositorioEstadoMensajeEnMemoria(almacen)
  const transaccion = new TransaccionMensajeEntranteEnMemoria(almacen)
  const proveedor = dependencias.proveedor ?? new ProveedorMensajesFalso()
  const credenciales = dependencias.credenciales ?? new ResolverCredencialCuentaFalso()
  const enviarMensaje = new EnviarMensajeSaliente(cuentas, transaccion, proveedor, credenciales, {
    ventanaAtencionActiva: dependencias.ventanaAtencionActiva ?? false,
  })
  const claveInterna = dependencias.claveInterna
  const rutaMensajes = claveInterna ? { enviarMensaje, claveInterna } : undefined
  const programarSeguimientos = new ProgramarSeguimientos(
    new RepositorioReglaSeguimientoEnMemoria(almacen),
    new RepositorioSeguimientoProgramadoEnMemoria(almacen),
  )
  const rutaSeguimientos = claveInterna ? { programarSeguimientos, claveInterna } : undefined

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
        dependencias.pausador,
        dependencias.procesadorAutorespuesta,
      ),
      secretoApp,
    },
    ...(rutaMensajes ? { mensajes: rutaMensajes } : {}),
    ...(rutaSeguimientos ? { seguimientos: rutaSeguimientos } : {}),
    ...(dependencias.webhook360 ? { webhook360: dependencias.webhook360 } : {}),
  })

  return { app: aplicacion, almacen, tokenVerificacion, secretoApp, proveedor }
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
      proveedor: 'meta',
      credencialRef: null,
      webhookSecretRef: null,
      estaActiva: true,
    },
    {
      id: 'cuenta-soporte',
      codigo: 'linea-soporte',
      nombreComercial: 'Linea Soporte',
      idNumeroTelefono: '222222222222222',
      telefonoVisible: '+5210000000002',
      tokenAcceso: 'token-soporte',
      proveedor: 'meta',
      credencialRef: null,
      webhookSecretRef: null,
      estaActiva: true,
    },
    {
      id: 'cuenta-postventa',
      codigo: 'linea-postventa',
      nombreComercial: 'Linea Postventa',
      idNumeroTelefono: '333333333333333',
      telefonoVisible: '+5210000000003',
      tokenAcceso: 'token-postventa',
      proveedor: 'meta',
      credencialRef: null,
      webhookSecretRef: null,
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

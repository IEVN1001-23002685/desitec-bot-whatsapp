import { esIdMetaValido, esIdWaValido } from '../../../../shared/security/validadores.js'
import { hashSha256 } from '../../../../shared/security/hash.js'
import { enmascararTelefono } from '../../../../shared/logging/registrador.js'
import type { RegistradorApp } from '../../../../shared/logging/registrador.js'
import type { RepositorioEventoWebhook } from '../../domain/ports/repositorio-evento-webhook.js'
import type { RepositorioEstadoMensaje } from '../../domain/ports/repositorio-estado-mensaje.js'
import type { MensajeNormalizado } from '../../domain/types/mensaje-normalizado.js'
import type { EstadoEventoWebhook } from '../../domain/types/estado-evento-webhook.js'
import type {
  MensajeMeta,
  PayloadWebhookMeta,
  ValorMeta,
} from '../../domain/types/payload-webhook.js'
import type { RegistrarMensajeEntrante } from './registrar-mensaje-entrante.js'
import type { ResolverCuentaWhatsApp } from './resolver-cuenta-whatsapp.js'

export type EntradaRecibirEventoWhatsApp = {
  cuerpoCrudo: Buffer
  payload: PayloadWebhookMeta
}

type ResultadoProcesarValor = {
  huboEntrante: boolean
  huboEstado: boolean
  cuentaNoResuelta: boolean
}

export class RecibirEventoWhatsApp {
  constructor(
    private readonly eventos: RepositorioEventoWebhook,
    private readonly resolverCuenta: ResolverCuentaWhatsApp,
    private readonly registrarMensajeEntrante: RegistrarMensajeEntrante,
    private readonly estadosMensaje: RepositorioEstadoMensaje,
    private readonly registrador: RegistradorApp,
  ) {}

  async ejecutar(entrada: EntradaRecibirEventoWhatsApp): Promise<void> {
    const claveEvento = hashSha256(entrada.cuerpoCrudo)

    const conocido = await this.eventos.buscarPorClaveEvento(claveEvento)
    if (conocido && (conocido.estado === 'procesado' || conocido.estado === 'ignorado')) {
      this.registrador.info({ claveEvento }, 'evento de webhook duplicado ignorado')
      return
    }

    if (!conocido) {
      const registro = await this.eventos.intentarRegistrar({
        claveEvento,
        tipoObjeto: entrada.payload.object,
        cargaUtilOriginal: entrada.payload,
      })
      if (!registro.insertado) {
        this.registrador.info({ claveEvento }, 'evento de webhook ya registrado')
        return
      }
    }

    try {
      const estado = await this.procesar(entrada.payload)
      await this.eventos.marcarEstado(claveEvento, estado, null)
    } catch (error) {
      await this.eventos.marcarEstado(claveEvento, 'fallido', mensajeError(error))
      throw error
    }
  }

  private async procesar(payload: PayloadWebhookMeta): Promise<EstadoEventoWebhook> {
    let huboEntrante = false
    let huboEstado = false
    let cuentaNoResuelta = false

    for (const entrada of payload.entry) {
      for (const cambio of entrada.changes) {
        if (cambio.field !== 'messages') {
          this.registrador.info({ campo: cambio.field }, 'ignorando campo de webhook no soportado')
          continue
        }

        const resultado = await this.procesarValor(cambio.value)
        huboEntrante = huboEntrante || resultado.huboEntrante
        huboEstado = huboEstado || resultado.huboEstado
        cuentaNoResuelta = cuentaNoResuelta || resultado.cuentaNoResuelta
      }
    }

    if (huboEntrante || huboEstado) {
      return 'procesado'
    }

    if (cuentaNoResuelta) {
      return 'ignorado'
    }

    return 'ignorado'
  }

  private async procesarValor(valor: ValorMeta): Promise<ResultadoProcesarValor> {
    const cuenta = await this.resolverCuenta.ejecutar(valor.metadata.phone_number_id)

    const huboEstado = await this.procesarEstados(valor)

    if (!cuenta) {
      this.registrador.warn(
        { idNumeroTelefono: enmascararTelefono(valor.metadata.phone_number_id) },
        'webhook recibido para una cuenta de whatsapp desconocida o inactiva',
      )
      return { huboEntrante: false, huboEstado, cuentaNoResuelta: true }
    }

    const nombresPerfil = new Map<string, string>()
    for (const contacto of valor.contacts ?? []) {
      const nombre = contacto.profile?.name
      if (nombre) {
        nombresPerfil.set(contacto.wa_id, nombre)
      }
    }

    const recibidoEn = new Date()
    let huboEntrante = false

    for (const mensaje of valor.messages ?? []) {
      if (!esIdWaValido(mensaje.from)) {
        this.registrador.warn({ idMensaje: mensaje.id }, 'descartando mensaje con idWa inválido')
        continue
      }

      huboEntrante = true
      const normalizado = normalizarMensaje(mensaje)
      const resultado = await this.registrarMensajeEntrante.ejecutar({
        cuenta,
        mensaje: normalizado,
        nombrePerfil: nombresPerfil.get(mensaje.from) ?? null,
        recibidoEn,
      })

      this.registrador.info(
        {
          codigoCuenta: cuenta.codigo,
          idWa: enmascararTelefono(mensaje.from),
          tipo: normalizado.tipo,
          soportado: normalizado.soportado,
          insertado: resultado.mensajeInsertado,
        },
        'mensaje entrante de whatsapp registrado',
      )
    }

    return { huboEntrante, huboEstado, cuentaNoResuelta: false }
  }

  private async procesarEstados(valor: ValorMeta): Promise<boolean> {
    const estados = valor.statuses ?? []
    for (const estado of estados) {
      if (!esIdMetaValido(estado.id)) {
        this.registrador.warn({}, 'descartando evento de estado con id de mensaje inválido')
        continue
      }
      const actualizado = await this.estadosMensaje.actualizarEstado(estado.id, estado.status)
      this.registrador.info(
        { idMensajeMeta: estado.id, estado: estado.status, actualizado },
        'estado de entrega de whatsapp recibido',
      )
    }
    return estados.length > 0
  }
}

function normalizarMensaje(mensaje: MensajeMeta): MensajeNormalizado {
  const soportado = mensaje.type === 'text'
  return {
    idMensajeMeta: mensaje.id,
    idWa: mensaje.from,
    tipo: mensaje.type,
    cuerpo: soportado ? (mensaje.text?.body ?? null) : null,
    cargaUtil: mensaje,
    marcaTiempoMeta: parsearMarcaTiempoMeta(mensaje.timestamp),
    soportado,
  }
}

function parsearMarcaTiempoMeta(valor: string | undefined): Date | null {
  if (!valor) {
    return null
  }
  const segundos = Number(valor)
  if (!Number.isFinite(segundos)) {
    return null
  }
  return new Date(segundos * 1000)
}

function mensajeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Error desconocido'
}
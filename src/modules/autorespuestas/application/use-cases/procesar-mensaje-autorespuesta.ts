import { clavePedirPaso, procesarMensajeLead } from '../../domain/services/maquina-flujo-lead.js'
import { esSolicitudDeHumano } from '../../domain/services/detectar-solicitud-humano.js'
import type { Lead } from '../../domain/entities/lead.js'
import type { RepositorioLead } from '../../domain/ports/repositorio-lead.js'
import type { RepositorioGuionLead } from '../../domain/ports/repositorio-guion-lead.js'
import type { EnviarMensajeSaliente } from '../../../whatsapp/application/use-cases/enviar-mensaje-saliente.js'
import type { EntradaProcesarAutorespuesta } from '../../../whatsapp/application/ports/procesador-autorespuesta.js'
import type { PausadorSeguimientos } from '../../../whatsapp/application/ports/pausador-seguimientos.js'
import type { RegistradorApp } from '../../../../shared/logging/registrador.js'
import { coincideNumeroWhatsApp } from '../../../../shared/security/validadores.js'

export class ErrorGuionLeadNoEncontrado extends Error {
  constructor(clave: string) {
    super(`No hay una entrada activa del guion para la clave ${clave}`)
    this.name = 'ErrorGuionLeadNoEncontrado'
  }
}

export class ProcesarMensajeAutorespuesta {
  constructor(
    private readonly leads: RepositorioLead,
    private readonly guion: RepositorioGuionLead,
    private readonly enviarMensaje: EnviarMensajeSaliente,
    private readonly numerosPermitidos: readonly string[] = [],
    private readonly pausador?: PausadorSeguimientos,
    private readonly registrador?: RegistradorApp,
  ) {}

  async procesar(entrada: EntradaProcesarAutorespuesta): Promise<void> {
    if (!this.numeroPermitido(entrada.idWa)) {
      return
    }

    const lead = await this.leads.buscarPorConversacion(entrada.idConversacion)
    if (lead?.estado === 'en_asesor') {
      return
    }

    if (entrada.texto !== null && esSolicitudDeHumano(entrada.texto)) {
      await this.derivarAHumano(entrada, lead)
      return
    }

    if (!lead) {
      const creado = await this.leads.crear({ idConversacion: entrada.idConversacion })
      if (entrada.texto === null) {
        await this.responder(entrada, 'bienvenida')
        return
      }
      await this.procesarTexto(entrada, creado, true)
      return
    }

    if (lead.estado !== 'capturando') {
      return
    }

    if (entrada.texto === null) {
      await this.responder(entrada, clavePedirPaso(lead.pasoActual))
      return
    }

    await this.procesarTexto(entrada, lead, false)
  }

  private async procesarTexto(
    entrada: EntradaProcesarAutorespuesta,
    lead: Lead,
    esPrimerMensaje: boolean,
  ): Promise<void> {
    if (entrada.texto === null) {
      return
    }

    const { cambios, claveRespuesta } = procesarMensajeLead({
      lead,
      texto: entrada.texto,
      esPrimerMensaje,
    })

    await this.leads.actualizar(lead.id, cambios)
    await this.responder(entrada, claveRespuesta)
  }

  private async derivarAHumano(
    entrada: EntradaProcesarAutorespuesta,
    lead: Lead | null,
  ): Promise<void> {
    const actual = lead ?? (await this.leads.crear({ idConversacion: entrada.idConversacion }))
    await this.leads.actualizar(actual.id, {
      nombre: actual.nombre,
      correo: actual.correo,
      modelos: actual.modelos,
      cantidad: actual.cantidad,
      ciudad: actual.ciudad,
      pasoActual: actual.pasoActual,
      estado: 'en_asesor',
      completadoEn: actual.completadoEn,
    })
    await this.pausarSeguimientos(entrada.idConversacion)
    this.registrador?.info(
      {
        idConversacion: entrada.idConversacion,
        codigoCuenta: entrada.codigoCuenta,
        pasoActual: actual.pasoActual,
      },
      'lead derivado a asesor',
    )
    await this.responder(entrada, 'paso_a_asesor')
  }

  private async pausarSeguimientos(idConversacion: string): Promise<void> {
    if (!this.pausador) {
      return
    }
    try {
      await this.pausador.pausarPorRespuesta(idConversacion, 'cliente')
    } catch (error) {
      this.registrador?.error(
        { idConversacion, error: mensajeError(error) },
        'no se pudieron pausar los seguimientos al derivar a asesor',
      )
    }
  }

  private numeroPermitido(idWa: string): boolean {
    if (this.numerosPermitidos.length === 0) {
      return true
    }
    return this.numerosPermitidos.some((numero) => coincideNumeroWhatsApp(numero, idWa))
  }

  private async responder(entrada: EntradaProcesarAutorespuesta, clave: string): Promise<void> {
    const guion = await this.guion.buscarActivaPorClave(clave)
    if (!guion) {
      throw new ErrorGuionLeadNoEncontrado(clave)
    }
    await this.enviarMensaje.ejecutar({
      codigoCuenta: entrada.codigoCuenta,
      idWa: entrada.idWa,
      cuerpo: guion.texto,
    })
  }
}

function mensajeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Error desconocido'
}

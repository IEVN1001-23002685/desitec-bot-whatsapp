import {
  clavePedirPaso,
  evaluarPaso,
  type CampoLead,
} from '../../domain/services/maquina-flujo-lead.js'
import type { Lead } from '../../domain/entities/lead.js'
import type { ActualizacionLead, RepositorioLead } from '../../domain/ports/repositorio-lead.js'
import type { RepositorioGuionLead } from '../../domain/ports/repositorio-guion-lead.js'
import type { EnviarMensajeSaliente } from '../../../whatsapp/application/use-cases/enviar-mensaje-saliente.js'
import type { EntradaProcesarAutorespuesta } from '../../../whatsapp/application/ports/procesador-autorespuesta.js'
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
  ) {}

  async procesar(entrada: EntradaProcesarAutorespuesta): Promise<void> {
    if (!this.numeroPermitido(entrada.idWa)) {
      return
    }

    const lead = await this.leads.buscarPorConversacion(entrada.idConversacion)
    if (!lead) {
      await this.leads.crear({ idConversacion: entrada.idConversacion })
      await this.responder(entrada, 'bienvenida')
      return
    }

    if (lead.estado !== 'capturando') {
      return
    }

    if (entrada.texto === null) {
      await this.responder(entrada, clavePedirPaso(lead.pasoActual))
      return
    }

    const evaluacion = evaluarPaso(lead.pasoActual, entrada.texto)
    if (!evaluacion.valido) {
      await this.responder(entrada, evaluacion.claveRespuesta)
      return
    }

    const siguiente = evaluacion.siguiente
    await this.leads.actualizar(lead.id, {
      ...aplicarCampo(lead, evaluacion.campo),
      pasoActual: siguiente ?? lead.pasoActual,
      estado: siguiente === null ? 'listo_pipedrive' : 'capturando',
      completadoEn: siguiente === null ? new Date() : null,
    })
    await this.responder(entrada, siguiente === null ? 'confirmacion' : clavePedirPaso(siguiente))
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

type DatosLead = Omit<ActualizacionLead, 'pasoActual' | 'estado' | 'completadoEn'>

function aplicarCampo(lead: Lead, campo: CampoLead): DatosLead {
  const datos: DatosLead = {
    nombre: lead.nombre,
    correo: lead.correo,
    modelos: lead.modelos,
    cantidad: lead.cantidad,
    ciudad: lead.ciudad,
  }
  switch (campo.campo) {
    case 'nombre':
      datos.nombre = campo.valor
      break
    case 'correo':
      datos.correo = campo.valor
      break
    case 'modelos':
      datos.modelos = campo.valor
      break
    case 'cantidad':
      datos.cantidad = campo.valor
      break
    case 'ciudad':
      datos.ciudad = campo.valor
      break
  }
  return datos
}

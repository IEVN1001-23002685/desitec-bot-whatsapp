import { ErrorCuentaSinToken } from '../../../../shared/errors/error-de-app.js'
import type { ReglaSeguimiento } from '../../domain/entities/regla-seguimiento.js'
import type { SeguimientoProgramado } from '../../domain/entities/seguimiento-programado.js'
import type { RepositorioDestinoSeguimiento } from '../../domain/ports/repositorio-destino-seguimiento.js'
import type { RepositorioPlantilla } from '../../domain/ports/repositorio-plantilla.js'
import type { RepositorioReglaSeguimiento } from '../../domain/ports/repositorio-regla-seguimiento.js'
import type { VerificadorEstadoComercial } from '../../domain/ports/verificador-estado-comercial.js'
import type { TransaccionMensajeEntrante } from '../../../whatsapp/application/ports/transaccion-mensaje-entrante.js'
import type {
  EntradaEnviarMensaje,
  ProveedorMensajes,
} from '../../../whatsapp/domain/ports/proveedor-mensajes.js'

export class ErrorSeguimientoNoSeguible extends Error {
  constructor(motivo: string) {
    super(motivo)
    this.name = 'ErrorSeguimientoNoSeguible'
  }
}

export type ResultadoEnviarSeguimiento = {
  idMensajeMeta: string
}

export class EnviarSeguimientoProgramado {
  constructor(
    private readonly reglas: RepositorioReglaSeguimiento,
    private readonly plantillas: RepositorioPlantilla,
    private readonly destinos: RepositorioDestinoSeguimiento,
    private readonly verificador: VerificadorEstadoComercial,
    private readonly proveedor: ProveedorMensajes,
    private readonly transaccion: TransaccionMensajeEntrante,
  ) {}

  async ejecutar(seguimiento: SeguimientoProgramado): Promise<ResultadoEnviarSeguimiento> {
    const regla = await this.reglas.buscarActivaPorId(seguimiento.idReglaSeguimiento)
    if (!regla) {
      throw new ErrorSeguimientoNoSeguible('La regla de seguimiento ya no esta activa')
    }

    const puedeSeguir = await this.verificador.puedeSeguir(seguimiento.idConversacion)
    if (!puedeSeguir) {
      throw new ErrorSeguimientoNoSeguible(
        'El estado comercial no permite continuar el seguimiento',
      )
    }

    const destino = await this.destinos.obtenerDestino(seguimiento.idConversacion)
    if (!destino) {
      throw new ErrorSeguimientoNoSeguible('La conversacion del seguimiento no existe')
    }
    const tokenAcceso = destino.tokenAcceso
    if (!tokenAcceso) {
      throw new ErrorCuentaSinToken()
    }

    const entrada = await this.construirEntrada(
      regla,
      destino.idNumeroTelefono,
      tokenAcceso,
      destino.idWa,
    )
    const envio = await this.proveedor.enviar(entrada)
    const enviadoEn = new Date()

    await this.transaccion.ejecutar(async (contexto) => {
      await contexto.mensajes.insertarSaliente({
        idConversacion: destino.idConversacion,
        idCuentaWhatsApp: destino.idCuentaWhatsApp,
        idMensajeMeta: envio.idMensajeMeta,
        tipo: entrada.tipo,
        cuerpo: entrada.tipo === 'text' ? entrada.cuerpo : null,
        estado: 'enviado',
      })
      await contexto.conversaciones.actualizarUltimoMensaje(destino.idConversacion, enviadoEn)
    })

    return { idMensajeMeta: envio.idMensajeMeta }
  }

  private async construirEntrada(
    regla: ReglaSeguimiento,
    idNumeroTelefono: string,
    tokenAcceso: string,
    idWa: string,
  ): Promise<EntradaEnviarMensaje> {
    if (regla.idPlantilla) {
      const plantilla = await this.plantillas.buscarActivaPorId(regla.idPlantilla)
      if (!plantilla) {
        throw new ErrorSeguimientoNoSeguible('La plantilla del seguimiento ya no esta activa')
      }
      return {
        tipo: 'template',
        idNumeroTelefono,
        tokenAcceso,
        idWa,
        nombrePlantilla: plantilla.nombreMeta,
        idiomaPlantilla: plantilla.idioma,
      }
    }

    if (!regla.cuerpo) {
      throw new ErrorSeguimientoNoSeguible('La regla de seguimiento no tiene plantilla ni cuerpo')
    }
    return { tipo: 'text', idNumeroTelefono, tokenAcceso, idWa, cuerpo: regla.cuerpo }
  }
}

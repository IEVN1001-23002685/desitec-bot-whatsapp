import { BuscarOCrearContacto } from '../../../contacts/application/use-cases/buscar-o-crear-contacto.js'
import { BuscarOCrearConversacion } from '../../../conversations/application/use-cases/buscar-o-crear-conversacion.js'
import type { CuentaWhatsApp } from '../../domain/entities/cuenta-whatsapp.js'
import type { MensajeNormalizado } from '../../domain/types/mensaje-normalizado.js'
import type { TransaccionMensajeEntrante } from '../ports/transaccion-mensaje-entrante.js'

export type EntradaRegistrarMensajeEntrante = {
  cuenta: CuentaWhatsApp
  mensaje: MensajeNormalizado
  nombrePerfil: string | null
  recibidoEn: Date
}

export type ResultadoRegistrarMensajeEntrante = {
  idConversacion: string
  mensajeInsertado: boolean
}

export class RegistrarMensajeEntrante {
  constructor(private readonly transaccion: TransaccionMensajeEntrante) {}

  async ejecutar(
    entrada: EntradaRegistrarMensajeEntrante,
  ): Promise<ResultadoRegistrarMensajeEntrante> {
    return this.transaccion.ejecutar(async (contexto) => {
      const contacto = await new BuscarOCrearContacto(contexto.contactos).ejecutar({
        idWa: entrada.mensaje.idWa,
        nombrePerfil: entrada.nombrePerfil,
      })

      const conversacion = await new BuscarOCrearConversacion(contexto.conversaciones).ejecutar({
        idCuentaWhatsApp: entrada.cuenta.id,
        idContacto: contacto.id,
        en: entrada.recibidoEn,
      })

      const resultado = await contexto.mensajes.insertarEntrante({
        idConversacion: conversacion.id,
        idCuentaWhatsApp: entrada.cuenta.id,
        idMensajeMeta: entrada.mensaje.idMensajeMeta,
        tipo: entrada.mensaje.tipo,
        cuerpo: entrada.mensaje.cuerpo,
        cargaUtil: entrada.mensaje.cargaUtil,
        marcaTiempoMeta: entrada.mensaje.marcaTiempoMeta,
      })

      if (resultado.insertado) {
        await contexto.conversaciones.actualizarUltimoMensaje(conversacion.id, entrada.recibidoEn)
      }

      return { idConversacion: conversacion.id, mensajeInsertado: resultado.insertado }
    })
  }
}
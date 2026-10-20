import { BuscarOCrearContacto } from '../../../contacts/application/use-cases/buscar-o-crear-contacto.js'
import { BuscarOCrearConversacion } from '../../../conversations/application/use-cases/buscar-o-crear-conversacion.js'
import {
  ErrorCuentaNoEncontrada,
  ErrorCuentaSinToken,
  ErrorFueraDeVentanaAtencion,
} from '../../../../shared/errors/error-de-app.js'
import type { RepositorioCuentaWhatsApp } from '../../domain/ports/repositorio-cuenta-whatsapp.js'
import type { ProveedorMensajes } from '../../domain/ports/proveedor-mensajes.js'
import type { ResolverCredencialCuenta } from '../../domain/ports/resolver-credencial-cuenta.js'
import type { TransaccionMensajeEntrante } from '../ports/transaccion-mensaje-entrante.js'

const HORAS_VENTANA_ATENCION = 24
const MILISEGUNDOS_POR_HORA = 3_600_000

export type EntradaEnviarMensajeSaliente = {
  codigoCuenta: string
  idWa: string
  cuerpo: string
  ahora?: Date
}

export type ResultadoEnviarMensajeSaliente = {
  idMensajeMeta: string
  idConversacion: string
}

export type OpcionesEnviarMensajeSaliente = {
  ventanaAtencionActiva: boolean
}

export class EnviarMensajeSaliente {
  constructor(
    private readonly cuentas: RepositorioCuentaWhatsApp,
    private readonly transaccion: TransaccionMensajeEntrante,
    private readonly proveedor: ProveedorMensajes,
    private readonly credenciales: ResolverCredencialCuenta,
    private readonly opciones: OpcionesEnviarMensajeSaliente,
  ) {}

  async ejecutar(entrada: EntradaEnviarMensajeSaliente): Promise<ResultadoEnviarMensajeSaliente> {
    const ahora = entrada.ahora ?? new Date()

    const cuenta = await this.cuentas.buscarPorCodigo(entrada.codigoCuenta)
    if (!cuenta) {
      throw new ErrorCuentaNoEncontrada()
    }
    const credencial = this.credenciales.resolver({
      proveedor: cuenta.proveedor,
      credencialRef: cuenta.credencialRef,
      tokenAcceso: cuenta.tokenAcceso,
    })
    if (!credencial) {
      throw new ErrorCuentaSinToken()
    }

    const { idConversacion, ultimoEntrante } = await this.transaccion.ejecutar(async (contexto) => {
      const contacto = await new BuscarOCrearContacto(contexto.contactos).ejecutar({
        idWa: entrada.idWa,
        nombrePerfil: null,
      })
      const conversacion = await new BuscarOCrearConversacion(contexto.conversaciones).ejecutar({
        idCuentaWhatsApp: cuenta.id,
        idContacto: contacto.id,
        en: ahora,
      })
      const ultimoEntrante = await contexto.mensajes.buscarUltimoEntranteEn(conversacion.id)
      return { idConversacion: conversacion.id, ultimoEntrante }
    })

    if (this.opciones.ventanaAtencionActiva && fueraDeVentana(ultimoEntrante, ahora)) {
      throw new ErrorFueraDeVentanaAtencion()
    }

    const envio = await this.proveedor.enviar({
      tipo: 'text',
      proveedor: cuenta.proveedor,
      idNumeroTelefono: cuenta.idNumeroTelefono,
      credencial,
      idWa: entrada.idWa,
      cuerpo: entrada.cuerpo,
    })

    await this.transaccion.ejecutar(async (contexto) => {
      await contexto.mensajes.insertarSaliente({
        idConversacion,
        idCuentaWhatsApp: cuenta.id,
        idMensajeMeta: envio.idMensajeMeta,
        tipo: 'text',
        cuerpo: entrada.cuerpo,
        estado: 'enviado',
      })
      await contexto.conversaciones.actualizarUltimoMensaje(idConversacion, ahora)
    })

    return { idMensajeMeta: envio.idMensajeMeta, idConversacion }
  }
}

function fueraDeVentana(ultimoEntrante: Date | null, ahora: Date): boolean {
  if (!ultimoEntrante) {
    return true
  }
  return ahora.getTime() - ultimoEntrante.getTime() > HORAS_VENTANA_ATENCION * MILISEGUNDOS_POR_HORA
}

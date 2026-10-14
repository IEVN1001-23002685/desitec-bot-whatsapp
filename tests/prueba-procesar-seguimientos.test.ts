import { describe, expect, it } from 'vitest'
import {
  AlmacenEnMemoria,
  ProveedorMensajesFalso,
  RepositorioDestinoSeguimientoEnMemoria,
  RepositorioPlantillaEnMemoria,
  RepositorioReglaSeguimientoEnMemoria,
  RepositorioSeguimientoProgramadoEnMemoria,
  TransaccionMensajeEntranteEnMemoria,
  VerificadorEstadoComercialFalso,
} from './helpers/en-memoria.js'
import { EnviarSeguimientoProgramado } from '../src/modules/followups/application/use-cases/enviar-seguimiento-programado.js'
import { ProcesarSeguimientosPendientes } from '../src/modules/followups/application/use-cases/procesar-seguimientos-pendientes.js'
import type { PlantillaWhatsApp } from '../src/modules/followups/domain/entities/plantilla-whatsapp.js'
import type { ReglaSeguimiento } from '../src/modules/followups/domain/entities/regla-seguimiento.js'
import type { SeguimientoProgramado } from '../src/modules/followups/domain/entities/seguimiento-programado.js'
import type { DestinoSeguimiento } from '../src/modules/followups/domain/ports/repositorio-destino-seguimiento.js'

const CONVERSACION = 'conv-1'
const REGLA_ID = 'regla-1'

function regla(sobrescrituras: Partial<ReglaSeguimiento> = {}): ReglaSeguimiento {
  return {
    id: REGLA_ID,
    codigo: 'seguimiento_24h',
    nombre: 'Seguimiento 24h',
    idCuentaWhatsApp: 'cuenta-1',
    demoraHoras: 24,
    idPlantilla: null,
    cuerpo: 'Hola, sigues interesado?',
    activa: true,
    ...sobrescrituras,
  }
}

function plantilla(): PlantillaWhatsApp {
  return {
    id: 'plantilla-1',
    codigo: 'seguimiento_24h',
    nombreMeta: 'seguimiento_24h',
    idioma: 'es_ES',
    categoria: 'marketing',
    componentes: {},
    activa: true,
  }
}

function destino(): DestinoSeguimiento {
  return {
    idConversacion: CONVERSACION,
    idCuentaWhatsApp: 'cuenta-1',
    idNumeroTelefono: '111111111111111',
    tokenAcceso: 'token-1',
    idWa: '5215512345678',
  }
}

function seguimientoPendiente(
  sobrescrituras: Partial<SeguimientoProgramado> = {},
): SeguimientoProgramado {
  return {
    id: 'seg-1',
    idConversacion: CONVERSACION,
    idReglaSeguimiento: REGLA_ID,
    programadoPara: new Date(Date.now() - 60_000),
    estado: 'pendiente',
    intentos: 0,
    idMensajeMeta: null,
    error: null,
    motivoCancelacion: null,
    enviadoEn: null,
    ...sobrescrituras,
  }
}

function crearProcesador(opciones: {
  almacen: AlmacenEnMemoria
  reglas: ReglaSeguimiento[]
  plantillas?: PlantillaWhatsApp[]
  destinos?: Record<string, DestinoSeguimiento>
  noSeguibles?: string[]
  proveedor: ProveedorMensajesFalso
}) {
  const { almacen } = opciones
  const transaccion = new TransaccionMensajeEntranteEnMemoria(almacen)
  const enviarSeguimiento = new EnviarSeguimientoProgramado(
    new RepositorioReglaSeguimientoEnMemoria(almacen),
    new RepositorioPlantillaEnMemoria(opciones.plantillas ?? []),
    new RepositorioDestinoSeguimientoEnMemoria(opciones.destinos ?? {}),
    new VerificadorEstadoComercialFalso(opciones.noSeguibles ?? []),
    opciones.proveedor,
    transaccion,
  )
  return new ProcesarSeguimientosPendientes(
    new RepositorioSeguimientoProgramadoEnMemoria(almacen),
    enviarSeguimiento,
  )
}

describe('ProcesarSeguimientosPendientes', () => {
  it('envia un seguimiento pendiente con plantilla y persiste el mensaje saliente', async () => {
    const almacen = new AlmacenEnMemoria()
    almacen.reglasSeguimiento = [regla({ idPlantilla: 'plantilla-1' })]
    almacen.seguimientosProgramados = [seguimientoPendiente()]
    const proveedor = new ProveedorMensajesFalso({ idMensajeMeta: 'wamid.SEG.1' })
    const procesar = crearProcesador({
      almacen,
      reglas: almacen.reglasSeguimiento,
      plantillas: [plantilla()],
      destinos: { [CONVERSACION]: destino() },
      proveedor,
    })

    const resultado = await procesar.ejecutar({ limite: 10 })

    expect(resultado).toEqual({ procesados: 1, enviados: 1, fallidos: 0, cancelados: 0 })
    expect(proveedor.envios).toHaveLength(1)
    expect(proveedor.envios[0]).toMatchObject({
      tipo: 'template',
      nombrePlantilla: 'seguimiento_24h',
      idiomaPlantilla: 'es_ES',
      idWa: '5215512345678',
    })
    expect(almacen.seguimientosProgramados[0]).toMatchObject({
      estado: 'enviado',
      idMensajeMeta: 'wamid.SEG.1',
    })
    expect(almacen.mensajes).toHaveLength(1)
    expect(almacen.mensajes[0]).toMatchObject({ direccion: 'saliente', tipo: 'template' })
  })

  it('envia un texto cuando la regla no tiene plantilla', async () => {
    const almacen = new AlmacenEnMemoria()
    almacen.reglasSeguimiento = [regla({ cuerpo: 'Mensaje de texto' })]
    almacen.seguimientosProgramados = [seguimientoPendiente()]
    const proveedor = new ProveedorMensajesFalso()
    const procesar = crearProcesador({
      almacen,
      reglas: almacen.reglasSeguimiento,
      destinos: { [CONVERSACION]: destino() },
      proveedor,
    })

    const resultado = await procesar.ejecutar()

    expect(resultado.enviados).toBe(1)
    expect(proveedor.envios[0]).toMatchObject({ tipo: 'text', cuerpo: 'Mensaje de texto' })
  })

  it('no procesa seguimientos programados para el futuro', async () => {
    const almacen = new AlmacenEnMemoria()
    almacen.reglasSeguimiento = [regla()]
    almacen.seguimientosProgramados = [
      seguimientoPendiente({ programadoPara: new Date(Date.now() + 3_600_000) }),
    ]
    const proveedor = new ProveedorMensajesFalso()
    const procesar = crearProcesador({
      almacen,
      reglas: almacen.reglasSeguimiento,
      destinos: { [CONVERSACION]: destino() },
      proveedor,
    })

    const resultado = await procesar.ejecutar()

    expect(resultado).toEqual({ procesados: 0, enviados: 0, fallidos: 0, cancelados: 0 })
    expect(proveedor.envios).toHaveLength(0)
  })

  it('cancela el seguimiento cuando el estado comercial no permite continuar', async () => {
    const almacen = new AlmacenEnMemoria()
    almacen.reglasSeguimiento = [regla()]
    almacen.seguimientosProgramados = [seguimientoPendiente()]
    const proveedor = new ProveedorMensajesFalso()
    const procesar = crearProcesador({
      almacen,
      reglas: almacen.reglasSeguimiento,
      destinos: { [CONVERSACION]: destino() },
      noSeguibles: [CONVERSACION],
      proveedor,
    })

    const resultado = await procesar.ejecutar()

    expect(resultado).toEqual({ procesados: 1, enviados: 0, fallidos: 0, cancelados: 1 })
    expect(proveedor.envios).toHaveLength(0)
    expect(almacen.seguimientosProgramados[0]).toMatchObject({ estado: 'cancelado' })
    expect(almacen.seguimientosProgramados[0]?.motivoCancelacion).not.toBeNull()
  })

  it('marca fallido el seguimiento cuando el envio a Meta falla', async () => {
    const almacen = new AlmacenEnMemoria()
    almacen.reglasSeguimiento = [regla()]
    almacen.seguimientosProgramados = [seguimientoPendiente()]
    const proveedor = new ProveedorMensajesFalso({ error: new Error('Meta caido') })
    const procesar = crearProcesador({
      almacen,
      reglas: almacen.reglasSeguimiento,
      destinos: { [CONVERSACION]: destino() },
      proveedor,
    })

    const resultado = await procesar.ejecutar()

    expect(resultado).toEqual({ procesados: 1, enviados: 0, fallidos: 1, cancelados: 0 })
    expect(almacen.seguimientosProgramados[0]).toMatchObject({
      estado: 'fallido',
      error: 'Meta caido',
    })
  })
})

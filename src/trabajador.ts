import 'dotenv/config'
import { cargarVariablesEntorno } from './shared/config/variables-entorno.js'
import { crearRegistrador } from './shared/logging/registrador.js'
import { crearBaseDeDatos } from './shared/db/cliente-bd.js'
import { RepositorioDrizzleDestinoSeguimiento } from './modules/followups/infrastructure/repositories/repositorio-drizzle-destino-seguimiento.js'
import { RepositorioDrizzlePlantilla } from './modules/followups/infrastructure/repositories/repositorio-drizzle-plantilla.js'
import { RepositorioDrizzleReglaSeguimiento } from './modules/followups/infrastructure/repositories/repositorio-drizzle-regla-seguimiento.js'
import { RepositorioDrizzleSeguimientoProgramado } from './modules/followups/infrastructure/repositories/repositorio-drizzle-seguimiento-programado.js'
import { VerificadorEstadoComercialLocal } from './modules/followups/infrastructure/verificadores/verificador-estado-comercial-local.js'
import { EnviarSeguimientoProgramado } from './modules/followups/application/use-cases/enviar-seguimiento-programado.js'
import { ProcesarSeguimientosPendientes } from './modules/followups/application/use-cases/procesar-seguimientos-pendientes.js'
import { ProveedorMetaMensajes } from './modules/whatsapp/infrastructure/providers/proveedor-meta-mensajes.js'
import { TransaccionDrizzleMensajeEntrante } from './modules/whatsapp/infrastructure/transactions/transaccion-drizzle-mensaje-entrante.js'

const ESPERA_REINTENTO_MS = 100

async function principal(): Promise<void> {
  const entorno = cargarVariablesEntorno()
  const registrador = crearRegistrador(entorno.LOG_LEVEL)
  const { baseDeDatos, cerrar } = crearBaseDeDatos(entorno.DATABASE_URL)

  const proveedor = new ProveedorMetaMensajes({
    versionApi: entorno.META_API_VERSION,
    dryRun: entorno.WHATSAPP_DRY_RUN,
    registrador,
  })
  const enviarSeguimiento = new EnviarSeguimientoProgramado(
    new RepositorioDrizzleReglaSeguimiento(baseDeDatos),
    new RepositorioDrizzlePlantilla(baseDeDatos),
    new RepositorioDrizzleDestinoSeguimiento(baseDeDatos),
    new VerificadorEstadoComercialLocal(),
    proveedor,
    new TransaccionDrizzleMensajeEntrante(baseDeDatos),
  )
  const procesar = new ProcesarSeguimientosPendientes(
    new RepositorioDrizzleSeguimientoProgramado(baseDeDatos),
    enviarSeguimiento,
  )

  const intervalo = entorno.WHATSAPP_SEGUIMIENTOS_INTERVALO_MS
  const lote = entorno.WHATSAPP_SEGUIMIENTOS_LOTE

  let detenido = false
  let ejecutando = false
  let temporizador: NodeJS.Timeout | undefined

  const ciclo = async (): Promise<void> => {
    if (detenido || ejecutando) {
      return
    }
    ejecutando = true
    try {
      const resultado = await procesar.ejecutar({ limite: lote })
      if (resultado.procesados > 0) {
        registrador.info(resultado, 'lote de seguimientos procesado')
      }
    } catch (error) {
      registrador.error({ error: mensajeDeError(error) }, 'fallo al procesar seguimientos')
    } finally {
      ejecutando = false
      if (!detenido) {
        temporizador = setTimeout(() => void ciclo(), intervalo)
      }
    }
  }

  const apagar = async (senal: string): Promise<void> => {
    if (detenido) {
      return
    }
    detenido = true
    registrador.info({ senal }, 'deteniendo worker de seguimientos')
    if (temporizador) {
      clearTimeout(temporizador)
    }
    while (ejecutando) {
      await new Promise((resolver) => setTimeout(resolver, ESPERA_REINTENTO_MS))
    }
    await cerrar()
    process.exit(0)
  }

  process.on('SIGINT', () => {
    void apagar('SIGINT')
  })
  process.on('SIGTERM', () => {
    void apagar('SIGTERM')
  })

  registrador.info(
    { intervalo, lote, dryRun: entorno.WHATSAPP_DRY_RUN },
    'worker de seguimientos iniciado',
  )
  void ciclo()
}

function mensajeDeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Error desconocido'
}

principal().catch((error) => {
  console.error('No se pudo iniciar el worker', error)
  process.exit(1)
})

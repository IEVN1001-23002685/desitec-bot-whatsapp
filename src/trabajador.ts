import 'dotenv/config'
import { cargarVariablesEntorno } from './shared/config/variables-entorno.js'
import { crearRegistrador } from './shared/logging/registrador.js'
import { crearBaseDeDatos } from './shared/db/cliente-bd.js'
import { RepositorioDrizzleDestinoSeguimiento } from './modules/followups/infrastructure/repositories/repositorio-drizzle-destino-seguimiento.js'
import { RepositorioDrizzlePlantilla } from './modules/followups/infrastructure/repositories/repositorio-drizzle-plantilla.js'
import { RepositorioDrizzleReglaSeguimiento } from './modules/followups/infrastructure/repositories/repositorio-drizzle-regla-seguimiento.js'
import { RepositorioDrizzleSeguimientoProgramado } from './modules/followups/infrastructure/repositories/repositorio-drizzle-seguimiento-programado.js'
import { PausadorSeguimientosRespuesta } from './modules/followups/infrastructure/adapters/pausador-seguimientos-respuesta.js'
import { VerificadorEstadoComercialLocal } from './modules/followups/infrastructure/verificadores/verificador-estado-comercial-local.js'
import { EnviarSeguimientoProgramado } from './modules/followups/application/use-cases/enviar-seguimiento-programado.js'
import { ProcesarSeguimientosPendientes } from './modules/followups/application/use-cases/procesar-seguimientos-pendientes.js'
import { ProcesarMensajeAutorespuesta } from './modules/autorespuestas/application/use-cases/procesar-mensaje-autorespuesta.js'
import { RepositorioDrizzleGuionLead } from './modules/autorespuestas/infrastructure/repositories/repositorio-drizzle-guion-lead.js'
import { RepositorioDrizzleLead } from './modules/autorespuestas/infrastructure/repositories/repositorio-drizzle-lead.js'
import { ProcesarMensajeAutorespuestaIA } from './modules/ia/application/use-cases/procesar-mensaje-autorespuesta-ia.js'
import { ProveedorGemini } from './modules/ia/infrastructure/providers/proveedor-gemini.js'
import { crearClienteGenAI } from './modules/ia/infrastructure/providers/cliente-genai.js'
import { RepositorioDrizzleMensaje } from './modules/conversations/infrastructure/repositories/repositorio-drizzle-mensaje.js'
import { EnviarMensajeSaliente } from './modules/whatsapp/application/use-cases/enviar-mensaje-saliente.js'
import { ProcesarEventosWebhookPendientes } from './modules/whatsapp/application/use-cases/procesar-eventos-webhook-pendientes.js'
import { ProcesarPayloadWhatsApp } from './modules/whatsapp/application/use-cases/procesar-payload-whatsapp.js'
import { RegistrarMensajeEntrante } from './modules/whatsapp/application/use-cases/registrar-mensaje-entrante.js'
import { RegistrarMensajeSalienteHumano } from './modules/whatsapp/application/use-cases/registrar-mensaje-saliente-humano.js'
import { ResolverCuentaWhatsApp } from './modules/whatsapp/application/use-cases/resolver-cuenta-whatsapp.js'
import { ProveedorMetaMensajes } from './modules/whatsapp/infrastructure/providers/proveedor-meta-mensajes.js'
import { Proveedor360DialogMensajes } from './modules/whatsapp/infrastructure/providers/proveedor-360dialog-mensajes.js'
import { EnrutadorProveedorMensajes } from './modules/whatsapp/infrastructure/providers/enrutador-proveedor-mensajes.js'
import { RepositorioDrizzleCuentaWhatsApp } from './modules/whatsapp/infrastructure/repositories/repositorio-drizzle-cuenta-whatsapp.js'
import { RepositorioDrizzleEstadoMensaje } from './modules/whatsapp/infrastructure/repositories/repositorio-drizzle-estado-mensaje.js'
import { RepositorioDrizzleEventoWebhook } from './modules/whatsapp/infrastructure/repositories/repositorio-drizzle-evento-webhook.js'
import { ResolverCredencialCuentaEntorno } from './modules/whatsapp/infrastructure/resolvers/resolver-credencial-cuenta-entorno.js'
import { TransaccionDrizzleMensajeEntrante } from './modules/whatsapp/infrastructure/transactions/transaccion-drizzle-mensaje-entrante.js'

const ESPERA_REINTENTO_MS = 100
const LOTE_EVENTOS = 50

async function principal(): Promise<void> {
  const entorno = cargarVariablesEntorno()
  const registrador = crearRegistrador(entorno.LOG_LEVEL)
  const { baseDeDatos, cerrar } = crearBaseDeDatos(entorno.DATABASE_URL)

  const proveedor = new EnrutadorProveedorMensajes({
    meta: new ProveedorMetaMensajes({
      versionApi: entorno.META_API_VERSION,
      dryRun: entorno.WHATSAPP_DRY_RUN,
      registrador,
    }),
    '360dialog': new Proveedor360DialogMensajes({
      baseUrl: entorno.D360_API_BASE_URL,
      dryRun: entorno.WHATSAPP_DRY_RUN,
      registrador,
    }),
  })

  const cuentas = new RepositorioDrizzleCuentaWhatsApp(baseDeDatos)
  const transaccion = new TransaccionDrizzleMensajeEntrante(baseDeDatos)
  const seguimientosProgramados = new RepositorioDrizzleSeguimientoProgramado(baseDeDatos)
  const pausadorSeguimientos = new PausadorSeguimientosRespuesta(seguimientosProgramados)
  const pausadorRespuesta = entorno.WHATSAPP_PAUSAR_SEGUIMIENTOS_POR_RESPUESTA
    ? pausadorSeguimientos
    : undefined

  const enviarMensaje = new EnviarMensajeSaliente(
    cuentas,
    transaccion,
    proveedor,
    new ResolverCredencialCuentaEntorno(),
    { ventanaAtencionActiva: entorno.WHATSAPP_VENTANA_ATENCION_ACTIVA },
  )

  const repositorioLead = new RepositorioDrizzleLead(baseDeDatos)
  const repositorioGuionLead = new RepositorioDrizzleGuionLead(baseDeDatos)
  let procesadorAutorespuesta = undefined
  if (entorno.WHATSAPP_BOT_ACTIVO) {
    const determinista = new ProcesarMensajeAutorespuesta(
      repositorioLead,
      repositorioGuionLead,
      enviarMensaje,
      entorno.WHATSAPP_BOT_NUMEROS_PERMITIDOS,
      pausadorSeguimientos,
      registrador,
    )
    if (entorno.WHATSAPP_RESPUESTAS_MODO === 'gemini') {
      const claveApi = entorno.GEMINI_API_KEY
      if (!claveApi) {
        throw new Error('GEMINI_API_KEY es obligatoria en modo gemini')
      }
      if (entorno.WHATSAPP_ACCOUNTS.some((cuenta) => cuenta.proveedor === 'meta')) {
        registrador.warn(
          {},
          'modo gemini: las cuentas con proveedor meta continuan con el flujo determinista de la ruta http',
        )
      }
      procesadorAutorespuesta = new ProcesarMensajeAutorespuestaIA(
        repositorioLead,
        new RepositorioDrizzleMensaje(baseDeDatos),
        repositorioGuionLead,
        enviarMensaje,
        new ProveedorGemini(
          {
            modelo: entorno.GEMINI_MODEL,
            nivelRazonamiento: entorno.GEMINI_THINKING_LEVEL,
            maxTokensSalida: entorno.GEMINI_MAX_OUTPUT_TOKENS,
            intentos: entorno.GEMINI_INTENTOS,
            limiteHistorial: entorno.GEMINI_HISTORIAL_LIMITE,
            registrador,
          },
          crearClienteGenAI({
            claveApi,
            timeoutMs: entorno.GEMINI_TIMEOUT_MS,
          }),
        ),
        determinista,
        {
          limiteHistorial: entorno.GEMINI_HISTORIAL_LIMITE,
          maxLongitudRespuesta: entorno.GEMINI_MAX_LONGITUD_RESPUESTA,
          maxSolicitudesDia: entorno.GEMINI_MAX_SOLICITUDES_DIA,
        },
        entorno.WHATSAPP_BOT_NUMEROS_PERMITIDOS,
        pausadorSeguimientos,
        registrador,
      )
    } else {
      procesadorAutorespuesta = determinista
    }
  }

  const procesarEventos = new ProcesarEventosWebhookPendientes(
    new RepositorioDrizzleEventoWebhook(baseDeDatos),
    new ProcesarPayloadWhatsApp(
      new ResolverCuentaWhatsApp(cuentas),
      new RegistrarMensajeEntrante(transaccion),
      new RepositorioDrizzleEstadoMensaje(baseDeDatos),
      registrador,
      new RegistrarMensajeSalienteHumano(transaccion),
      pausadorRespuesta,
      procesadorAutorespuesta,
    ),
    registrador,
  )

  const enviarSeguimiento = new EnviarSeguimientoProgramado(
    new RepositorioDrizzleReglaSeguimiento(baseDeDatos),
    new RepositorioDrizzlePlantilla(baseDeDatos),
    new RepositorioDrizzleDestinoSeguimiento(baseDeDatos),
    new VerificadorEstadoComercialLocal(),
    proveedor,
    new ResolverCredencialCuentaEntorno(),
    transaccion,
  )
  const procesar = new ProcesarSeguimientosPendientes(seguimientosProgramados, enviarSeguimiento)

  const intervalo = entorno.WHATSAPP_SEGUIMIENTOS_INTERVALO_MS
  const lote = entorno.WHATSAPP_SEGUIMIENTOS_LOTE
  const seguimientosActivos = entorno.WHATSAPP_SEGUIMIENTOS_ACTIVOS

  let detenido = false
  let ejecutando = false
  let temporizador: NodeJS.Timeout | undefined

  const ciclo = async (): Promise<void> => {
    if (detenido || ejecutando) {
      return
    }
    ejecutando = true
    try {
      const eventos = await procesarEventos.ejecutar({ limite: LOTE_EVENTOS })
      if (eventos.procesados > 0 || eventos.fallidos > 0) {
        registrador.info(eventos, 'eventos de webhook pendientes procesados')
      }
    } catch (error) {
      registrador.error({ error: mensajeDeError(error) }, 'fallo al procesar eventos de webhook')
    }
    try {
      if (!seguimientosActivos) {
        registrador.warn(
          'seguimientos desactivados (WHATSAPP_SEGUIMIENTOS_ACTIVOS=false), no se envian',
        )
      } else {
        const resultado = await procesar.ejecutar({ limite: lote })
        if (resultado.procesados > 0) {
          registrador.info(resultado, 'lote de seguimientos procesado')
        }
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
    {
      intervalo,
      lote,
      dryRun: entorno.WHATSAPP_DRY_RUN,
      seguimientosActivos,
      botActivo: entorno.WHATSAPP_BOT_ACTIVO,
      modoRespuestas: entorno.WHATSAPP_RESPUESTAS_MODO,
      modeloIA: entorno.WHATSAPP_RESPUESTAS_MODO === 'gemini' ? entorno.GEMINI_MODEL : null,
    },
    'worker de seguimientos y eventos iniciado',
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

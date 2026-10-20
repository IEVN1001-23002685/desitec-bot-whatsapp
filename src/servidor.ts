import 'dotenv/config'
import { crearApp } from './app.js'
import { cargarVariablesEntorno } from './shared/config/variables-entorno.js'
import { crearBaseDeDatos } from './shared/db/cliente-bd.js'
import { crearRegistrador } from './shared/logging/registrador.js'
import { VerificarWebhookWhatsApp } from './modules/whatsapp/application/use-cases/verificar-webhook-whatsapp.js'
import { ResolverCuentaWhatsApp } from './modules/whatsapp/application/use-cases/resolver-cuenta-whatsapp.js'
import { RegistrarMensajeEntrante } from './modules/whatsapp/application/use-cases/registrar-mensaje-entrante.js'
import { EnviarMensajeSaliente } from './modules/whatsapp/application/use-cases/enviar-mensaje-saliente.js'
import { RecibirEventoWhatsApp } from './modules/whatsapp/application/use-cases/recibir-evento-whatsapp.js'
import { RecibirEvento360Dialog } from './modules/whatsapp/application/use-cases/recibir-evento-360dialog.js'
import { RegistrarMensajeSalienteHumano } from './modules/whatsapp/application/use-cases/registrar-mensaje-saliente-humano.js'
import { ProcesarMensajeAutorespuesta } from './modules/autorespuestas/application/use-cases/procesar-mensaje-autorespuesta.js'
import { RepositorioDrizzleGuionLead } from './modules/autorespuestas/infrastructure/repositories/repositorio-drizzle-guion-lead.js'
import { RepositorioDrizzleLead } from './modules/autorespuestas/infrastructure/repositories/repositorio-drizzle-lead.js'
import { ProgramarSeguimientos } from './modules/followups/application/use-cases/programar-seguimientos.js'
import { PausadorSeguimientosRespuesta } from './modules/followups/infrastructure/adapters/pausador-seguimientos-respuesta.js'
import { RepositorioDrizzleReglaSeguimiento } from './modules/followups/infrastructure/repositories/repositorio-drizzle-regla-seguimiento.js'
import { RepositorioDrizzleSeguimientoProgramado } from './modules/followups/infrastructure/repositories/repositorio-drizzle-seguimiento-programado.js'
import { RepositorioDrizzleCuentaWhatsApp } from './modules/whatsapp/infrastructure/repositories/repositorio-drizzle-cuenta-whatsapp.js'
import { RepositorioDrizzleEventoWebhook } from './modules/whatsapp/infrastructure/repositories/repositorio-drizzle-evento-webhook.js'
import { RepositorioDrizzleEstadoMensaje } from './modules/whatsapp/infrastructure/repositories/repositorio-drizzle-estado-mensaje.js'
import { TransaccionDrizzleMensajeEntrante } from './modules/whatsapp/infrastructure/transactions/transaccion-drizzle-mensaje-entrante.js'
import { ProveedorMetaMensajes } from './modules/whatsapp/infrastructure/providers/proveedor-meta-mensajes.js'
import { Proveedor360DialogMensajes } from './modules/whatsapp/infrastructure/providers/proveedor-360dialog-mensajes.js'
import { EnrutadorProveedorMensajes } from './modules/whatsapp/infrastructure/providers/enrutador-proveedor-mensajes.js'
import { ResolverCredencialCuentaEntorno } from './modules/whatsapp/infrastructure/resolvers/resolver-credencial-cuenta-entorno.js'
import { ResolverSecretoWebhookEntorno } from './modules/whatsapp/infrastructure/resolvers/resolver-secreto-webhook-entorno.js'

async function principal(): Promise<void> {
  const entorno = cargarVariablesEntorno()
  const registrador = crearRegistrador(entorno.LOG_LEVEL)
  const { baseDeDatos, cerrar } = crearBaseDeDatos(entorno.DATABASE_URL)

  const cuentas = new RepositorioDrizzleCuentaWhatsApp(baseDeDatos)
  const eventos = new RepositorioDrizzleEventoWebhook(baseDeDatos)
  const estados = new RepositorioDrizzleEstadoMensaje(baseDeDatos)
  const transaccion = new TransaccionDrizzleMensajeEntrante(baseDeDatos)
  const proveedorMensajes = new EnrutadorProveedorMensajes({
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
  const resolverCredenciales = new ResolverCredencialCuentaEntorno()
  const enviarMensaje = new EnviarMensajeSaliente(
    cuentas,
    transaccion,
    proveedorMensajes,
    resolverCredenciales,
    {
      ventanaAtencionActiva: entorno.WHATSAPP_VENTANA_ATENCION_ACTIVA,
    },
  )

  const reglasSeguimiento = new RepositorioDrizzleReglaSeguimiento(baseDeDatos)
  const seguimientosProgramados = new RepositorioDrizzleSeguimientoProgramado(baseDeDatos)
  const programarSeguimientos = new ProgramarSeguimientos(
    reglasSeguimiento,
    seguimientosProgramados,
  )

  const claveInterna = entorno.API_INTERNAL_KEY
  const rutaMensajes = claveInterna ? { enviarMensaje, claveInterna } : undefined
  const rutaSeguimientos = claveInterna ? { programarSeguimientos, claveInterna } : undefined
  const pausadorSeguimientos = entorno.WHATSAPP_PAUSAR_SEGUIMIENTOS_POR_RESPUESTA
    ? new PausadorSeguimientosRespuesta(seguimientosProgramados)
    : undefined

  const procesadorAutorespuesta = entorno.WHATSAPP_BOT_ACTIVO
    ? new ProcesarMensajeAutorespuesta(
        new RepositorioDrizzleLead(baseDeDatos),
        new RepositorioDrizzleGuionLead(baseDeDatos),
        enviarMensaje,
        entorno.WHATSAPP_BOT_NUMEROS_PERMITIDOS,
      )
    : undefined

  const secretoApp = entorno.META_APP_SECRET
  const tokenVerificacion = entorno.META_VERIFY_TOKEN
  const usaMeta = entorno.WHATSAPP_ACCOUNTS.some((cuenta) => cuenta.proveedor === 'meta')
  const usa360Dialog = entorno.WHATSAPP_ACCOUNTS.some((cuenta) => cuenta.proveedor === '360dialog')
  const registrarSalienteHumano = new RegistrarMensajeSalienteHumano(transaccion)
  const rutaWebhookWhatsApp =
    usaMeta && secretoApp && tokenVerificacion
      ? {
          verificarWebhook: new VerificarWebhookWhatsApp(tokenVerificacion),
          recibirEvento: new RecibirEventoWhatsApp(
            eventos,
            new ResolverCuentaWhatsApp(cuentas),
            new RegistrarMensajeEntrante(transaccion),
            estados,
            registrador,
            pausadorSeguimientos,
            procesadorAutorespuesta,
            registrarSalienteHumano,
          ),
          secretoApp,
        }
      : undefined
  const rutaWebhook360 = usa360Dialog
    ? {
        recibirEvento: new RecibirEvento360Dialog(
          eventos,
          new ResolverSecretoWebhookEntorno(cuentas),
          registrador,
        ),
      }
    : undefined

  const aplicacion = crearApp({
    registrador,
    bodyLimit: entorno.WEBHOOK_BODY_LIMIT,
    ...(rutaWebhookWhatsApp ? { webhook: rutaWebhookWhatsApp } : {}),
    ...(rutaWebhook360 ? { webhook360: rutaWebhook360 } : {}),
    ...(rutaMensajes ? { mensajes: rutaMensajes } : {}),
    ...(rutaSeguimientos ? { seguimientos: rutaSeguimientos } : {}),
  })

  const apagar = async (senal: string): Promise<void> => {
    registrador.info({ senal }, 'apagando servidor')
    await aplicacion.close()
    await cerrar()
    process.exit(0)
  }

  process.on('SIGINT', () => {
    void apagar('SIGINT')
  })
  process.on('SIGTERM', () => {
    void apagar('SIGTERM')
  })

  await aplicacion.listen({ port: entorno.PORT, host: '0.0.0.0' })
}

principal().catch((error) => {
  console.error('No se pudo iniciar el servidor', error)
  process.exit(1)
})

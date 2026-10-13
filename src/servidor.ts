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
import { RepositorioDrizzleCuentaWhatsApp } from './modules/whatsapp/infrastructure/repositories/repositorio-drizzle-cuenta-whatsapp.js'
import { RepositorioDrizzleEventoWebhook } from './modules/whatsapp/infrastructure/repositories/repositorio-drizzle-evento-webhook.js'
import { RepositorioDrizzleEstadoMensaje } from './modules/whatsapp/infrastructure/repositories/repositorio-drizzle-estado-mensaje.js'
import { TransaccionDrizzleMensajeEntrante } from './modules/whatsapp/infrastructure/transactions/transaccion-drizzle-mensaje-entrante.js'
import { ProveedorMetaMensajes } from './modules/whatsapp/infrastructure/providers/proveedor-meta-mensajes.js'

async function principal(): Promise<void> {
  const entorno = cargarVariablesEntorno()
  const registrador = crearRegistrador(entorno.LOG_LEVEL)
  const { baseDeDatos, cerrar } = crearBaseDeDatos(entorno.DATABASE_URL)

  const cuentas = new RepositorioDrizzleCuentaWhatsApp(baseDeDatos)
  const eventos = new RepositorioDrizzleEventoWebhook(baseDeDatos)
  const estados = new RepositorioDrizzleEstadoMensaje(baseDeDatos)
  const transaccion = new TransaccionDrizzleMensajeEntrante(baseDeDatos)
  const proveedorMensajes = new ProveedorMetaMensajes({
    versionApi: entorno.META_API_VERSION,
    dryRun: entorno.WHATSAPP_DRY_RUN,
    registrador,
  })
  const enviarMensaje = new EnviarMensajeSaliente(cuentas, transaccion, proveedorMensajes, {
    ventanaAtencionActiva: entorno.WHATSAPP_VENTANA_ATENCION_ACTIVA,
  })

  const claveInterna = entorno.API_INTERNAL_KEY
  const rutaMensajes = claveInterna ? { enviarMensaje, claveInterna } : undefined

  const aplicacion = crearApp({
    registrador,
    bodyLimit: entorno.WEBHOOK_BODY_LIMIT,
    webhook: {
      verificarWebhook: new VerificarWebhookWhatsApp(entorno.META_VERIFY_TOKEN),
      recibirEvento: new RecibirEventoWhatsApp(
        eventos,
        new ResolverCuentaWhatsApp(cuentas),
        new RegistrarMensajeEntrante(transaccion),
        estados,
        registrador,
      ),
      secretoApp: entorno.META_APP_SECRET,
    },
    ...(rutaMensajes ? { mensajes: rutaMensajes } : {}),
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

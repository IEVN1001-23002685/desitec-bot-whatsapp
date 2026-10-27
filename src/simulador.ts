import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { crearApp } from './app.js'
import { cargarVariablesEntorno } from './shared/config/variables-entorno.js'
import { crearBaseDeDatos } from './shared/db/cliente-bd.js'
import { crearRegistrador } from './shared/logging/registrador.js'
import { esperarBaseDeDatos } from './shared/db/esperar-bd.js'
import { guionFlujoLead, cuentasWhatsApp } from './shared/db/schema/index.js'
import { GUION_FLUJO_LEAD_INICIAL } from './shared/db/guion-flujo-lead-inicial.js'
import { VerificarWebhookWhatsApp } from './modules/whatsapp/application/use-cases/verificar-webhook-whatsapp.js'
import { ResolverCuentaWhatsApp } from './modules/whatsapp/application/use-cases/resolver-cuenta-whatsapp.js'
import { RegistrarMensajeEntrante } from './modules/whatsapp/application/use-cases/registrar-mensaje-entrante.js'
import { EnviarMensajeSaliente } from './modules/whatsapp/application/use-cases/enviar-mensaje-saliente.js'
import { RecibirEventoWhatsApp } from './modules/whatsapp/application/use-cases/recibir-evento-whatsapp.js'
import { RegistrarMensajeSalienteHumano } from './modules/whatsapp/application/use-cases/registrar-mensaje-saliente-humano.js'
import { ProcesarMensajeAutorespuesta } from './modules/autorespuestas/application/use-cases/procesar-mensaje-autorespuesta.js'
import { RepositorioDrizzleGuionLead } from './modules/autorespuestas/infrastructure/repositories/repositorio-drizzle-guion-lead.js'
import { RepositorioDrizzleLead } from './modules/autorespuestas/infrastructure/repositories/repositorio-drizzle-lead.js'
import { PausadorSeguimientosRespuesta } from './modules/followups/infrastructure/adapters/pausador-seguimientos-respuesta.js'
import { RepositorioDrizzleSeguimientoProgramado } from './modules/followups/infrastructure/repositories/repositorio-drizzle-seguimiento-programado.js'
import { RepositorioDrizzleCuentaWhatsApp } from './modules/whatsapp/infrastructure/repositories/repositorio-drizzle-cuenta-whatsapp.js'
import { RepositorioDrizzleEventoWebhook } from './modules/whatsapp/infrastructure/repositories/repositorio-drizzle-evento-webhook.js'
import { RepositorioDrizzleEstadoMensaje } from './modules/whatsapp/infrastructure/repositories/repositorio-drizzle-estado-mensaje.js'
import { TransaccionDrizzleMensajeEntrante } from './modules/whatsapp/infrastructure/transactions/transaccion-drizzle-mensaje-entrante.js'
import { ProveedorSimuladoMensajes } from './modules/whatsapp/infrastructure/providers/proveedor-simulado-mensajes.js'
import { EnrutadorProveedorMensajes } from './modules/whatsapp/infrastructure/providers/enrutador-proveedor-mensajes.js'
import { ResolverCredencialCuentaEntorno } from './modules/whatsapp/infrastructure/resolvers/resolver-credencial-cuenta-entorno.js'
import { eq } from 'drizzle-orm'

const CODIGO_CUENTA_SIMULADOR = 'simulador'
const ID_NUMERO_TELEFONO_SIMULADOR = 'sim-cuenta-000000000001'
const ID_WA_SIMULADO = '5219999999999'
const NOMBRE_CONTACTO_SIMULADO = 'Cliente Simulado'

function validarCondicionesSeguridad(entorno: ReturnType<typeof cargarVariablesEntorno>): void {
  if (entorno.NODE_ENV !== 'development') {
    throw new Error('El simulador solo puede ejecutarse en NODE_ENV=development')
  }
  if (entorno.WHATSAPP_DRY_RUN !== true) {
    throw new Error('El simulador exige WHATSAPP_DRY_RUN=true')
  }
  if (entorno.WHATSAPP_SEGUIMIENTOS_ACTIVOS) {
    throw new Error('El simulador exige WHATSAPP_SEGUIMIENTOS_ACTIVOS=false')
  }
  const nombreBase = new URL(entorno.DATABASE_URL).pathname.replace(/^\//, '')
  if (!/sim|test/i.test(nombreBase)) {
    throw new Error(
      'El simulador exige una base PostgreSQL exclusiva (nombre con "sim" o "test"), recibido: ' +
        nombreBase,
    )
  }
}

async function asegurarBaseDeDatos(cadenaConexion: string): Promise<void> {
  const url = new URL(cadenaConexion)
  const nombre = url.pathname.replace(/^\//, '')
  const adminUrl = new URL(cadenaConexion)
  adminUrl.pathname = '/postgres'
  const poolAdmin = new Pool({ connectionString: adminUrl.toString(), max: 1 })
  try {
    await esperarBaseDeDatos(poolAdmin)
    const encontrada = await poolAdmin.query('SELECT 1 FROM pg_database WHERE datname = $1', [nombre])
    if (encontrada.rowCount === 0) {
      const nombreSeguro = nombre.replaceAll('"', '""')
      await poolAdmin.query(`CREATE DATABASE "${nombreSeguro}"`)
    }
  } finally {
    await poolAdmin.end()
  }

  const base = new Pool({ connectionString: cadenaConexion })
  try {
    await esperarBaseDeDatos(base)
    await migrate(drizzle(base), { migrationsFolder: './drizzle' })
  } finally {
    await base.end()
  }
}

async function sembrarDatos(baseDeDatos: ReturnType<typeof crearBaseDeDatos>['baseDeDatos']): Promise<void> {
  for (const entrada of GUION_FLUJO_LEAD_INICIAL) {
    await baseDeDatos.insert(guionFlujoLead).values(entrada).onConflictDoNothing({ target: guionFlujoLead.clave })
  }

  const existente = await baseDeDatos
    .select()
    .from(cuentasWhatsApp)
    .where(eq(cuentasWhatsApp.codigo, CODIGO_CUENTA_SIMULADOR))
    .limit(1)

  if (existente.length === 0) {
    await baseDeDatos.insert(cuentasWhatsApp).values({
      codigo: CODIGO_CUENTA_SIMULADOR,
      nombreComercial: 'Cuenta Simulada',
      idNumeroTelefono: ID_NUMERO_TELEFONO_SIMULADOR,
      telefonoVisible: '+5210000000000',
      tokenAcceso: 'sim-token',
      proveedor: '360dialog',
      credencialRef: null,
      webhookSecretRef: null,
      estaActiva: true,
    })
  } else {
    await baseDeDatos
      .update(cuentasWhatsApp)
      .set({
        nombreComercial: 'Cuenta Simulada',
        idNumeroTelefono: ID_NUMERO_TELEFONO_SIMULADOR,
        telefonoVisible: '+5210000000000',
        tokenAcceso: 'sim-token',
        proveedor: '360dialog',
        estaActiva: true,
        actualizadoEn: new Date(),
      })
      .where(eq(cuentasWhatsApp.codigo, CODIGO_CUENTA_SIMULADOR))
  }
}

async function principal(): Promise<void> {
  const entorno = cargarVariablesEntorno()
  validarCondicionesSeguridad(entorno)

  await asegurarBaseDeDatos(entorno.DATABASE_URL)

  const registrador = crearRegistrador(entorno.LOG_LEVEL)
  const { baseDeDatos, cerrar } = crearBaseDeDatos(entorno.DATABASE_URL)

  await sembrarDatos(baseDeDatos)

  const cuentas = new RepositorioDrizzleCuentaWhatsApp(baseDeDatos)
  const eventos = new RepositorioDrizzleEventoWebhook(baseDeDatos)
  const estados = new RepositorioDrizzleEstadoMensaje(baseDeDatos)
  const transaccion = new TransaccionDrizzleMensajeEntrante(baseDeDatos)

  const proveedor = new EnrutadorProveedorMensajes({
    meta: new ProveedorSimuladoMensajes({ registrador }),
    '360dialog': new ProveedorSimuladoMensajes({ registrador }),
  })

  const enviarMensaje = new EnviarMensajeSaliente(
    cuentas,
    transaccion,
    proveedor,
    new ResolverCredencialCuentaEntorno(),
    { ventanaAtencionActiva: entorno.WHATSAPP_VENTANA_ATENCION_ACTIVA },
  )

  const seguimientosProgramados = new RepositorioDrizzleSeguimientoProgramado(baseDeDatos)
  const pausadorSeguimientos = new PausadorSeguimientosRespuesta(seguimientosProgramados)

  const procesadorAutorespuesta = entorno.WHATSAPP_BOT_ACTIVO
    ? new ProcesarMensajeAutorespuesta(
        new RepositorioDrizzleLead(baseDeDatos),
        new RepositorioDrizzleGuionLead(baseDeDatos),
        enviarMensaje,
        entorno.WHATSAPP_BOT_NUMEROS_PERMITIDOS,
        pausadorSeguimientos,
        registrador,
      )
    : undefined

  const recibirEvento = new RecibirEventoWhatsApp(
    eventos,
    new ResolverCuentaWhatsApp(cuentas),
    new RegistrarMensajeEntrante(transaccion),
    estados,
    registrador,
    entorno.WHATSAPP_PAUSAR_SEGUIMIENTOS_POR_RESPUESTA ? pausadorSeguimientos : undefined,
    procesadorAutorespuesta,
    new RegistrarMensajeSalienteHumano(transaccion),
  )

  const aplicacion = crearApp({
    registrador,
    bodyLimit: entorno.WEBHOOK_BODY_LIMIT,
    simulador: {
      baseDeDatos,
      recibirEvento,
      codigoCuenta: CODIGO_CUENTA_SIMULADOR,
      idNumeroTelefono: ID_NUMERO_TELEFONO_SIMULADOR,
      telefonoVisible: '+5210000000000',
      idWaSimulado: ID_WA_SIMULADO,
      nombreContacto: NOMBRE_CONTACTO_SIMULADO,
    },
  })

  const puerto = entorno.SIMULADOR_PORT ?? 3001
  await aplicacion.listen({ port: puerto, host: '127.0.0.1' })
  registrador.info({ puerto }, 'simulador de conversaciones iniciado en localhost')

  const apagar = async (senal: string): Promise<void> => {
    registrador.info({ senal }, 'apagando simulador')
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
}

principal().catch((error) => {
  console.error('No se pudo iniciar el simulador', error)
  process.exit(1)
})

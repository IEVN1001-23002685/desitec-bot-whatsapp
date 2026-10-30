import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { cargarVariablesEntorno } from '../config/variables-entorno.js'
import { referenciasPorProveedor } from '../config/referencias-credenciales.js'
import { crearBaseDeDatos } from './cliente-bd.js'
import { esperarBaseDeDatos } from './esperar-bd.js'
import {
  cuentasWhatsApp,
  guionFlujoLead,
  plantillasWhatsApp,
  reglasSeguimiento,
} from './schema/index.js'
import { GUION_FLUJO_LEAD_INICIAL } from './guion-flujo-lead-inicial.js'
import type { BaseDeDatos } from './tipos.js'

async function sembrarCuentas(baseDeDatos: BaseDeDatos): Promise<void> {
  const entorno = cargarVariablesEntorno()
  for (const cuenta of entorno.WHATSAPP_ACCOUNTS) {
    const referencias = referenciasPorProveedor(cuenta.codigo, cuenta.proveedor)
    const credencialRef = cuenta.credencialRef ?? referencias.credencialRef
    const webhookSecretRef = cuenta.webhookSecretRef ?? referencias.webhookSecretRef
    await baseDeDatos
      .insert(cuentasWhatsApp)
      .values({
        codigo: cuenta.codigo,
        nombreComercial: cuenta.nombreComercial,
        idNumeroTelefono: cuenta.idNumeroTelefono,
        telefonoVisible: cuenta.telefonoVisible,
        tokenAcceso: cuenta.tokenAcceso ?? null,
        proveedor: cuenta.proveedor,
        credencialRef,
        webhookSecretRef,
        estaActiva: cuenta.activa,
      })
      .onConflictDoUpdate({
        target: cuentasWhatsApp.codigo,
        set: {
          nombreComercial: cuenta.nombreComercial,
          idNumeroTelefono: cuenta.idNumeroTelefono,
          telefonoVisible: cuenta.telefonoVisible,
          tokenAcceso: cuenta.tokenAcceso ?? null,
          proveedor: cuenta.proveedor,
          credencialRef,
          webhookSecretRef,
          estaActiva: cuenta.activa,
          actualizadoEn: new Date(),
        },
      })
  }
  console.info(`Se sembraron ${entorno.WHATSAPP_ACCOUNTS.length} cuenta(s) de WhatsApp`)
}

async function sembrarPlantillas(baseDeDatos: BaseDeDatos): Promise<void> {
  const existente = await baseDeDatos
    .select({ id: plantillasWhatsApp.id })
    .from(plantillasWhatsApp)
    .where(eq(plantillasWhatsApp.codigo, 'seguimiento_24h'))
    .limit(1)
  if (existente.length > 0) {
    return
  }

  const idPlantilla = randomUUID()
  await baseDeDatos.insert(plantillasWhatsApp).values({
    id: idPlantilla,
    codigo: 'seguimiento_24h',
    nombreMeta: 'seguimiento_24h',
    idioma: 'es_ES',
    categoria: 'marketing',
    componentes: { type: 'body', text: 'Hola {{1}}, ¿sigues interesado?' },
    activa: true,
  })

  const cuentas = await baseDeDatos
    .select({ id: cuentasWhatsApp.id })
    .from(cuentasWhatsApp)
    .orderBy(cuentasWhatsApp.codigo)
    .limit(1)
  const idCuenta = cuentas[0]?.id
  if (!idCuenta) {
    throw new Error('No hay cuentas de WhatsApp para asociar la regla de seguimiento')
  }

  await baseDeDatos.insert(reglasSeguimiento).values({
    codigo: 'seguimiento_24h',
    nombre: 'Seguimiento 24h',
    idCuentaWhatsApp: idCuenta,
    demoraHoras: 24,
    idPlantilla: idPlantilla,
    cuerpo: 'Seguimiento a las 24 horas',
    parametros: ['{{nombre}}'],
    activa: false,
  })
  console.info('Se sembro la plantilla y la regla de seguimiento base (seguimiento_24h, inactiva)')
}

async function sembrarGuionLead(baseDeDatos: BaseDeDatos): Promise<void> {
  for (const entrada of GUION_FLUJO_LEAD_INICIAL) {
    await baseDeDatos
      .insert(guionFlujoLead)
      .values(entrada)
      .onConflictDoNothing({ target: guionFlujoLead.clave })
  }
  console.info('Se sembro el guion del flujo de leads')
}

async function sembrar(): Promise<void> {
  const entorno = cargarVariablesEntorno()
  const { baseDeDatos, pool, cerrar } = crearBaseDeDatos(entorno.DATABASE_URL)
  try {
    await esperarBaseDeDatos(pool)
    await sembrarCuentas(baseDeDatos)
    await sembrarPlantillas(baseDeDatos)
    await sembrarGuionLead(baseDeDatos)
  } finally {
    await cerrar()
  }
}

sembrar().catch((error) => {
  console.error('Error al sembrar datos', error)
  process.exit(1)
})

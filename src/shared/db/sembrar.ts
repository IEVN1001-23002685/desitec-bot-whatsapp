import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { cargarVariablesEntorno } from '../config/variables-entorno.js'
import { crearBaseDeDatos } from './cliente-bd.js'
import { esperarBaseDeDatos } from './esperar-bd.js'
import { cuentasWhatsApp, plantillasWhatsApp, reglasSeguimiento } from './schema/index.js'
import type { BaseDeDatos } from './tipos.js'

async function sembrarCuentas(baseDeDatos: BaseDeDatos): Promise<void> {
  const entorno = cargarVariablesEntorno()
  for (const cuenta of entorno.WHATSAPP_ACCOUNTS) {
    await baseDeDatos
      .insert(cuentasWhatsApp)
      .values({
        codigo: cuenta.codigo,
        nombreComercial: cuenta.nombreComercial,
        idNumeroTelefono: cuenta.idNumeroTelefono,
        telefonoVisible: cuenta.telefonoVisible,
        tokenAcceso: cuenta.tokenAcceso ?? null,
        estaActiva: cuenta.activa,
      })
      .onConflictDoUpdate({
        target: cuentasWhatsApp.codigo,
        set: {
          nombreComercial: cuenta.nombreComercial,
          idNumeroTelefono: cuenta.idNumeroTelefono,
          telefonoVisible: cuenta.telefonoVisible,
          tokenAcceso: cuenta.tokenAcceso ?? null,
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
    activa: true,
  })
  console.info('Se sembro la plantilla y la regla de seguimiento base (seguimiento_24h)')
}

async function sembrar(): Promise<void> {
  const entorno = cargarVariablesEntorno()
  const { baseDeDatos, pool, cerrar } = crearBaseDeDatos(entorno.DATABASE_URL)
  try {
    await esperarBaseDeDatos(pool)
    await sembrarCuentas(baseDeDatos)
    await sembrarPlantillas(baseDeDatos)
  } finally {
    await cerrar()
  }
}

sembrar().catch((error) => {
  console.error('Error al sembrar datos', error)
  process.exit(1)
})

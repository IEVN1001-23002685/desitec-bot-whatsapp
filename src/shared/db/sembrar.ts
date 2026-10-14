import { crearBaseDeDatos } from './cliente-bd.js'
import { cargarVariablesEntorno } from '../config/variables-entorno.js'
import {
  cuentasWhatsApp,
  contactos,
  conversaciones,
  plantillasWhatsApp,
  reglasSeguimiento,
} from './schema/index.js'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

const { baseDeDatos: db } = crearBaseDeDatos(cargarVariablesEntorno().DATABASE_URL)

export async function sembrarDatos(): Promise<void> {
  const cuentaExistente = await db.select({ id: cuentasWhatsApp.id }).from(cuentasWhatsApp).limit(1)
  if (cuentaExistente.length === 0) {
    const idCuenta = randomUUID()
    const idContacto = randomUUID()
    const idConversacion = randomUUID()
    await db.insert(cuentasWhatsApp).values({
      id: idCuenta,
      codigo: 'demo',
      idNumeroTelefono: '14155238886',
      nombreComercial: 'Demo Meta',
      tokenAcceso: 'eaaxxxxxxxxxxxxxxxxxxxxxxxx',
    } as any)
    await db.insert(contactos).values({
      id: idContacto,
      idWa: '34666666666',
      nombrePerfil: 'Usuario Demo',
    } as any)
    await db.insert(conversaciones).values({
      id: idConversacion,
      idCuentaWhatsApp: idCuenta,
      idContacto: idContacto,
    } as any)
  }
}

export async function sembrarPlantillas(): Promise<void> {
  const plantillaExistente = await db
    .select({ id: plantillasWhatsApp.id })
    .from(plantillasWhatsApp)
    .where(eq(plantillasWhatsApp.codigo, 'seguimiento_24h'))
    .limit(1)
  if (plantillaExistente.length === 0) {
    const idPlantilla = randomUUID()
    await db.insert(plantillasWhatsApp).values({
      id: idPlantilla,
      codigo: 'seguimiento_24h',
      nombreMeta: 'seguimiento_24h',
      idioma: 'es_ES',
      categoria: 'marketing',
      componentes: { type: 'body', text: 'Hola {{1}}, ¿sigues interesado?' },
      activa: true,
    })
    const reglaExistente = await db
      .select({ id: reglasSeguimiento.id })
      .from(reglasSeguimiento)
      .where(eq(reglasSeguimiento.codigo, 'seguimiento_24h'))
      .limit(1)
    if (reglaExistente.length === 0) {
      const cuentas = await db.select({ id: cuentasWhatsApp.id }).from(cuentasWhatsApp).limit(1)
      await db.insert(reglasSeguimiento).values({
        codigo: 'seguimiento_24h',
        nombre: 'Seguimiento 24h',
        idCuentaWhatsApp: cuentas[0]?.id ?? '00000000-0000-0000-0000-000000000001',
        demoraHoras: 24,
        idPlantilla: idPlantilla,
        cuerpo: 'Seguimiento a las 24 horas',
        activa: true,
      } as any)
    }
  }
}

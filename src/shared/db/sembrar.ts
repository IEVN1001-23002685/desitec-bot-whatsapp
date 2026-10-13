import 'dotenv/config'
import { cargarVariablesEntorno } from '../config/variables-entorno.js'
import { crearBaseDeDatos } from './cliente-bd.js'
import { esperarBaseDeDatos } from './esperar-bd.js'
import { cuentasWhatsApp } from './schema/index.js'

async function sembrar(): Promise<void> {
  const entorno = cargarVariablesEntorno()
  const { baseDeDatos, pool, cerrar } = crearBaseDeDatos(entorno.DATABASE_URL)

  try {
    await esperarBaseDeDatos(pool)

    for (const cuenta of entorno.WHATSAPP_ACCOUNTS) {
      await baseDeDatos
        .insert(cuentasWhatsApp)
        .values({
          codigo: cuenta.codigo,
          nombreComercial: cuenta.nombreComercial,
          idNumeroTelefono: cuenta.idNumeroTelefono,
          telefonoVisible: cuenta.telefonoVisible,
          estaActiva: cuenta.activa,
        })
        .onConflictDoUpdate({
          target: cuentasWhatsApp.codigo,
          set: {
            nombreComercial: cuenta.nombreComercial,
            idNumeroTelefono: cuenta.idNumeroTelefono,
            telefonoVisible: cuenta.telefonoVisible,
            estaActiva: cuenta.activa,
            actualizadoEn: new Date(),
          },
        })
    }

    console.info(`Se sembraron ${entorno.WHATSAPP_ACCOUNTS.length} cuenta(s) de WhatsApp`)
  } finally {
    await cerrar()
  }
}

sembrar().catch((error) => {
  console.error('Error al sembrar cuentas de WhatsApp', error)
  process.exit(1)
})

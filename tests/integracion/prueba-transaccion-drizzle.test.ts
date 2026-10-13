import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Pool } from 'pg'
import { crearBaseDeDatos } from '../../src/shared/db/cliente-bd.js'
import { CADENA_PRUEBA, truncarTablas } from './base-datos.js'
import { TransaccionDrizzleMensajeEntrante } from '../../src/modules/whatsapp/infrastructure/transactions/transaccion-drizzle-mensaje-entrante.js'
import { contactos } from '../../src/shared/db/schema/index.js'
import type { BaseDeDatos } from '../../src/shared/db/tipos.js'

describe('TransaccionDrizzleMensajeEntrante', () => {
  let pool: Pool
  let baseDeDatos: BaseDeDatos
  let transaccion: TransaccionDrizzleMensajeEntrante

  beforeAll(() => {
    const conexion = crearBaseDeDatos(CADENA_PRUEBA)
    baseDeDatos = conexion.baseDeDatos
    pool = conexion.pool
    transaccion = new TransaccionDrizzleMensajeEntrante(baseDeDatos)
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(async () => {
    await truncarTablas(pool)
  })

  it('confirma los cambios cuando el trabajo termina bien', async () => {
    const id = await transaccion.ejecutar(async (contexto) => {
      const contacto = await contexto.contactos.crear({
        idWa: '5215512345678',
        nombrePerfil: 'Cliente',
      })
      return contacto.id
    })

    expect(id).toEqual(expect.any(String))
    expect((await baseDeDatos.select().from(contactos))).toHaveLength(1)
  })

  it('revierte los cambios cuando el trabajo lanza un error', async () => {
    await expect(
      transaccion.ejecutar(async (contexto) => {
        await contexto.contactos.crear({ idWa: '5215512345678', nombrePerfil: null })
        await contexto.contactos.crear({ idWa: '5215512300000', nombrePerfil: null })
        throw new Error('fallo forzado para probar el rollback')
      }),
    ).rejects.toThrow('fallo forzado para probar el rollback')

    expect((await baseDeDatos.select().from(contactos))).toHaveLength(0)
  })
})
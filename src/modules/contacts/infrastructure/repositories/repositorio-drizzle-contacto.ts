import { eq } from 'drizzle-orm'
import { contactos } from '../../../../shared/db/schema/index.js'
import type { Transaccion } from '../../../../shared/db/tipos.js'
import type { Contacto } from '../../domain/entities/contacto.js'
import type {
  EntradaCrearContacto,
  RepositorioContacto,
} from '../../domain/ports/repositorio-contacto.js'

type FilaContacto = typeof contactos.$inferSelect

export class RepositorioDrizzleContacto implements RepositorioContacto {
  constructor(private readonly baseDeDatos: Transaccion) {}

  async buscarPorIdWa(idWa: string): Promise<Contacto | null> {
    const filas = await this.baseDeDatos
      .select()
      .from(contactos)
      .where(eq(contactos.idWa, idWa))
      .limit(1)
    const fila = filas[0]
    return fila ? mapearContacto(fila) : null
  }

  async crear(entrada: EntradaCrearContacto): Promise<Contacto> {
    const insertados = await this.baseDeDatos
      .insert(contactos)
      .values({ idWa: entrada.idWa, nombrePerfil: entrada.nombrePerfil })
      .onConflictDoNothing({ target: contactos.idWa })
      .returning()

    const creado = insertados[0]
    if (creado) {
      return mapearContacto(creado)
    }

    const existente = await this.buscarPorIdWa(entrada.idWa)
    if (!existente) {
      throw new Error('No se pudo persistir el contacto')
    }
    return existente
  }
}

function mapearContacto(fila: FilaContacto): Contacto {
  return {
    id: fila.id,
    idWa: fila.idWa,
    nombrePerfil: fila.nombrePerfil,
  }
}

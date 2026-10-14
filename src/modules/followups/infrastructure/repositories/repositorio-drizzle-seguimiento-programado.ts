import type { Transaccion } from '../../../../shared/db/tipos.js'
import type { BaseDeDatos } from '../../../../shared/db/tipos.js'
import type {
  RepositorioSeguimientoProgramado,
  EntradaProgramarSeguimiento,
} from '../../domain/ports/repositorio-seguimiento-programado.js'
import type { SeguimientoProgramado } from '../../domain/entities/seguimiento-programado.js'
import { seguimientosProgramados, reglasSeguimiento } from '../../../../shared/db/schema/index.js'
import { eq, and, lt } from 'drizzle-orm'
import type { EstadoSeguimiento } from '../../domain/types/estado-seguimiento.js'
import { randomUUID } from 'node:crypto'

type FilaSeguimiento = typeof seguimientosProgramados.$inferSelect

export class RepositorioDrizzleSeguimientoProgramado implements RepositorioSeguimientoProgramado {
  constructor(private readonly baseDeDatos: Transaccion | BaseDeDatos) {}

  async programar(entrada: EntradaProgramarSeguimiento): Promise<SeguimientoProgramado> {
    const regla = await this.baseDeDatos
      .select()
      .from(reglasSeguimiento)
      .where(eq(reglasSeguimiento.id, entrada.idReglaSeguimiento))
      .limit(1)
    if (!regla[0]) {
      throw new Error('Regla de seguimiento no encontrada')
    }
    const seguimiento: SeguimientoProgramado = {
      id: randomUUID(),
      idConversacion: entrada.idConversacion,
      idReglaSeguimiento: regla[0].id,
      programadoPara: entrada.programadoPara,
      estado: 'pendiente',
      intentos: 0,
      idMensajeMeta: null,
      error: null,
      motivoCancelacion: null,
      enviadoEn: null,
    }
    await this.baseDeDatos.insert(seguimientosProgramados).values({
      id: seguimiento.id,
      idConversacion: seguimiento.idConversacion,
      idReglaSeguimiento: seguimiento.idReglaSeguimiento,
      programadoPara: seguimiento.programadoPara,
      estado: seguimiento.estado as EstadoSeguimiento,
      intentos: seguimiento.intentos,
    } as any)
    return seguimiento
  }

  async obtenerPendientesParaProcesar(limite: number): Promise<SeguimientoProgramado[]> {
    const filas = await this.baseDeDatos
      .select()
      .from(seguimientosProgramados)
      .where(
        and(
          eq(seguimientosProgramados.estado, 'pendiente'),
          lt(seguimientosProgramados.programadoPara, new Date()),
        ),
      )
      .limit(limite)
    return filas.map(mapearSeguimiento)
  }

  async marcarEnProceso(id: string, enProceso: boolean): Promise<void> {
    await this.baseDeDatos
      .update(seguimientosProgramados)
      .set({
        estado: enProceso ? 'en_proceso' : 'pendiente',
        actualizadoEn: new Date(),
      } as any)
      .where(eq(seguimientosProgramados.id, id))
  }

  async marcarEnviado(id: string, idMensajeMeta: string, enviadoEn: Date): Promise<void> {
    await this.baseDeDatos
      .update(seguimientosProgramados)
      .set({
        estado: 'enviado',
        enviadoEn: enviadoEn ?? null,
        idMensajeMeta: idMensajeMeta ?? null,
        actualizadoEn: new Date(),
      } as any)
      .where(eq(seguimientosProgramados.id, id))
  }

  async marcarFallido(id: string, error: string): Promise<void> {
    await this.baseDeDatos
      .update(seguimientosProgramados)
      .set({
        estado: 'fallido',
        error: error ?? null,
        actualizadoEn: new Date(),
      } as any)
      .where(eq(seguimientosProgramados.id, id))
  }

  async marcarCancelado(id: string, motivo: string): Promise<void> {
    await this.baseDeDatos
      .update(seguimientosProgramados)
      .set({
        estado: 'cancelado',
        motivoCancelacion: motivo ?? null,
        actualizadoEn: new Date(),
      } as any)
      .where(eq(seguimientosProgramados.id, id))
  }

  async cancelarPendientesPorConversacion(idConversacion: string, motivo: string): Promise<number> {
    const resultado = await this.baseDeDatos
      .update(seguimientosProgramados)
      .set({
        estado: 'cancelado',
        motivoCancelacion: motivo ?? null,
        actualizadoEn: new Date(),
      } as any)
      .where(
        and(
          eq(seguimientosProgramados.idConversacion, idConversacion),
          eq(seguimientosProgramados.estado, 'pendiente'),
        ),
      )
      .returning({ id: seguimientosProgramados.id })
    return resultado.length
  }

  async obtenerPorId(id: string): Promise<SeguimientoProgramado | null> {
    const filas = await this.baseDeDatos
      .select()
      .from(seguimientosProgramados)
      .where(eq(seguimientosProgramados.id, id))
      .limit(1)
    return filas[0] ? mapearSeguimiento(filas[0]) : null
  }

  async cambiarEstado(id: string, estado: EstadoSeguimiento): Promise<void> {
    await this.baseDeDatos
      .update(seguimientosProgramados)
      .set({
        estado,
        actualizadoEn: new Date(),
      } as any)
      .where(eq(seguimientosProgramados.id, id))
  }
}

function mapearSeguimiento(fila: FilaSeguimiento): SeguimientoProgramado {
  return {
    id: fila.id,
    idConversacion: fila.idConversacion,
    idReglaSeguimiento: fila.idReglaSeguimiento,
    programadoPara: fila.programadoPara,
    estado: fila.estado as EstadoSeguimiento,
    intentos: fila.intentos,
    idMensajeMeta: fila.idMensajeMeta ?? null,
    error: fila.error ?? null,
    motivoCancelacion: fila.motivoCancelacion ?? null,
    enviadoEn: fila.enviadoEn ?? null,
  }
}

import { randomUUID } from 'node:crypto'
import type { RepositorioReglaSeguimiento } from '../../domain/ports/repositorio-regla-seguimiento.js'
import type { RepositorioSeguimientoProgramado } from '../../domain/ports/repositorio-seguimiento-programado.js'

export type EntradaProgramarSeguimientos = {
  idConversacion: string
}

export type ResultadoProgramarSeguimientos = {
  programados: number
}

export class ProgramarSeguimientos {
  constructor(
    private readonly reglas: RepositorioReglaSeguimiento,
    private readonly seguimientos: RepositorioSeguimientoProgramado,
  ) {}

  async ejecutar(entrada: EntradaProgramarSeguimientos): Promise<ResultadoProgramarSeguimientos> {
    const reglasActivas = await this.reglas.buscarActivas()
    let programados = 0
    for (const regla of reglasActivas) {
      try {
        const programadoPara = new Date(Date.now() + regla.demoraHoras * 3600 * 1000)
        await this.seguimientos.programar({
          idConversacion: entrada.idConversacion,
          idReglaSeguimiento: regla.id,
          programadoPara,
        })
        programados++
      } catch {
        continue
      }
    }
    return { programados }
  }
}

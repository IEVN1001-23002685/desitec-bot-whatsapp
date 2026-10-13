import type { ReglaSeguimiento } from '../entities/regla-seguimiento.js'

export interface RepositorioReglaSeguimiento {
  buscarActivaPorId(id: string): Promise<ReglaSeguimiento | null>
  buscarActivaPorCodigo(codigo: string): Promise<ReglaSeguimiento | null>
}

import type { EntradaGuion } from '../entities/entrada-guion.js'

export interface RepositorioGuionLead {
  buscarActivaPorClave(clave: string): Promise<EntradaGuion | null>
}

import type { PlantillaWhatsApp } from '../entities/plantilla-whatsapp.js'

export interface RepositorioPlantilla {
  buscarActivaPorCodigo(codigo: string): Promise<PlantillaWhatsApp | null>
  listarActivas(): Promise<PlantillaWhatsApp[]>
}

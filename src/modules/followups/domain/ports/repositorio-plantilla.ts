import type { PlantillaWhatsApp } from '../entities/plantilla-whatsapp.js'

export interface RepositorioPlantilla {
  buscarActivaPorId(id: string): Promise<PlantillaWhatsApp | null>
  buscarActivaPorCodigo(codigo: string): Promise<PlantillaWhatsApp | null>
  listarActivas(): Promise<PlantillaWhatsApp[]>
}

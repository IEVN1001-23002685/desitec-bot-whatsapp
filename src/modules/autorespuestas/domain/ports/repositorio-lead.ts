import type { Lead } from '../entities/lead.js'
import type { EstadoLead } from '../types/estado-lead.js'
import type { PasoLead } from '../types/paso-lead.js'

export type EntradaCrearLead = {
  idConversacion: string
}

export type ActualizacionLead = {
  nombre: string | null
  correo: string | null
  modelos: string | null
  cantidad: number | null
  ciudad: string | null
  pasoActual: PasoLead
  estado: EstadoLead
  completadoEn: Date | null
}

export interface RepositorioLead {
  buscarPorConversacion(idConversacion: string): Promise<Lead | null>
  crear(entrada: EntradaCrearLead): Promise<Lead>
  actualizar(id: string, cambios: ActualizacionLead): Promise<void>
}

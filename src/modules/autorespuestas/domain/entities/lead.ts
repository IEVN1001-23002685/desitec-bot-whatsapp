import type { EstadoLead } from '../types/estado-lead.js'
import type { PasoLead } from '../types/paso-lead.js'

export type Lead = {
  id: string
  idConversacion: string
  nombre: string | null
  correo: string | null
  modelos: string | null
  cantidad: number | null
  ciudad: string | null
  pasoActual: PasoLead
  estado: EstadoLead
  completadoEn: Date | null
}

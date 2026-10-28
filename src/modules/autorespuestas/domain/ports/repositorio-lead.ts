import type { Lead } from '../entities/lead.js'
import type { EstadoLead } from '../types/estado-lead.js'
import type { PasoLead } from '../types/paso-lead.js'
import type {
  AclaracionPendiente,
  ProductoLead,
  UbicacionLead,
} from '../types/datos-lead.js'

export type EntradaCrearLead = {
  idConversacion: string
}

export type ActualizacionLead = {
  nombre: string | null
  nombreRechazado: boolean
  correo: string | null
  modelos: string | null
  cantidad: number | null
  cantidadAproximada: string | null
  ciudad: string | null
  ubicacion: UbicacionLead | null
  productosCatalogo: readonly ProductoLead[]
  solicitudProductoTexto: string | null
  aclaracionPendiente: AclaracionPendiente | null
  pasoActual: PasoLead
  estado: EstadoLead
  completadoEn: Date | null
}

export interface RepositorioLead {
  buscarPorConversacion(idConversacion: string): Promise<Lead | null>
  crear(entrada: EntradaCrearLead): Promise<Lead>
  actualizar(id: string, cambios: ActualizacionLead): Promise<void>
}

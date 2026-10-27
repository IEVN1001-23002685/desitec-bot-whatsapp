import type { Lead } from '../entities/lead.js'

export type ContextoMensajeLead = {
  lead: Lead
  texto: string
  esPrimerMensaje: boolean
}

import type { EstadoEventoWebhook } from '../types/estado-evento-webhook.js'

export type EntradaRegistrarEventoWebhook = {
  claveEvento: string
  tipoObjeto: string | null
  cargaUtilOriginal: unknown
}

export type ResumenEventoWebhook = {
  id: string
  estado: EstadoEventoWebhook
}

export interface RepositorioEventoWebhook {
  intentarRegistrar(
    entrada: EntradaRegistrarEventoWebhook,
  ): Promise<{ insertado: boolean; id: string }>
  buscarPorClaveEvento(claveEvento: string): Promise<ResumenEventoWebhook | null>
  marcarEstado(claveEvento: string, estado: EstadoEventoWebhook, error: string | null): Promise<void>
}
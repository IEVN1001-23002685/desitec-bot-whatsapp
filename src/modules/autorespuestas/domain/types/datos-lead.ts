export type ProductoLead = {
  nombre: string
  url: string | null
  cantidad: number | null
}

/**
 * Sugerencia mostrada al cliente. Se persiste para que expresiones como
 * "otro", "el primero" o "de la misma marca" sigan funcionando aunque el
 * worker se reinicie.
 */
export type SugerenciaProductoLead = {
  id: string
  nombre: string
  url: string | null
  marca: string | null
  puntuacion: number
}

export type ContextoProductoLead = {
  ultimaConsulta: string | null
  sugerencias: readonly SugerenciaProductoLead[]
  rechazados: readonly string[]
  ultimaMarca: string | null
  consultasOrientacion: number
  fallosProducto: number
}

export function contextoProductoVacio(): ContextoProductoLead {
  return {
    ultimaConsulta: null,
    sugerencias: [],
    rechazados: [],
    ultimaMarca: null,
    consultasOrientacion: 0,
    fallosProducto: 0,
  }
}

export type AclaracionPendiente = 'producto' | 'ubicacion' | 'cantidad'

export type TipoUbicacionLead = 'localidad' | 'municipio' | 'entidad' | 'extranjera'

export type UbicacionLead = {
  tipo: TipoUbicacionLead
  nombreMostrado: string
  pais: string
  entidad: string | null
  municipio: string | null
  localidad: string | null
  cvegeo: string | null
  completa: boolean
}

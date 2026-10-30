export type ProductoCatalogo = {
  id: string
  nombre: string
  url: string
  variantes: readonly string[]
}

export type MotivoCoincidencia = 'nombre_exacto' | 'modelo' | 'parcial' | 'categoria'

export type CoincidenciaProducto = {
  producto: ProductoCatalogo
  puntuacion: number
  motivo: MotivoCoincidencia
}

export type ResultadoBusquedaProductos =
  | { tipo: 'ninguno'; consulta: string }
  | { tipo: 'confirmado'; coincidencias: readonly CoincidenciaProducto[] }
  | { tipo: 'ambiguo'; candidatos: readonly CoincidenciaProducto[] }

export type CatalogoProductos = {
  fuente: string
  productos: readonly ProductoCatalogo[]
  conteos: {
    filas: number
    productos: number
    variantes: number
    descartados: number
  }
}

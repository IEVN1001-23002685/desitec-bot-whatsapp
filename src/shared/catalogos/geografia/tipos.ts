export type NivelUbicacion = 'localidad' | 'municipio' | 'entidad' | 'extranjera'

export type ConfianzaUbicacion = 'exacta' | 'alias' | 'parcial'

export type UbicacionValidada = {
  tipo: NivelUbicacion
  nombreMostrado: string
  pais: string
  entidad: string | null
  municipio: string | null
  localidad: string | null
  cvegeo: string | null
  completa: boolean
  confianza: ConfianzaUbicacion
}

export type ResultadoUbicacion =
  | { tipo: 'mexicana'; ubicacion: UbicacionValidada; candidatos: readonly UbicacionValidada[] }
  | { tipo: 'extranjera'; ubicacion: UbicacionValidada; candidatos: readonly UbicacionValidada[] }
  | { tipo: 'ambigua'; candidatos: readonly UbicacionValidada[] }
  | { tipo: 'no_reconocida'; texto: string }

export type EntidadGeo = {
  clave: string
  cvegeo: string
  nombre: string
  nombreAbrev: string
  poblacion: number
}

export type MunicipioGeo = {
  cvegeo: string
  cveEnt: string
  nombre: string
  cveCab: string | null
  poblacion: number
}

export type LocalidadGeo = {
  cvegeo: string
  cveMun: string
  cveEnt: string
  nombre: string
  ambito: string
  poblacion: number
  cabecera: boolean
}

export type CatalogoGeografia = {
  fuente: string
  url: string
  generadoEn: string
  filtros: Record<string, string>
  conteos: Record<string, number>
  entidades: EntidadGeo[]
  municipios: MunicipioGeo[]
  localidades: LocalidadGeo[]
}

export type CiudadExtranjera = {
  nombre: string
  aliases: string[]
  ambigua: boolean
  nota: string
}

export type PaisExtranjero = {
  nombre: string
  aliases: string[]
  ciudades: CiudadExtranjera[]
}

export type CatalogoExtranjero = {
  fuente: string
  actualizadoEn: string
  nota: string
  paises: PaisExtranjero[]
}

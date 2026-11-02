import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { CatalogoExtranjero, CatalogoGeografia } from './tipos.js'

const RUTA_GEOGRAFIA = fileURLToPath(
  new URL('../../../../data/geografia/geografia-mexico.json', import.meta.url),
)
const RUTA_EXTRANJERO = fileURLToPath(
  new URL('../../../../data/geografia/ciudades-extranjeras.json', import.meta.url),
)

let cacheGeografia: CatalogoGeografia | null = null
let cacheExtranjero: CatalogoExtranjero | null = null

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function leerJson(ruta: string): unknown {
  try {
    return JSON.parse(readFileSync(ruta, 'utf8')) as unknown
  } catch (error) {
    throw new Error(
      `No se pudo leer el catálogo ${ruta}. Verifica que la carpeta data/ esté incluida en el despliegue.`,
      { cause: error },
    )
  }
}

export function cargarCatalogoGeografia(): CatalogoGeografia {
  if (cacheGeografia) {
    return cacheGeografia
  }

  const bruto = leerJson(RUTA_GEOGRAFIA)
  if (
    !esObjeto(bruto) ||
    !Array.isArray(bruto['entidades']) ||
    !Array.isArray(bruto['municipios']) ||
    !Array.isArray(bruto['localidades'])
  ) {
    throw new Error('El catálogo geográfico no tiene el formato esperado')
  }

  cacheGeografia = bruto as unknown as CatalogoGeografia
  return cacheGeografia
}

export function cargarCatalogoExtranjero(): CatalogoExtranjero {
  if (cacheExtranjero) {
    return cacheExtranjero
  }

  const bruto = leerJson(RUTA_EXTRANJERO)
  if (!esObjeto(bruto) || !Array.isArray(bruto['paises'])) {
    throw new Error('El catálogo de destinos extranjeros no tiene el formato esperado')
  }

  cacheExtranjero = bruto as unknown as CatalogoExtranjero
  return cacheExtranjero
}

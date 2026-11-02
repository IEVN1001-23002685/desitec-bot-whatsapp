import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { normalizarCatalogo } from '../texto.js'
import type { CatalogoProductos, ProductoCatalogo } from './tipos.js'

const RUTA_CSV = fileURLToPath(
  new URL('../../../../data/catalogos/productos-desitec.csv', import.meta.url),
)

let cache: CatalogoProductos | null = null

/**
 * Parser RFC 4180 suficiente para el CSV de Desitec: admite comillas,
 * comillas escapadas, comas y saltos de línea dentro de campos.
 */
export function parsearCsv(texto: string): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let entreComillas = false
  let indice = 0

  while (indice < texto.length) {
    const caracter = texto[indice] ?? ''

    if (entreComillas) {
      if (caracter === '"') {
        if (texto[indice + 1] === '"') {
          campo += '"'
          indice += 2
          continue
        }
        entreComillas = false
        indice += 1
        continue
      }
      campo += caracter
      indice += 1
      continue
    }

    if (caracter === '"') {
      entreComillas = true
      indice += 1
      continue
    }

    if (caracter === ',') {
      fila.push(campo)
      campo = ''
      indice += 1
      continue
    }

    if (caracter === '\n' || caracter === '\r') {
      fila.push(campo)
      campo = ''
      filas.push(fila)
      fila = []
      if (caracter === '\r' && texto[indice + 1] === '\n') {
        indice += 2
      } else {
        indice += 1
      }
      continue
    }

    campo += caracter
    indice += 1
  }

  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo)
    filas.push(fila)
  }

  return filas
}

function esUrlValida(valor: string): boolean {
  try {
    const url = new URL(valor)
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'www.desitec.com.mx' || url.hostname === 'desitec.com.mx')
    )
  } catch {
    return false
  }
}

function urlCanonica(urls: readonly string[]): string {
  return urls.find((url) => !url.includes('?')) ?? urls[0] ?? ''
}

export function cargarCatalogoProductos(): CatalogoProductos {
  if (cache) {
    return cache
  }

  const contenido = readFileSync(RUTA_CSV, 'utf8')
  const filas = parsearCsv(contenido.replace(/^\uFEFF/u, ''))
  const encabezado = filas[0] ?? []
  const indiceNombre = encabezado.findIndex((columna) => normalizarCatalogo(columna) === 'nombre')
  const indiceUrl = encabezado.findIndex((columna) =>
    normalizarCatalogo(columna).includes('url del producto'),
  )

  if (indiceNombre < 0 || indiceUrl < 0) {
    throw new Error('El CSV de productos no contiene las columnas Nombre y URL del producto')
  }

  const agrupados = new Map<string, { nombre: string; urls: Set<string> }>()
  let filasDatos = 0
  let descartados = 0

  for (const fila of filas.slice(1)) {
    const nombre = (fila[indiceNombre] ?? '').trim()
    const url = (fila[indiceUrl] ?? '').trim()
    if (nombre.length === 0 && url.length === 0) {
      continue
    }
    filasDatos += 1
    if (nombre.length === 0 || !esUrlValida(url)) {
      descartados += 1
      continue
    }

    const clave = normalizarCatalogo(nombre)
    const actual = agrupados.get(clave)
    if (actual) {
      actual.urls.add(url)
    } else {
      agrupados.set(clave, { nombre, urls: new Set([url]) })
    }
  }

  const productos: ProductoCatalogo[] = []
  for (const { nombre, urls } of agrupados.values()) {
    const variantes = [...urls]
    const url = urlCanonica(variantes)
    if (url.length === 0) {
      descartados += 1
      continue
    }
    productos.push({
      id: `producto-${(productos.length + 1).toString()}`,
      nombre,
      url,
      variantes,
    })
  }

  cache = {
    fuente: 'data/catalogos/productos-desitec.csv',
    productos,
    conteos: {
      filas: filasDatos,
      productos: productos.length,
      variantes: productos.reduce((total, producto) => total + producto.variantes.length, 0),
      descartados,
    },
  }

  return cache
}

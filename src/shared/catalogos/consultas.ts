import {
  cargarCatalogoExtranjero,
  cargarCatalogoGeografia,
  obtenerResolutorUbicaciones,
} from './geografia/index.js'
import type { ResultadoUbicacion, UbicacionValidada } from './geografia/index.js'
import { buscarProductos, cargarCatalogoProductos, esCategoriaProducto } from './productos/index.js'
import type { ProductoCatalogo, ResultadoBusquedaProductos } from './productos/index.js'

function resolutorLocal(): ReturnType<typeof obtenerResolutorUbicaciones> {
  return obtenerResolutorUbicaciones(cargarCatalogoGeografia(), cargarCatalogoExtranjero())
}

export function resolverUbicacionLocal(texto: string): ResultadoUbicacion {
  return resolutorLocal().resolver(texto)
}

export function resolverUbicacionExactaLocal(texto: string): ResultadoUbicacion {
  return resolutorLocal().resolverExacto(texto)
}

export function formatearUbicacionesLocales(
  candidatos: readonly UbicacionValidada[],
  limite = 3,
): string {
  return resolutorLocal().formatearCandidatos(candidatos, limite)
}

export function buscarProductosLocal(texto: string): ResultadoBusquedaProductos {
  return buscarProductos(cargarCatalogoProductos(), texto)
}

export function productosCatalogoLocal(): readonly ProductoCatalogo[] {
  return cargarCatalogoProductos().productos
}

export { esCategoriaProducto }

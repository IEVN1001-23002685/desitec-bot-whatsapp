import type { ProveedorMensajeria } from '../../modules/whatsapp/domain/types/proveedor-mensajeria.js'

export function normalizarCodigoCuenta(codigo: string): string {
  return codigo
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function referenciasPorProveedor(
  codigo: string,
  proveedor: ProveedorMensajeria,
): { credencialRef: string | null; webhookSecretRef: string | null } {
  if (proveedor !== '360dialog') {
    return { credencialRef: null, webhookSecretRef: null }
  }
  const sufijo = normalizarCodigoCuenta(codigo)
  return {
    credencialRef: `D360_API_KEY_${sufijo}`,
    webhookSecretRef: `D360_WEBHOOK_SECRET_${sufijo}`,
  }
}

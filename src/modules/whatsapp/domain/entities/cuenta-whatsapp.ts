import type { ProveedorMensajeria } from '../types/proveedor-mensajeria.js'

export type CuentaWhatsApp = {
  id: string
  codigo: string
  nombreComercial: string
  idNumeroTelefono: string
  telefonoVisible: string
  tokenAcceso: string | null
  proveedor: ProveedorMensajeria
  credencialRef: string | null
  webhookSecretRef: string | null
  estaActiva: boolean
}

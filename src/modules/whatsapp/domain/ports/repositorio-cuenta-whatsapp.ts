import type { CuentaWhatsApp } from '../entities/cuenta-whatsapp.js'

export interface RepositorioCuentaWhatsApp {
  buscarPorIdNumeroTelefono(idNumeroTelefono: string): Promise<CuentaWhatsApp | null>
  listarActivas(): Promise<CuentaWhatsApp[]>
}

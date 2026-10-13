import { esIdMetaValido } from '../../../../shared/security/validadores.js'
import type { CuentaWhatsApp } from '../../domain/entities/cuenta-whatsapp.js'
import type { RepositorioCuentaWhatsApp } from '../../domain/ports/repositorio-cuenta-whatsapp.js'

export class ResolverCuentaWhatsApp {
  constructor(private readonly cuentas: RepositorioCuentaWhatsApp) {}

  async ejecutar(idNumeroTelefono: string): Promise<CuentaWhatsApp | null> {
    if (!esIdMetaValido(idNumeroTelefono)) {
      return null
    }
    return this.cuentas.buscarPorIdNumeroTelefono(idNumeroTelefono)
  }
}
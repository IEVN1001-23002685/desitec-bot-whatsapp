import type { ProveedorMensajeria } from '../../domain/types/proveedor-mensajeria.js'
import type {
  EntradaEnviarMensaje,
  ProveedorMensajes,
  ResultadoEnviarMensaje,
} from '../../domain/ports/proveedor-mensajes.js'

export class ErrorProveedorNoSoportado extends Error {
  constructor(proveedor: ProveedorMensajeria) {
    super(`Proveedor de mensajeria no soportado: ${proveedor}`)
    this.name = 'ErrorProveedorNoSoportado'
  }
}

export class EnrutadorProveedorMensajes implements ProveedorMensajes {
  constructor(
    private readonly proveedores: Partial<Record<ProveedorMensajeria, ProveedorMensajes>>,
  ) {}

  async enviar(entrada: EntradaEnviarMensaje): Promise<ResultadoEnviarMensaje> {
    const proveedor = this.proveedores[entrada.proveedor]
    if (!proveedor) {
      throw new ErrorProveedorNoSoportado(entrada.proveedor)
    }
    return proveedor.enviar(entrada)
  }
}

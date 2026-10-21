import { describe, expect, it } from 'vitest'
import { EnrutadorProveedorMensajes } from '../src/modules/whatsapp/infrastructure/providers/enrutador-proveedor-mensajes.js'
import type {
  EntradaEnviarMensaje,
  ProveedorMensajes,
  ResultadoEnviarMensaje,
} from '../src/modules/whatsapp/domain/ports/proveedor-mensajes.js'

class ProveedorGrabador implements ProveedorMensajes {
  readonly entradas: EntradaEnviarMensaje[] = []

  constructor(private readonly id: string) {}

  async enviar(entrada: EntradaEnviarMensaje): Promise<ResultadoEnviarMensaje> {
    this.entradas.push(entrada)
    return { idMensajeMeta: `wamid.${this.id}` }
  }
}

function entrada(proveedor: EntradaEnviarMensaje['proveedor']): EntradaEnviarMensaje {
  return {
    tipo: 'text',
    proveedor,
    idNumeroTelefono: '111111111111111',
    credencial: 'credencial',
    idWa: '5215512345678',
    cuerpo: 'Hola',
  }
}

describe('EnrutadorProveedorMensajes', () => {
  it('enruta al proveedor declarado en la entrada', async () => {
    const meta = new ProveedorGrabador('meta')
    const d360 = new ProveedorGrabador('360')
    const enrutador = new EnrutadorProveedorMensajes({ meta, '360dialog': d360 })

    const resultadoMeta = await enrutador.enviar(entrada('meta'))
    const resultadoD360 = await enrutador.enviar(entrada('360dialog'))

    expect(resultadoMeta.idMensajeMeta).toBe('wamid.meta')
    expect(resultadoD360.idMensajeMeta).toBe('wamid.360')
    expect(meta.entradas).toHaveLength(1)
    expect(d360.entradas).toHaveLength(1)
  })

  it('lanza error si el proveedor no esta configurado', async () => {
    const enrutador = new EnrutadorProveedorMensajes({ meta: new ProveedorGrabador('meta') })

    await expect(enrutador.enviar(entrada('360dialog'))).rejects.toMatchObject({
      name: 'ErrorProveedorNoSoportado',
    })
  })
})

import { describe, expect, it } from 'vitest'
import {
  AlmacenEnMemoria,
  ProveedorMensajesFalso,
  RepositorioCuentaWhatsAppEnMemoria,
  RepositorioGuionLeadEnMemoria,
  RepositorioLeadEnMemoria,
  TransaccionMensajeEntranteEnMemoria,
  cuentasPrueba,
  guionLeadPrueba,
} from './helpers/en-memoria.js'
import { ProcesarMensajeAutorespuesta } from '../src/modules/autorespuestas/application/use-cases/procesar-mensaje-autorespuesta.js'
import { EnviarMensajeSaliente } from '../src/modules/whatsapp/application/use-cases/enviar-mensaje-saliente.js'
import type { EntradaGuion } from '../src/modules/autorespuestas/domain/entities/entrada-guion.js'
import type { EntradaProcesarAutorespuesta } from '../src/modules/whatsapp/application/ports/procesador-autorespuesta.js'

const CONVERSACION = 'conversacion-1'
const CUENTA = 'linea-comercial'
const WA = '5215512345678'

function textoGuion(clave: string): string {
  const entrada = guionLeadPrueba().find((item) => item.clave === clave)
  if (!entrada) {
    throw new Error(`el guion de prueba no tiene la clave ${clave}`)
  }
  return entrada.texto
}

function crearProcesador(entradasGuion: EntradaGuion[] = guionLeadPrueba()) {
  const almacen = new AlmacenEnMemoria()
  const proveedor = new ProveedorMensajesFalso()
  const transaccion = new TransaccionMensajeEntranteEnMemoria(almacen)
  const enviarMensaje = new EnviarMensajeSaliente(
    new RepositorioCuentaWhatsAppEnMemoria(cuentasPrueba()),
    transaccion,
    proveedor,
    { ventanaAtencionActiva: false },
  )
  const procesar = new ProcesarMensajeAutorespuesta(
    new RepositorioLeadEnMemoria(almacen),
    new RepositorioGuionLeadEnMemoria(entradasGuion),
    enviarMensaje,
  )
  return { almacen, proveedor, procesar }
}

function entrada(texto: string | null): EntradaProcesarAutorespuesta {
  return { idConversacion: CONVERSACION, codigoCuenta: CUENTA, idWa: WA, texto }
}

describe('ProcesarMensajeAutorespuesta', () => {
  it('crea el lead y envia la bienvenida con el primer mensaje', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))

    expect(almacen.leads).toHaveLength(1)
    expect(almacen.leads[0]).toMatchObject({
      idConversacion: CONVERSACION,
      pasoActual: 'nombre',
      estado: 'capturando',
    })
    expect(proveedor.envios).toHaveLength(1)
    expect(proveedor.envios[0]).toMatchObject({ tipo: 'text', cuerpo: textoGuion('bienvenida') })
  })

  it('captura todos los datos y completa el lead', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada('Ana'))
    await procesar.procesar(entrada('ana@example.com'))
    await procesar.procesar(entrada('Modelo X'))
    await procesar.procesar(entrada('3'))
    await procesar.procesar(entrada('Puebla'))

    expect(almacen.leads[0]).toMatchObject({
      nombre: 'Ana',
      correo: 'ana@example.com',
      modelos: 'Modelo X',
      cantidad: 3,
      ciudad: 'Puebla',
      pasoActual: 'ciudad',
      estado: 'listo_pipedrive',
    })
    expect(almacen.leads[0]?.completadoEn).not.toBeNull()
    expect(proveedor.envios).toHaveLength(6)
    expect(proveedor.envios[5]?.cuerpo).toBe(textoGuion('confirmacion'))
  })

  it('vuelve a pedir el correo cuando es invalido sin avanzar', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada('Ana'))
    await procesar.procesar(entrada('correo-malo'))

    expect(almacen.leads[0]).toMatchObject({
      nombre: 'Ana',
      correo: null,
      pasoActual: 'correo',
      estado: 'capturando',
    })
    expect(proveedor.envios[2]?.cuerpo).toBe(textoGuion('correo_invalido'))
  })

  it('vuelve a pedir el paso actual cuando el mensaje no es de texto', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada(null))

    expect(almacen.leads[0]).toMatchObject({ pasoActual: 'nombre', estado: 'capturando' })
    expect(almacen.leads[0]?.nombre).toBeNull()
    expect(proveedor.envios[1]?.cuerpo).toBe(textoGuion('pedir_nombre'))
  })

  it('no responde cuando el lead ya salio de la captura', async () => {
    const { proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada('Ana'))
    await procesar.procesar(entrada('ana@example.com'))
    await procesar.procesar(entrada('Modelo X'))
    await procesar.procesar(entrada('3'))
    await procesar.procesar(entrada('Puebla'))
    await procesar.procesar(entrada('otra cosa'))

    expect(proveedor.envios).toHaveLength(6)
  })

  it('lanza un error claro cuando falta el texto del guion', async () => {
    const { procesar } = crearProcesador([])

    await expect(procesar.procesar(entrada('Hola'))).rejects.toThrow('bienvenida')
  })
})

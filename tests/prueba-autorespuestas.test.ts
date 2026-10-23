import { describe, expect, it } from 'vitest'
import {
  AlmacenEnMemoria,
  PausadorSeguimientosFalso,
  ProveedorMensajesFalso,
  RepositorioCuentaWhatsAppEnMemoria,
  RepositorioGuionLeadEnMemoria,
  RepositorioLeadEnMemoria,
  ResolverCredencialCuentaFalso,
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

function crearProcesador(
  entradasGuion: EntradaGuion[] = guionLeadPrueba(),
  numerosPermitidos: string[] = [],
  pausador?: PausadorSeguimientosFalso,
) {
  const almacen = new AlmacenEnMemoria()
  const proveedor = new ProveedorMensajesFalso()
  const transaccion = new TransaccionMensajeEntranteEnMemoria(almacen)
  const enviarMensaje = new EnviarMensajeSaliente(
    new RepositorioCuentaWhatsAppEnMemoria(cuentasPrueba()),
    transaccion,
    proveedor,
    new ResolverCredencialCuentaFalso(),
    { ventanaAtencionActiva: false },
  )
  const procesar = new ProcesarMensajeAutorespuesta(
    new RepositorioLeadEnMemoria(almacen),
    new RepositorioGuionLeadEnMemoria(entradasGuion),
    enviarMensaje,
    numerosPermitidos,
    pausador,
  )
  return { almacen, proveedor, procesar }
}

function entrada(texto: string | null, idWa = WA): EntradaProcesarAutorespuesta {
  return { idConversacion: CONVERSACION, codigoCuenta: CUENTA, idWa, texto }
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
    expect(proveedor.envios[5]).toMatchObject({ tipo: 'text', cuerpo: textoGuion('confirmacion') })
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
    expect(proveedor.envios[2]).toMatchObject({
      tipo: 'text',
      cuerpo: textoGuion('correo_invalido'),
    })
  })

  it('vuelve a pedir el paso actual cuando el mensaje no es de texto', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada(null))

    expect(almacen.leads[0]).toMatchObject({ pasoActual: 'nombre', estado: 'capturando' })
    expect(almacen.leads[0]?.nombre).toBeNull()
    expect(proveedor.envios[1]).toMatchObject({ tipo: 'text', cuerpo: textoGuion('pedir_nombre') })
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

  it('deriva a un asesor con el primer mensaje sin guardar el texto como nombre', async () => {
    const pausador = new PausadorSeguimientosFalso()
    const { almacen, proveedor, procesar } = crearProcesador(guionLeadPrueba(), [], pausador)

    await procesar.procesar(entrada('Quiero hablar con una persona'))

    expect(almacen.leads).toHaveLength(1)
    expect(almacen.leads[0]).toMatchObject({
      nombre: null,
      pasoActual: 'nombre',
      estado: 'en_asesor',
    })
    expect(proveedor.envios).toHaveLength(1)
    expect(proveedor.envios[0]).toMatchObject({
      tipo: 'text',
      cuerpo: textoGuion('paso_a_asesor'),
    })
    expect(pausador.llamadas).toEqual([CONVERSACION])
    expect(pausador.origenes).toEqual(['cliente'])
  })

  it('deriva a un asesor en modelos sin guardar el texto como modelo', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada('Ana'))
    await procesar.procesar(entrada('ana@example.com'))
    await procesar.procesar(entrada('Quiero hablar con una persona'))

    expect(almacen.leads[0]).toMatchObject({
      nombre: 'Ana',
      correo: 'ana@example.com',
      modelos: null,
      pasoActual: 'modelos',
      estado: 'en_asesor',
    })
    expect(proveedor.envios[3]).toMatchObject({
      tipo: 'text',
      cuerpo: textoGuion('paso_a_asesor'),
    })
  })

  it('guarda un modelo ejecutivo sin derivar a un asesor', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada('Ana'))
    await procesar.procesar(entrada('ana@example.com'))
    await procesar.procesar(entrada('Quiero el modelo ejecutivo'))

    expect(almacen.leads[0]).toMatchObject({
      modelos: 'Quiero el modelo ejecutivo',
      pasoActual: 'cantidad',
      estado: 'capturando',
    })
    expect(proveedor.envios[3]).toMatchObject({
      tipo: 'text',
      cuerpo: textoGuion('pedir_cantidad'),
    })
  })

  it('deriva a un asesor en cantidad sin responder cantidad invalida', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada('Ana'))
    await procesar.procesar(entrada('ana@example.com'))
    await procesar.procesar(entrada('Modelo X'))
    await procesar.procesar(entrada('Quiero hablar con una persona'))

    expect(almacen.leads[0]).toMatchObject({
      modelos: 'Modelo X',
      cantidad: null,
      pasoActual: 'cantidad',
      estado: 'en_asesor',
    })
    expect(proveedor.envios).toHaveLength(5)
    expect(proveedor.envios[4]).toMatchObject({
      tipo: 'text',
      cuerpo: textoGuion('paso_a_asesor'),
    })
  })

  it('no repite la respuesta cuando el lead ya esta en asesor', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Quiero hablar con una persona'))
    await procesar.procesar(entrada('Quiero hablar con una persona'))

    expect(almacen.leads[0]).toMatchObject({ estado: 'en_asesor' })
    expect(proveedor.envios).toHaveLength(1)
  })

  it('permite derivar a un asesor despues de completar el lead', async () => {
    const pausador = new PausadorSeguimientosFalso()
    const { almacen, proveedor, procesar } = crearProcesador(guionLeadPrueba(), [], pausador)

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada('Ana'))
    await procesar.procesar(entrada('ana@example.com'))
    await procesar.procesar(entrada('Modelo X'))
    await procesar.procesar(entrada('3'))
    await procesar.procesar(entrada('Puebla'))
    await procesar.procesar(entrada('Quiero hablar con una persona'))

    expect(almacen.leads[0]).toMatchObject({
      ciudad: 'Puebla',
      estado: 'en_asesor',
    })
    expect(almacen.leads[0]?.completadoEn).not.toBeNull()
    expect(proveedor.envios).toHaveLength(7)
    expect(proveedor.envios[6]).toMatchObject({
      tipo: 'text',
      cuerpo: textoGuion('paso_a_asesor'),
    })
    expect(pausador.llamadas).toEqual([CONVERSACION])
  })

  it('envia el handoff aunque falle la pausa de seguimientos', async () => {
    const pausador = new PausadorSeguimientosFalso({ error: new Error('db no disponible') })
    const { almacen, proveedor, procesar } = crearProcesador(guionLeadPrueba(), [], pausador)

    await procesar.procesar(entrada('Quiero hablar con una persona'))

    expect(almacen.leads[0]).toMatchObject({ estado: 'en_asesor' })
    expect(proveedor.envios).toHaveLength(1)
    expect(proveedor.envios[0]).toMatchObject({
      tipo: 'text',
      cuerpo: textoGuion('paso_a_asesor'),
    })
  })

  it('no deriva a un asesor cuando el remitente no esta permitido', async () => {
    const pausador = new PausadorSeguimientosFalso()
    const { almacen, proveedor, procesar } = crearProcesador(
      guionLeadPrueba(),
      ['4772905770'],
      pausador,
    )

    await procesar.procesar(entrada('Quiero hablar con una persona'))

    expect(almacen.leads).toHaveLength(0)
    expect(proveedor.envios).toHaveLength(0)
    expect(pausador.llamadas).toHaveLength(0)
  })

  it('no activa el bot cuando el numero remitente no esta permitido', async () => {
    const { almacen, proveedor, procesar } = crearProcesador(guionLeadPrueba(), ['4772905770'])

    await procesar.procesar(entrada('Hola'))

    expect(almacen.leads).toHaveLength(0)
    expect(proveedor.envios).toHaveLength(0)
  })

  it('activa el bot cuando el numero permitido coincide con formato internacional', async () => {
    const { almacen, proveedor, procesar } = crearProcesador(guionLeadPrueba(), [
      '+52 477 290 5770',
    ])

    await procesar.procesar(entrada('Hola', '5214772905770'))

    expect(almacen.leads).toHaveLength(1)
    expect(proveedor.envios).toHaveLength(1)
    expect(proveedor.envios[0]).toMatchObject({ idWa: '5214772905770' })
  })

  it('extrae producto, cantidad y ciudad del primer mensaje y solo pide el nombre', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola, necesito cotizar 6 estaciones manuales para Querétaro'))

    expect(almacen.leads[0]).toMatchObject({
      nombre: null,
      correo: null,
      modelos: 'estaciones manuales (6)',
      cantidad: 6,
      ciudad: 'Querétaro',
      pasoActual: 'nombre',
      estado: 'capturando',
    })
    expect(proveedor.envios[0]).toMatchObject({
      tipo: 'text',
      cuerpo: textoGuion('bienvenida'),
    })
  })

  it('completa el lead con todos los datos en el primer mensaje', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(
      entrada(
        'Hola, soy Ana, mi correo es ana@example.com, necesito 2 gabinetes y 6 estaciones manuales para Querétaro',
      ),
    )

    expect(almacen.leads[0]).toMatchObject({
      nombre: 'Ana',
      correo: 'ana@example.com',
      modelos: 'gabinetes (2); estaciones manuales (6)',
      cantidad: 8,
      ciudad: 'Querétaro',
      pasoActual: 'ciudad',
      estado: 'listo_pipedrive',
    })
    expect(almacen.leads[0]?.completadoEn).not.toBeNull()
    expect(proveedor.envios).toHaveLength(1)
    expect(proveedor.envios[0]).toMatchObject({
      tipo: 'text',
      cuerpo: textoGuion('confirmacion'),
    })
  })

  it('conserva los datos del primer mensaje y no vuelve a pedirlos', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola, necesito cotizar 6 estaciones manuales para Querétaro'))
    await procesar.procesar(entrada('Ana'))
    await procesar.procesar(entrada('ana@example.com'))

    expect(almacen.leads[0]).toMatchObject({
      nombre: 'Ana',
      correo: 'ana@example.com',
      modelos: 'estaciones manuales (6)',
      cantidad: 6,
      ciudad: 'Querétaro',
      estado: 'listo_pipedrive',
    })
    expect(proveedor.envios).toHaveLength(3)
    expect(proveedor.envios[1]).toMatchObject({ cuerpo: textoGuion('pedir_correo') })
    expect(proveedor.envios[2]).toMatchObject({ cuerpo: textoGuion('confirmacion') })
  })

  it('actualiza la cantidad con una correccion explicita sin perder la ciudad pendiente', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada('Ana'))
    await procesar.procesar(entrada('ana@example.com'))
    await procesar.procesar(entrada('Modelo X'))
    await procesar.procesar(entrada('3'))
    await procesar.procesar(entrada('en realidad son 6'))

    expect(almacen.leads[0]).toMatchObject({
      cantidad: 6,
      ciudad: null,
      pasoActual: 'ciudad',
      estado: 'capturando',
    })
    expect(proveedor.envios[5]).toMatchObject({ cuerpo: textoGuion('pedir_ciudad') })
  })

  it('pide aclaracion cuando hay mas de un correo', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada('Ana'))
    await procesar.procesar(entrada('ana@example.com, pedro@example.com'))

    expect(almacen.leads[0]).toMatchObject({
      correo: null,
      pasoActual: 'correo',
      estado: 'capturando',
    })
    expect(proveedor.envios[2]).toMatchObject({ cuerpo: textoGuion('correo_ambiguo') })
  })

  it('pide una cantidad exacta cuando recibe un rango', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada('Ana'))
    await procesar.procesar(entrada('ana@example.com'))
    await procesar.procesar(entrada('Modelo X'))
    await procesar.procesar(entrada('3-5'))

    expect(almacen.leads[0]).toMatchObject({
      cantidad: null,
      pasoActual: 'cantidad',
      estado: 'capturando',
    })
    expect(proveedor.envios[4]).toMatchObject({ cuerpo: textoGuion('cantidad_rango') })
  })

  it('agrega un producto adicional en el paso de cantidad y pide el total', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada('Ana'))
    await procesar.procesar(entrada('ana@example.com'))
    await procesar.procesar(entrada('Modelo X'))
    await procesar.procesar(entrada('Gabinete'))

    expect(almacen.leads[0]).toMatchObject({
      modelos: 'Modelo X; Gabinete',
      cantidad: null,
      pasoActual: 'cantidad',
      estado: 'capturando',
    })
    expect(proveedor.envios[4]).toMatchObject({ cuerpo: textoGuion('producto_agregado') })
  })

  it('aplica correcciones de correo y ciudad sin reiniciar el flujo', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada('Ana'))
    await procesar.procesar(entrada('viejo@example.com'))
    await procesar.procesar(entrada('Modelo X'))
    await procesar.procesar(entrada('3'))
    await procesar.procesar(entrada('mi correo es nuevo@example.com y mi ciudad es León'))

    expect(almacen.leads[0]).toMatchObject({
      nombre: 'Ana',
      correo: 'nuevo@example.com',
      modelos: 'Modelo X',
      cantidad: 3,
      ciudad: 'León',
      estado: 'listo_pipedrive',
    })
    expect(proveedor.envios[5]).toMatchObject({ cuerpo: textoGuion('confirmacion') })
  })

  it('corrige el modelo sin perder la cantidad ni la ciudad pendiente', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada('Ana'))
    await procesar.procesar(entrada('ana@example.com'))
    await procesar.procesar(entrada('Modelo X'))
    await procesar.procesar(entrada('3'))
    await procesar.procesar(entrada('en realidad el modelo es Modelo Y'))

    expect(almacen.leads[0]).toMatchObject({
      modelos: 'Modelo Y',
      cantidad: 3,
      ciudad: null,
      pasoActual: 'ciudad',
      estado: 'capturando',
    })
    expect(proveedor.envios[5]).toMatchObject({ cuerpo: textoGuion('pedir_ciudad') })
  })
})

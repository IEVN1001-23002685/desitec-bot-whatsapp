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

  it('atiende el CTA global pidiendo el nombre sin inventar un producto', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(
      entrada(
        'Hola, me gustaría recibir asesoría de un especialista para elegir la solución adecuada. ¿Me pueden apoyar?',
      ),
    )

    expect(almacen.leads[0]).toMatchObject({
      estado: 'en_asesor',
    })
    expect(proveedor.envios[0]).toMatchObject({ cuerpo: textoGuion('paso_a_asesor') })
  })

  it('guarda el producto del CTA y pide el siguiente dato sin dar informacion', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(
      entrada('Quiero información del producto: Garrett Arco Detector de Metales PD 6500i'),
    )

    expect(almacen.leads[0]).toMatchObject({
      pasoActual: 'nombre',
      estado: 'capturando',
    })
    expect(almacen.leads[0]?.modelos).toContain('Garrett Arco Detector de Metales PD 6500i')
    expect(proveedor.envios[0]).toMatchObject({ cuerpo: textoGuion('pedir_nombre') })
  })

  it('captura varios modelos en el primer mensaje', async () => {
    const { almacen, procesar } = crearProcesador()

    await procesar.procesar(
      entrada(
        'Hola, necesito cotizar Notifier Detector de Humo FSP-951 y Edwards Gabinete de Batería Rojo BC-1R',
      ),
    )

    expect(almacen.leads[0]?.modelos).toContain('Notifier Detector de Humo FSP-951')
    expect(almacen.leads[0]?.modelos).toContain('Edwards Gabinete de Batería Rojo BC-1R')
    expect(almacen.leads[0]).toMatchObject({
      pasoActual: 'nombre',
    })
  })

  it('captura todos los datos y completa el lead', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada('Ana'))
    await procesar.procesar(entrada('ana@example.com'))
    await procesar.procesar(entrada('Notifier Detector de Humo FSP-951'))
    await procesar.procesar(entrada('3'))
    await procesar.procesar(entrada('Puebla'))

    expect(almacen.leads[0]).toMatchObject({
      nombre: 'Ana',
      correo: 'ana@example.com',
      cantidad: 3,
      ciudad: 'Puebla, Puebla',
      pasoActual: 'ciudad',
      estado: 'listo_pipedrive',
    })
    expect(almacen.leads[0]?.modelos).toContain('Notifier Detector de Humo FSP-951')
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

    expect(proveedor.envios).toHaveLength(7)
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
    await procesar.procesar(entrada('Notifier Estación Manual Direccionable NBG-12LX'))

    expect(almacen.leads[0]).toMatchObject({
      pasoActual: 'cantidad',
      estado: 'capturando',
    })
    expect(almacen.leads[0]?.modelos).toContain('Notifier Estación Manual Direccionable NBG-12LX')
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
    await procesar.procesar(entrada('Notifier Detector de Humo FSP-951'))
    await procesar.procesar(entrada('Quiero hablar con una persona'))

    expect(almacen.leads[0]?.cantidad).toBeNull()
    expect(almacen.leads[0]).toMatchObject({
      pasoActual: 'cantidad',
      estado: 'en_asesor',
    })
    expect(almacen.leads[0]?.modelos).toContain('Notifier Detector de Humo FSP-951')
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
    await procesar.procesar(entrada('Notifier Detector de Humo FSP-951'))
    await procesar.procesar(entrada('3'))
    await procesar.procesar(entrada('Puebla'))
    await procesar.procesar(entrada('Quiero hablar con una persona'))

    expect(almacen.leads[0]).toMatchObject({
      ciudad: 'Puebla, Puebla',
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

    await procesar.procesar(
      entrada(
        'Hola, necesito cotizar 6 Notifier Estación Manual Direccionable NBG-12LX para Querétaro',
      ),
    )

    expect(almacen.leads[0]).toMatchObject({
      nombre: null,
      correo: null,
      cantidad: 6,
      ciudad: 'Querétaro, Querétaro',
      pasoActual: 'nombre',
      estado: 'capturando',
    })
    expect(almacen.leads[0]?.modelos).toContain('Notifier Estación Manual Direccionable NBG-12LX')
    expect(proveedor.envios[0]).toMatchObject({
      tipo: 'text',
      cuerpo: textoGuion('pedir_nombre'),
    })
  })

  it('completa el lead con todos los datos en el primer mensaje', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(
      entrada(
        'Hola, soy Ana, mi correo es ana@example.com, necesito 2 Notifier Detector de Humo FSP-951 y 6 Edwards Gabinete de Batería Rojo BC-1R para Querétaro',
      ),
    )

    expect(almacen.leads[0]).toMatchObject({
      nombre: 'Ana',
      correo: 'ana@example.com',
      cantidad: 8,
      ciudad: 'Querétaro, Querétaro',
      pasoActual: 'ciudad',
      estado: 'listo_pipedrive',
    })
    expect(almacen.leads[0]?.modelos).toContain('Notifier Detector de Humo FSP-951')
    expect(almacen.leads[0]?.modelos).toContain('Edwards Gabinete de Batería Rojo BC-1R')
    expect(almacen.leads[0]?.completadoEn).not.toBeNull()
    expect(proveedor.envios).toHaveLength(1)
    expect(proveedor.envios[0]).toMatchObject({
      tipo: 'text',
      cuerpo: textoGuion('confirmacion'),
    })
  })

  it('conserva los datos del primer mensaje y no vuelve a pedirlos', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(
      entrada(
        'Hola, necesito cotizar 6 Notifier Estación Manual Direccionable NBG-12LX para Querétaro',
      ),
    )
    await procesar.procesar(entrada('Ana'))
    await procesar.procesar(entrada('ana@example.com'))

    expect(almacen.leads[0]).toMatchObject({
      nombre: 'Ana',
      correo: 'ana@example.com',
      cantidad: 6,
      ciudad: 'Querétaro, Querétaro',
      estado: 'listo_pipedrive',
    })
    expect(almacen.leads[0]?.modelos).toContain('Notifier Estación Manual Direccionable NBG-12LX')
    expect(proveedor.envios).toHaveLength(3)
    expect(proveedor.envios[1]).toMatchObject({ cuerpo: textoGuion('pedir_correo') })
    expect(proveedor.envios[2]).toMatchObject({ cuerpo: textoGuion('confirmacion') })
  })

  it('actualiza la cantidad con una correccion explicita sin perder la ciudad pendiente', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada('Ana'))
    await procesar.procesar(entrada('ana@example.com'))
    await procesar.procesar(entrada('Notifier Detector de Humo FSP-951'))
    await procesar.procesar(entrada('3'))
    await procesar.procesar(entrada('en realidad son 6'))

    expect(almacen.leads[0]).toMatchObject({
      cantidad: 6,
      ciudad: null,
      pasoActual: 'ciudad',
      estado: 'capturando',
    })
    expect(almacen.leads[0]?.modelos).toContain('Notifier Detector de Humo FSP-951')
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
    await procesar.procesar(entrada('Notifier Detector de Humo FSP-951'))
    await procesar.procesar(entrada('3-5'))

    expect(almacen.leads[0]).toMatchObject({
      cantidad: null,
      pasoActual: 'cantidad',
      estado: 'capturando',
    })
    expect(almacen.leads[0]?.modelos).toContain('Notifier Detector de Humo FSP-951')
    expect(proveedor.envios[4]).toMatchObject({
      tipo: 'text',
      cuerpo: textoGuion('cantidad_rango'),
    })
  })

  it('agrega un producto adicional en el paso de cantidad y pide el total', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada('Ana'))
    await procesar.procesar(entrada('ana@example.com'))
    await procesar.procesar(entrada('Notifier Detector de Humo FSP-951'))
    await procesar.procesar(entrada('Edwards Gabinete de Batería Rojo BC-1R'))

    expect(almacen.leads[0]?.cantidad).toBeNull()
    expect(almacen.leads[0]).toMatchObject({
      pasoActual: 'cantidad',
      estado: 'capturando',
    })
    expect(almacen.leads[0]?.modelos).toContain('Notifier Detector de Humo FSP-951')
    expect(almacen.leads[0]?.modelos).toContain('Edwards Gabinete de Batería Rojo BC-1R')
    expect(proveedor.envios[4]).toMatchObject({ cuerpo: textoGuion('producto_agregado') })
  })

  it('agrega varios modelos corregidos y usa el guion singular si falta el plural', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada('Ana'))
    await procesar.procesar(entrada('ana@example.com'))
    await procesar.procesar(entrada('Notifier Detector de Humo FSP-951'))
    await procesar.procesar(entrada('3'))
    await procesar.procesar(
      entrada(
        'mejor los modelos Edwards Gabinete de Batería Rojo BC-1R y Notifier Estación Manual Direccionable NBG-12LX',
      ),
    )

    expect(almacen.leads[0]?.cantidad).toBeNull()
    expect(almacen.leads[0]).toMatchObject({
      pasoActual: 'ciudad',
      estado: 'capturando',
    })
    expect(almacen.leads[0]?.modelos).toContain('Edwards Gabinete de Batería Rojo BC-1R')
    expect(almacen.leads[0]?.modelos).toContain('Notifier Estación Manual Direccionable NBG-12LX')
    expect(proveedor.envios[5]).toMatchObject({
      tipo: 'text',
      cuerpo: expect.stringContaining('Baja California'),
    })
  })

  it('aplica correcciones de correo y ciudad sin reiniciar el flujo', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada('Ana'))
    await procesar.procesar(entrada('viejo@example.com'))
    await procesar.procesar(entrada('Notifier Detector de Humo FSP-951'))
    await procesar.procesar(entrada('3'))
    await procesar.procesar(entrada('mi correo es nuevo@example.com y mi ciudad es León'))

    expect(almacen.leads[0]).toMatchObject({
      nombre: 'Ana',
      correo: 'nuevo@example.com',
      cantidad: 3,
      ciudad: 'León, Guanajuato',
      estado: 'listo_pipedrive',
    })
    expect(almacen.leads[0]?.modelos).toContain('Notifier Detector de Humo FSP-951')
    expect(proveedor.envios[5]).toMatchObject({ cuerpo: textoGuion('confirmacion') })
  })

  it('corrige el modelo sin perder la cantidad ni la ciudad pendiente', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada('Ana'))
    await procesar.procesar(entrada('ana@example.com'))
    await procesar.procesar(entrada('Notifier Detector de Humo FSP-951'))
    await procesar.procesar(entrada('3'))
    await procesar.procesar(
      entrada('en realidad el modelo es Edwards Gabinete de Batería Rojo BC-1R'),
    )

    expect(almacen.leads[0]).toMatchObject({
      cantidad: null,
      ciudad: 'Baja California',
      pasoActual: 'ciudad',
      estado: 'capturando',
    })
    expect(almacen.leads[0]?.modelos).toContain('Edwards Gabinete de Batería Rojo BC-1R')
    expect(proveedor.envios[5]).toMatchObject({
      tipo: 'text',
      cuerpo: expect.stringContaining('Baja California'),
    })
  })

  it('trata un saludo y una cotizacion general como solicitud de precision, no como nombre', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola mucho gusto, quisiera cotizar equipo contra incendio'))
    await procesar.procesar(entrada('piezas de que?'))

    expect(almacen.leads[0]).toMatchObject({
      nombre: null,
      modelos: null,
      cantidad: null,
      estado: 'capturando',
    })
    expect(proveedor.envios[0]?.cuerpo).toContain('Qué tipo de')
    expect(proveedor.envios[1]?.cuerpo).toContain('todavía no hemos definido')
  })

  it('conserva sugerencias de paneles para ofrecer alternativas cuando el cliente pide otro', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(entrada('Hola'))
    await procesar.procesar(entrada('Roberto'))
    await procesar.procesar(entrada('jose@gmail.com'))
    await procesar.procesar(entrada('quiero paneles'))
    await procesar.procesar(entrada('otro'))

    expect(almacen.leads[0]?.modelos).toBeNull()
    expect(almacen.leads[0]?.contextoProducto.sugerencias.length).toBeGreaterThan(0)
    expect(proveedor.envios[3]?.cuerpo).toContain('Encontré varios productos posibles')
    expect(proveedor.envios[4]?.cuerpo).toContain('revisemos otras opciones')
  })

  it('extrae varios datos de una solicitud libre sin inventar el modelo del catalogo', async () => {
    const { almacen, proveedor, procesar } = crearProcesador()

    await procesar.procesar(
      entrada(
        'Hola me llamo Pedro, necesito cotizar 100 piezas de rociadores tyco modelo TY658, me encuentro en la ciudad todo santos',
      ),
    )

    expect(almacen.leads[0]).toMatchObject({
      nombre: 'Pedro',
      cantidad: 100,
      solicitudProductoTexto: expect.stringContaining('rociadores tyco modelo TY658'),
      correo: null,
      pasoActual: 'correo',
    })
    expect(almacen.leads[0]?.productosCatalogo).toEqual([])
    expect(proveedor.envios[0]?.cuerpo).toBe(textoGuion('pedir_correo'))
  })
})

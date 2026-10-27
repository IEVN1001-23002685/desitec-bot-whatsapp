import { describe, expect, it, beforeEach, vi } from 'vitest'
import { construirContextoInteraccion, MAXIMO_HISTORIAL_IA } from '../src/modules/ia/infrastructure/contextos/constructor-contexto.js'
import type { EntradaGeneracionRespuestaIA } from '../src/modules/ia/domain/ports/generador-respuesta-ia.js'

describe('construirContextoInteraccion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('limita historial a MAXIMO_HISTORIAL_IA (50) y mínimo 1', () => {
    const entrada: EntradaGeneracionRespuestaIA = {
      textoCliente: 'Hola',
      historial: [],
      lead: {
        nombre: null,
        correo: null,
        modelos: null,
        cantidad: null,
        ciudad: null,
        pasoActual: 'nombre',
        esPrimerMensaje: true,
        datosFaltantes: [],
      },
      nombreCuentaComercial: 'linea-comercial',
    }

    // Enviar 60 mensajes de historial (más del máximo)
    const historialLargo = Array.from({ length: 60 }, (_, i) => ({
      rol: 'cliente',
      texto: `Mensaje ${i}`,
    }))

    const resultado = construirContextoInteraccion(
      { ...entrada, historial: historialLargo } as any,
      100,
    )

    // Debe estar limitado a 10 (limiteHistorial) pero también al máximo global 50
    expect(resultado.pasos.length).toBeLessThanOrEqual(MAXIMO_HISTORIAL_IA + 1)
    expect(resultado.pasos.length).toBeLessThanOrEqual(100) // limiteHistorial pasado
  })

  it('excluye mensajes de historial vacíos o sin texto', () => {
    const entrada: EntradaGeneracionRespuestaIA = {
      textoCliente: 'Hola',
      historial: [
        { rol: 'cliente', texto: '' },
        { rol: 'cliente', texto: '   ' },
        { rol: 'cliente', texto: 'Hola' },
      ] as any,
      lead: {
        nombre: null,
        correo: null,
        modelos: null,
        cantidad: null,
        ciudad: null,
        pasoActual: 'nombre',
        esPrimerMensaje: true,
        datosFaltantes: [],
      },
      nombreCuentaComercial: 'linea-comercial',
    }

    const resultado = construirContextoInteraccion(entrada, 10)
    // Solo debería tener 1 paso (el "Hola" válido) + el mensaje actual
    const textos = resultado.pasos.map((p) => p.texto)
    expect(textos).toContain('Hola')
    expect(textos.filter((t) => t === '')).toHaveLength(0)
  })

  it('aisla contexto por conversación: dos entradas distintas tienen contextos diferentes', () => {
    const entrada1: EntradaGeneracionRespuestaIA = {
      textoCliente: 'Mensaje A',
      historial: [] as any,
      lead: {
        nombre: 'Ana',
        correo: 'ana@test.com',
        modelos: null,
        cantidad: null,
        ciudad: null,
        pasoActual: 'nombre',
        esPrimerMensaje: true,
        datosFaltantes: [],
      },
      nombreCuentaComercial: 'linea-comercial',
    }

    const entrada2: EntradaGeneracionRespuestaIA = {
      textoCliente: 'Mensaje B',
      historial: [] as any,
      lead: {
        nombre: 'Carlos',
        correo: 'carlos@test.com',
        modelos: null,
        cantidad: null,
        ciudad: null,
        pasoActual: 'nombre',
        esPrimerMensaje: true,
        datosFaltantes: [],
      },
      nombreCuentaComercial: 'linea-soporte',
    }

    const ctx1 = construirContextoInteraccion(entrada1, 10)
    const ctx2 = construirContextoInteraccion(entrada2, 10)

    // Las instrucciones deben ser diferentes (distintas cuentas, distintos datos)
    expect(ctx1.instrucciones).not.toBe(ctx2.instrucciones)
    // Los pasos deben reflejar distintos nombres
    expect(ctx1.pasos[0]!.texto).not.toBe(ctx2.pasos[0]!.texto)
  })

  it('pasos roles correctos: cliente, asesor (con prefix), bot', () => {
    const entrada: EntradaGeneracionRespuestaIA = {
      textoCliente: 'Hola',
      historial: [
        { rol: 'cliente', texto: 'Cliente dice hola' },
        { rol: 'asesor', texto: 'Asesor responde' },
        { rol: 'bot', texto: 'Respuesta del bot' },
      ] as any,
      lead: {
        nombre: null,
        correo: null,
        modelos: null,
        cantidad: null,
        ciudad: null,
        pasoActual: 'nombre',
        esPrimerMensaje: true,
        datosFaltantes: [],
      },
      nombreCuentaComercial: 'linea-comercial',
    }

    const resultado = construirContextoInteraccion(entrada, 10)

    // El primer historial entry es cliente → 'mensaje_cliente'
    expect(resultado.pasos[0]!.tipo).toBe('mensaje_cliente')
    // El segundo es asesor → '(Asesor humano) Asesor responde'
    expect(resultado.pasos[1]!.tipo).toBe('mensaje_negocio')
    expect(resultado.pasos[1]!.texto).toBe('(Asesor humano) Asesor responde')
    // El tercero es bot → 'Respuesta del bot' (sin prefix, ya que rol !== 'asesor' en la condición)
    expect(resultado.pasos[2]!.tipo).toBe('mensaje_negocio')
    expect(resultado.pasos[2]!.texto).toBe('Respuesta del bot')
  })

  it('instrucciones incluyen bloque estado con datos lead y cuenta', () => {
    const entrada: EntradaGeneracionRespuestaIA = {
      textoCliente: 'Quiero cotizar',
      historial: [] as any,
      lead: {
        nombre: 'Pedro',
        correo: 'pedro@test.com',
        modelos: 'traje de bombero',
        cantidad: 2,
        ciudad: 'Guadalajara',
        pasoActual: 'cotizando',
        esPrimerMensaje: false,
        datosFaltantes: [],
      },
      nombreCuentaComercial: 'linea-comercial',
    }

    const resultado = construirContextoInteraccion(entrada, 10)

    // Las instrucciones deben mencionar la cuenta y los datos capturados
    expect(resultado.instrucciones).toContain('linea-comercial')
    expect(resultado.instrucciones).toContain('Pedro')
    expect(resultado.instrucciones).toContain('traje de bombero')
    expect(resultado.instrucciones).toContain('2')
    expect(resultado.instrucciones).toContain('Guadalajara')
    expect(resultado.instrucciones).toContain('cotizando')
  })

  it('ventana de historial: slicing correcto con límite menor al máximo global', () => {
    const entrada: EntradaGeneracionRespuestaIA = {
      textoCliente: 'Nuevo mensaje',
      historial: [] as any,
      lead: {
        nombre: null,
        correo: null,
        modelos: null,
        cantidad: null,
        ciudad: null,
        pasoActual: 'nombre',
        esPrimerMensaje: true,
        datosFaltantes: [],
      },
      nombreCuentaComercial: 'linea-comercial',
    }

    // Historial de 5 mensajes
    const historial5 = Array.from({ length: 5 }, (_, i) => ({
      rol: 'cliente',
      texto: `Msg ${i + 1}`,
    }))

    const resultado = construirContextoInteraccion({ ...entrada, historial: historial5 } as any, 3)

    // Debe tomar solo los últimos 3 del historial + el mensaje actual
    expect(resultado.pasos.length).toBe(4) // 3 del historial + 1 mensaje actual
  })

  it('mensaje actual incluido si tiene texto', () => {
    const entrada: EntradaGeneracionRespuestaIA = {
      textoCliente: 'Mensaje actual',
      historial: [] as any,
      lead: {
        nombre: null,
        correo: null,
        modelos: null,
        cantidad: null,
        ciudad: null,
        pasoActual: 'nombre',
        esPrimerMensaje: true,
        datosFaltantes: [],
      },
      nombreCuentaComercial: 'linea-comercial',
    }

    const resultado = construirContextoInteraccion(entrada, 10)
    // Debería tener el mensaje actual + historial vacío = 1 paso
    expect(resultado.pasos.length).toBe(1)
    expect(resultado.pasos[0]!.texto).toBe('Mensaje actual')
  })
})
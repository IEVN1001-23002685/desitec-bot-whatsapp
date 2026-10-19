import { describe, expect, it } from 'vitest'
import {
  clavePedirPaso,
  evaluarPaso,
} from '../src/modules/autorespuestas/domain/services/maquina-flujo-lead.js'

describe('evaluarPaso', () => {
  it('acepta un nombre no vacio y avanza a correo', () => {
    expect(evaluarPaso('nombre', '  Ana  ')).toEqual({
      valido: true,
      campo: { campo: 'nombre', valor: 'Ana' },
      siguiente: 'correo',
    })
  })

  it('rechaza un nombre vacio y lo vuelve a pedir', () => {
    expect(evaluarPaso('nombre', '   ')).toEqual({
      valido: false,
      claveRespuesta: 'pedir_nombre',
    })
  })

  it('acepta y normaliza el correo', () => {
    expect(evaluarPaso('correo', '  Ana.Perez@Example.COM ')).toEqual({
      valido: true,
      campo: { campo: 'correo', valor: 'ana.perez@example.com' },
      siguiente: 'modelos',
    })
  })

  it('rechaza un correo invalido', () => {
    expect(evaluarPaso('correo', 'ana-arroba-example.com')).toEqual({
      valido: false,
      claveRespuesta: 'correo_invalido',
    })
  })

  it('acepta modelos y avanza a cantidad', () => {
    expect(evaluarPaso('modelos', ' Modelo X ')).toEqual({
      valido: true,
      campo: { campo: 'modelos', valor: 'Modelo X' },
      siguiente: 'cantidad',
    })
  })

  it('acepta una cantidad entera positiva', () => {
    expect(evaluarPaso('cantidad', ' 3 ')).toEqual({
      valido: true,
      campo: { campo: 'cantidad', valor: 3 },
      siguiente: 'ciudad',
    })
  })

  it.each(['0', '-2', '2.5', 'muchas'])('rechaza la cantidad %s', (texto) => {
    expect(evaluarPaso('cantidad', texto)).toEqual({
      valido: false,
      claveRespuesta: 'cantidad_invalida',
    })
  })

  it('acepta ciudad y completa el flujo', () => {
    expect(evaluarPaso('ciudad', 'Puebla')).toEqual({
      valido: true,
      campo: { campo: 'ciudad', valor: 'Puebla' },
      siguiente: null,
    })
  })

  it('construye la clave de pedir paso', () => {
    expect(clavePedirPaso('correo')).toBe('pedir_correo')
  })
})

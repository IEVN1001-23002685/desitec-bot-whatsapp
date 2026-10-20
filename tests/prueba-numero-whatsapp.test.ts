import { describe, expect, it } from 'vitest'
import {
  coincideNumeroWhatsApp,
  normalizarNumeroWhatsApp,
} from '../src/shared/security/validadores.js'

describe('normalizarNumeroWhatsApp', () => {
  it('deja intacto un numero nacional de 10 digitos', () => {
    expect(normalizarNumeroWhatsApp('4772905770')).toBe('4772905770')
  })

  it('quita lada de pais y prefijo movil de Mexico', () => {
    expect(normalizarNumeroWhatsApp('+52 477 290 5770')).toBe('4772905770')
    expect(normalizarNumeroWhatsApp('524772905770')).toBe('4772905770')
    expect(normalizarNumeroWhatsApp('5214772905770')).toBe('4772905770')
  })

  it('conserva numeros que no son de Mexico sin recortar', () => {
    expect(normalizarNumeroWhatsApp('15551234567')).toBe('15551234567')
  })
})

describe('coincideNumeroWhatsApp', () => {
  it('compara numeros con y sin formato internacional', () => {
    expect(coincideNumeroWhatsApp('4772905770', '5214772905770')).toBe(true)
    expect(coincideNumeroWhatsApp('+52 477 290 5770', '4772905770')).toBe(true)
    expect(coincideNumeroWhatsApp('4772905770', '4772905771')).toBe(false)
  })
})

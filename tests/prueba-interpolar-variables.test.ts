import { describe, expect, it } from 'vitest'
import { interpolarVariables } from '../src/shared/texto/interpolar-variables.js'

describe('interpolarVariables', () => {
  it('reemplaza las variables conocidas', () => {
    const resultado = interpolarVariables('Hola {{nombre}}, bienvenido a {{cuenta}}', {
      nombre: 'Ana',
      cuenta: 'Desitec',
    })

    expect(resultado).toBe('Hola Ana, bienvenido a Desitec')
  })

  it('deja intactos los placeholders desconocidos', () => {
    const resultado = interpolarVariables('Hola {{nombre}} {{otro}}', { nombre: 'Ana' })

    expect(resultado).toBe('Hola Ana {{otro}}')
  })

  it('admite espacios internos y reemplaza repeticiones', () => {
    const resultado = interpolarVariables('{{ nombre }} y {{nombre}}', { nombre: 'Ana' })

    expect(resultado).toBe('Ana y Ana')
  })

  it('no modifica textos sin placeholders', () => {
    expect(interpolarVariables('sin variables', {})).toBe('sin variables')
  })
})

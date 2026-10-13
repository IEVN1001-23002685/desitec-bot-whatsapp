import { createHmac, timingSafeEqual } from 'node:crypto'

const PREFIJO_FIRMA = 'sha256='

export function calcularFirma(cuerpoCrudo: Buffer, secretoApp: string): string {
  return createHmac('sha256', secretoApp).update(cuerpoCrudo).digest('hex')
}

export function verificarFirma(
  cuerpoCrudo: Buffer,
  valorCabecera: string | undefined,
  secretoApp: string,
): boolean {
  if (!valorCabecera || !valorCabecera.startsWith(PREFIJO_FIRMA)) {
    return false
  }

  const proporcionada = valorCabecera.slice(PREFIJO_FIRMA.length)
  const esperada = calcularFirma(cuerpoCrudo, secretoApp)

  const bufferProporcionado = Buffer.from(proporcionada, 'hex')
  const bufferEsperado = Buffer.from(esperada, 'hex')

  if (bufferProporcionado.length !== bufferEsperado.length || bufferProporcionado.length === 0) {
    return false
  }

  return timingSafeEqual(bufferProporcionado, bufferEsperado)
}

export function comparacionSegura(a: string, b: string): boolean {
  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)
  if (bufferA.length !== bufferB.length) {
    return false
  }
  return timingSafeEqual(bufferA, bufferB)
}
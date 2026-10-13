const PATRON_ID_META = /^[A-Za-z0-9._-]{1,64}$/
const PATRON_ID_WA = /^\d{5,20}$/

export function esIdMetaValido(valor: unknown): valor is string {
  return typeof valor === 'string' && PATRON_ID_META.test(valor)
}

export function esIdWaValido(valor: unknown): valor is string {
  return typeof valor === 'string' && PATRON_ID_WA.test(valor)
}
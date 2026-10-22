const PATRON_ID_META = /^[A-Za-z0-9._-]{1,64}$/
const PATRON_ID_WA = /^\d{5,20}$/

export function esIdMetaValido(valor: unknown): valor is string {
  return typeof valor === 'string' && PATRON_ID_META.test(valor)
}

export function esIdWaValido(valor: unknown): valor is string {
  return typeof valor === 'string' && PATRON_ID_WA.test(valor)
}

export function normalizarNumeroWhatsApp(valor: string): string {
  const digitos = valor.replace(/\D/g, '')
  if (digitos.length === 13 && digitos.startsWith('521')) {
    return digitos.slice(3)
  }
  if (digitos.length === 12 && digitos.startsWith('52')) {
    return digitos.slice(2)
  }
  return digitos
}

export function coincideNumeroWhatsApp(a: string, b: string): boolean {
  return normalizarNumeroWhatsApp(a) === normalizarNumeroWhatsApp(b)
}

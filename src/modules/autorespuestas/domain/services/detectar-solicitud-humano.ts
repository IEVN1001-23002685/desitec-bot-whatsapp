const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ROLES = [
  'personas?',
  'asesor(?:a|es|as)?',
  'agentes?',
  'ejecutiv(?:o|a|os|as)',
  'human(?:o|a)',
  'representantes?',
  'vendedor(?:a|es|as)?',
  'operador(?:a|es|as)?',
  'recepcionistas?',
  'gerentes?',
  'supervisor(?:a|es|as)?',
  'encargad(?:o|a|os|as)',
]

const ROL = `(?:${ROLES.join('|')})`
const ROL_O_ALGUIEN = `(?:alguien|${ROL})`
const VERBOS = 'quiero|necesito|busco|solicito|prefiero|deseo|requiero|ocupo|quisiera'

const PATRONES_INTENCION = [
  new RegExp(
    `\\b(?:${VERBOS})\\s+(?:hablar|comunicarme|contactar)\\s+(?:con\\s+)?(?:un|una|el|la)?\\s*${ROL_O_ALGUIEN}\\b`,
  ),
  new RegExp(`\\b(?:${VERBOS})\\s+(?:un|una)\\s+${ROL}\\b`),
  new RegExp(
    `\\b(?:${VERBOS})\\s+que\\s+me\\s+(?:atienda|atiendan|llame|llamen)\\s+(?:un|una|el|la)?\\s*${ROL}\\b`,
  ),
  new RegExp(
    `\\b(?:pasame|pasenme|comunicame|comuniquenme|contactame|contactenme|atiendeme|atiendanme|atiende|atiendan|atienda)\\b.{0,20}?\\b${ROL_O_ALGUIEN}\\b`,
  ),
  new RegExp(
    `\\b(?:me\\s+pasas?|me\\s+puede(?:n)?\\s+(?:pasar|comunicar|atender|llamar))\\b.{0,20}?\\b${ROL_O_ALGUIEN}\\b`,
  ),
  new RegExp(
    `\\b(?:hablar|comunicarme|contactar)\\s+con\\s+(?:un|una|el|la)?\\s*${ROL_O_ALGUIEN}\\b`,
  ),
  new RegExp(
    `\\b(?:que\\s+me\\s+(?:atienda|atiendan|llame|llamen)|me\\s+gustaria\\s+que\\s+me\\s+(?:atienda|atiendan|llame|llamen))\\b.{0,30}?\\b${ROL_O_ALGUIEN}\\b`,
  ),
]

const PATRONES_FRASE = [
  /\b(?:atencion|soporte)\s+human[oa]\b/,
  /\bser\s+humano\b/,
  /\b(?:atencion|servicio)\s+al\s+cliente\b/,
  /\bpersona\s+real\b/,
  /\balguien\s+real\b/,
  /\bhablar\s+con\s+alguien\b/,
  /\bcomunicarme\s+con\s+alguien\b/,
  /\b(?:que\s+me\s+(?:atienda|atiendan|llame|llamen)|me\s+puede(?:n)?\s+(?:atender|llamar)|llamada\s+telefonica)\b/,
]

const PATRONES_EXCLUIDOS = [/\bpersonas?\s+(?:moral|morales|fisica|fisicas)\b/]

const PATRON_MENSAJE_CORTO = new RegExp(`^(?:un|una|el|la)?\\s*${ROL}$`)

export function esSolicitudDeHumano(texto: string): boolean {
  const original = texto.trim()
  if (original.length === 0 || PATRON_CORREO.test(original)) {
    return false
  }

  const normalizado = normalizar(original)
  if (PATRONES_EXCLUIDOS.some((patron) => patron.test(normalizado))) {
    return false
  }

  const sinPuntuacion = normalizado
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (PATRON_MENSAJE_CORTO.test(sinPuntuacion)) {
    return true
  }

  return (
    PATRONES_INTENCION.some((patron) => patron.test(normalizado)) ||
    PATRONES_FRASE.some((patron) => patron.test(normalizado))
  )
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

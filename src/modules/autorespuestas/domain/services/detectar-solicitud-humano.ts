import { normalizarParaDeteccion, ocultarCorreos, quitarPuntuacion } from './normalizar-texto.js'

const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const ROLES = [
  'personas?',
  'asesor(?:a|es|as)?',
  'agentes?',
  'ejecutiv(?:o|a|os|as)',
  'human(?:o|a|os|as)',
  'representantes?',
  'vendedor(?:a|es|as)?',
  'operador(?:a|es|as)?',
  'recepcionistas?',
  'gerentes?',
  'supervisor(?:a|es|as)?',
  'encargad(?:o|a|os|as)',
  'especialistas?',
]

const ROL = `(?:${ROLES.join('|')})`
const ROL_O_ALGUIEN = `(?:alguien|${ROL})`
const VERBOS =
  'quiero|necesito|busco|solicito|prefiero|deseo|requiero|ocupo|quisiera|queria|necesitaria|me gustaria|me interesa|me interesan|podria|recibir|tener|contar'

const PATRONES_INTENCION = [
  new RegExp(
    `\\b(?:${VERBOS})\\s+(?:hablar|comunicarme|contactar)\\s+(?:con\\s+)?(?:un|una|el|la)?\\s*${ROL_O_ALGUIEN}\\b`,
  ),
  new RegExp(`\\b(?:${VERBOS})\\s+(?:un|una)\\s+${ROL}\\b`),
  new RegExp(`\\b(?:${VERBOS})\\s+(?:una?\\s+)?(?:persona|alguien|${ROL})\\b`),
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
  new RegExp(`\\b(?:quiero|necesito|solicito)\\s+(?:el|la)\\s+${ROL}\\b`),
]

const PATRONES_FRASE = [
  /\b(?:atencion|soporte)\s+human[oa]\b/,
  /\b(?:atencion|soporte|servicio)\s+personalizad[oa]\b/,
  /\b(?:atencion|servicio)\s+al\s+cliente\b/,
  /\bser\s+humano\b/,
  /\bpersona\s+real\b/,
  /\balguien\s+real\b/,
  /\bhablar\s+con\s+alguien\b/,
  /\bcomunicarme\s+con\s+alguien\b/,
  /\b(?:que\s+me\s+(?:atienda|atiendan|llame|llamen)|me\s+puede(?:n)?\s+(?:atender|llamar)|llamada\s+telefonica)\b/,
  /\b(?:agente|asesor|vendedor)\s+(?:de\s+)?(?:ventas|comercial)\b/,
  /\b(?:asesoria|apoyo|ayuda|atencion|contacto)\s+(?:de|con)\s+(?:un|una|el|la)?\s*(?:especialista|asesor|persona|humano|experto)\b/,
  /\b(?:elegir|seleccionar)\s+la\s+solucion\s+adecuada\b/,
]

const PATRONES_EXCLUIDOS = [
  /\bpersonas?\s+(?:moral|morales|fisica|fisicas)\b/,
  /\brecursos\s+humanos\b/,
  /\b(?:modelo|producto|sistema|equipo|software|plan|licencia|servicio)\s+(?:de\s+)?(?:agente|asesor|ejecutivo|humano|especialista)\b/,
  /\b(?:agencia|agencias)\b/,
]

const PATRON_MENSAJE_CORTO = new RegExp(`^(?:un|una|el|la)?\\s*${ROL}$`)

export function esSolicitudDeHumano(texto: string): boolean {
  const original = texto.trim()
  if (original.length === 0 || PATRON_CORREO.test(original)) {
    return false
  }

  const normalizado = normalizarParaDeteccion(ocultarCorreos(original))
  if (PATRONES_EXCLUIDOS.some((patron) => patron.test(normalizado))) {
    return false
  }

  const sinPuntuacion = quitarPuntuacion(normalizado)
  if (PATRON_MENSAJE_CORTO.test(sinPuntuacion)) {
    return true
  }

  const sinNegaciones = quitarSolicitudesNegadas(normalizado)

  return (
    PATRONES_INTENCION.some((patron) => patron.test(sinNegaciones)) ||
    PATRONES_FRASE.some((patron) => patron.test(sinNegaciones))
  )
}

function quitarSolicitudesNegadas(texto: string): string {
  return texto
    .replace(
      /\b(?:no|sin)\s+(?:quiero|necesito|busco|solicito|prefiero|deseo|requiero|ocupo|quisiera|me\s+gustaria|me\s+interesa)\b[^.,;!?]*/g,
      ' ',
    )
    .replace(/\b(?:no|sin)\s+(?:hablar|comunicarme|contactar)\s+con\b[^.,;!?]*/g, ' ')
    .replace(
      /\b(?:no|sin)\s+(?:un|una|el|la)?\s*(?:asesor|persona|agente|humano|ejecutivo|alguien)\b[^.,;!?]*/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

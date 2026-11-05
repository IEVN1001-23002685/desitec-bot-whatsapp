import type { ActualizacionLead } from '../ports/repositorio-lead.js'
import type { ContextoMensajeLead } from '../types/contexto-mensaje-lead.js'
import type { PasoLead } from '../types/paso-lead.js'
import { aplicarInterpretacion } from './aplicar-interpretacion.js'
import {
  extraerProductosMensaje,
  extraerUbicacionMensaje,
  formatearCandidatosProductos,
  formatearProductos,
} from './extraer-datos-lead.js'

import { interpretarCantidad } from './interpretar-cantidad.js'
import {
  claveErrorCantidad,
  interpretarMensaje,
  type SugerenciasInterpretacion,
} from './interpretar-mensaje.js'
import { validarCorreo, validarNombre } from './validar-datos.js'

export type CampoLead =
  | { campo: 'nombre'; valor: string }
  | { campo: 'correo'; valor: string }
  | { campo: 'modelos'; valor: string }
  | { campo: 'cantidad'; valor: number }
  | { campo: 'ciudad'; valor: string }

export type EvaluacionPaso =
  | { valido: true; campo: CampoLead; siguiente: PasoLead | null }
  | { valido: true; campo: null; rechazado: true; siguiente: PasoLead | null }
  | {
      valido: false
      claveRespuesta: string
      variables?: Record<string, string>
    }

export type ResultadoFlujoLead = {
  cambios: ActualizacionLead
  claveRespuesta: string
  variables: Record<string, string>
}

export function procesarMensajeLead(
  contexto: ContextoMensajeLead,
  sugerencias: SugerenciasInterpretacion = {},
): ResultadoFlujoLead {
  const interpretacion = interpretarMensaje(contexto, sugerencias)
  return aplicarInterpretacion(contexto, interpretacion)
}

export function evaluarPaso(paso: PasoLead, texto: string): EvaluacionPaso {
  switch (paso) {
    case 'nombre': {
      const resultado = validarNombre(texto, {
        aceptarTextoSimple: true,
        permitirRechazo: true,
      })
      if (!resultado.valido) {
        return { valido: false, claveRespuesta: 'nombre_invalido' }
      }

      if (resultado.rechazado) {
        return { valido: true, campo: null, rechazado: true, siguiente: 'correo' }
      }
      return {
        valido: true,
        campo: { campo: 'nombre', valor: resultado.nombre },
        siguiente: 'correo',
      }
    }
    case 'correo': {
      const resultado = validarCorreo(texto)
      if (resultado.valido) {
        return {
          valido: true,
          campo: { campo: 'correo', valor: resultado.correo },
          siguiente: 'modelos',
        }
      }
      return {
        valido: false,
        claveRespuesta: resultado.motivo === 'multiple' ? 'correo_ambiguo' : 'correo_invalido',
      }
    }
    case 'modelos': {
      const resultado = extraerProductosMensaje(texto, {
        pasoActual: 'modelos',
        esPrimerMensaje: false,
        nombre: null,
        correo: null,
        ubicacion: null,
      })
      if (resultado.tipo === 'confirmado') {
        return {
          valido: true,
          campo: {
            campo: 'modelos',
            valor:
              formatearProductos(
                resultado.productos,
                resultado.productos.every((producto) => producto.cantidad !== null),
              ) ?? texto.trim(),
          },
          siguiente: 'cantidad',
        }
      }
      if (resultado.tipo === 'suficiente') {
        return {
          valido: true,
          campo: { campo: 'modelos', valor: resultado.solicitud },
          siguiente: 'cantidad',
        }
      }
      if (resultado.tipo === 'categoria') {
        return {
          valido: false,
          claveRespuesta: 'producto_categoria',
          variables: { categoria: resultado.categoria },
        }
      }
      if (resultado.tipo === 'ambiguo') {
        return {
          valido: false,
          claveRespuesta: 'producto_ambiguo',
          variables: {
            candidatos: formatearCandidatosProductos(resultado.candidatos),
          },
        }
      }
      return {
        valido: false,
        claveRespuesta: 'producto_invalido',
      }
    }
    case 'cantidad': {
      const cantidad = interpretarCantidad(texto)
      return cantidad.tipo === 'valida'
        ? {
            valido: true,
            campo: { campo: 'cantidad', valor: cantidad.valor },
            siguiente: 'ciudad',
          }
        : { valido: false, claveRespuesta: claveErrorCantidad(cantidad) }
    }
    case 'ciudad': {
      const resultado = extraerUbicacionMensaje(texto, { aceptarTextoSimple: true })
      switch (resultado.tipo) {
        case 'mexicana':
          return {
            valido: true,
            campo: { campo: 'ciudad', valor: resultado.ubicacion.nombreMostrado },
            siguiente: null,
          }
        case 'extranjera':
          return { valido: false, claveRespuesta: 'fuera_de_cobertura' }
        case 'incompleta':
          return {
            valido: false,
            claveRespuesta: 'ubicacion_incompleta',
            variables: { ciudad: resultado.ubicacion.nombreMostrado },
          }
        case 'ambigua':
          return {
            valido: false,
            claveRespuesta: 'ubicacion_ambigua',
            variables: {
              candidatos: resultado.candidatos
                .map((candidato) => candidato.nombreMostrado)
                .join('; '),
            },
          }
        case 'ninguna':
          return { valido: false, claveRespuesta: 'ubicacion_invalida' }
      }
    }
  }
}

export function clavePedirPaso(paso: PasoLead): string {
  return `pedir_${paso}`
}

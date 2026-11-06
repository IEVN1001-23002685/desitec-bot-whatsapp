import type {
  EntradaInterpretacionIA,
  InterpreteConversacionalIA,
  SalidaInterpretacionIA,
} from '../../src/modules/autorespuestas/application/ports/interprete-conversacional-ia.js'
import type {
  ClienteGenAI,
  InteraccionGemini,
  ParametrosInteraccionGemini,
} from '../../src/modules/autorespuestas/infrastructure/ia/cliente-genai.js'

export function salidaIA(overrides: Partial<SalidaInterpretacionIA> = {}): SalidaInterpretacionIA {
  return {
    sugerencias: {},
    requiereAclaracion: false,
    intencion: null,
    referencias: [],
    ...overrides,
  }
}

export class InterpreteIAFalso implements InterpreteConversacionalIA {
  readonly entradas: EntradaInterpretacionIA[] = []

  constructor(private readonly respuesta: SalidaInterpretacionIA | Error) {}

  async interpretar(entrada: EntradaInterpretacionIA): Promise<SalidaInterpretacionIA> {
    this.entradas.push(entrada)
    if (this.respuesta instanceof Error) {
      throw this.respuesta
    }
    return this.respuesta
  }
}

export class ClienteGenAIFalso implements ClienteGenAI {
  readonly llamadas: ParametrosInteraccionGemini[] = []
  private indice = 0

  constructor(
    private readonly respuestas: readonly (
      | InteraccionGemini
      | Error
      | Promise<InteraccionGemini>
    )[],
  ) {}

  async crearInteraccion(parametros: ParametrosInteraccionGemini): Promise<InteraccionGemini> {
    this.llamadas.push(parametros)
    const respuesta = this.respuestas[this.indice]
    this.indice += 1
    if (respuesta === undefined) {
      throw new Error('el cliente falso no tiene más respuestas configuradas')
    }
    if (respuesta instanceof Error) {
      throw respuesta
    }
    return respuesta
  }
}

export function interaccionCompletada(outputText: string): InteraccionGemini {
  return {
    status: 'completed',
    outputText,
    tokensEntrada: 100,
    tokensSalida: 50,
  }
}

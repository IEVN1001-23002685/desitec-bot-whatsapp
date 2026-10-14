export type EntradaProgramarSeguimientos = {
  idConversacion: string
}

export type ResultadoProgramarSeguimientos = {
  programados: number
}

export interface ProgramarSeguimientos {
  ejecutar(entrada: EntradaProgramarSeguimientos): Promise<ResultadoProgramarSeguimientos>
}

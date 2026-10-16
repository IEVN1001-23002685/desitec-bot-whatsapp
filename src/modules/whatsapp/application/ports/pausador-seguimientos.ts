export interface PausadorSeguimientos {
  pausarPorRespuesta(idConversacion: string): Promise<number>
}

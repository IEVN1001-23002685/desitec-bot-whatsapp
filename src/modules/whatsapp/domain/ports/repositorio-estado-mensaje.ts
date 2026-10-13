export interface RepositorioEstadoMensaje {
  actualizarEstado(idMensajeMeta: string, estado: string): Promise<boolean>
}

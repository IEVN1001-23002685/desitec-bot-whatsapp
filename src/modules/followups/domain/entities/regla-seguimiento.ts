export type ReglaSeguimiento = {
  id: string
  codigo: string
  nombre: string
  idCuentaWhatsApp: string
  demoraHoras: number
  idPlantilla: string | null
  cuerpo: string | null
  activa: boolean
}

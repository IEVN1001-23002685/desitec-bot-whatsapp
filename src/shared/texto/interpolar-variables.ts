export type VariablesTexto = Record<string, string>

const PATRON_VARIABLE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

export function interpolarVariables(texto: string, variables: VariablesTexto): string {
  return texto.replace(PATRON_VARIABLE, (coincidencia: string, clave: string) => {
    const valor = variables[clave]
    return valor === undefined ? coincidencia : valor
  })
}

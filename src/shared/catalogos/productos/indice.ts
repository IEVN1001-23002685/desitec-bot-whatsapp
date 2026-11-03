import { contieneFrase, normalizarCatalogo, normalizarModelo, tokensCatalogo } from '../texto.js'
import type {
  CatalogoProductos,
  CoincidenciaProducto,
  MotivoCoincidencia,
  ProductoCatalogo,
  ResultadoBusquedaProductos,
} from './tipos.js'

const PALABRAS_VACIAS = new Set([
  'a',
  'al',
  'algo',
  'algun',
  'alguna',
  'algunas',
  'algunos',
  'asesor',
  'asesora',
  'asesoria',
  'ayuda',
  'buenas',
  'bueno',
  'busco',
  'cantidad',
  'claro',
  'como',
  'comprar',
  'con',
  'correo',
  'cotizar',
  'cotizacion',
  'cuando',
  'cuanto',
  'de',
  'del',
  'deseo',
  'donde',
  'el',
  'en',
  'entonces',
  'esa',
  'ese',
  'eso',
  'esta',
  'este',
  'favor',
  'gracias',
  'hola',
  'informacion',
  'la',
  'las',
  'listo',
  'los',
  'me',
  'mi',
  'muchas',
  'muchos',
  'necesito',
  'no',
  'nombre',
  'o',
  'ocupo',
  'ok',
  'okay',
  'para',
  'pero',
  'pieza',
  'piezas',
  'por',
  'precio',
  'producto',
  'productos',
  'quiero',
  'requiero',
  'si',
  'sin',
  'solicito',
  'soy',
  'su',
  'sus',
  'un',
  'una',
  'unas',
  'uno',
  'unos',
  'varias',
  'varios',
  'y',
])

const RAICES_PRODUCTO = [
  'abanico',
  'accesorio',
  'adaptador',
  'alarma',
  'alambre',
  'antena',
  'anunciador',
  'arnes',
  'arrancador',
  'audifono',
  'bateria',
  'bomba',
  'botas',
  'cable',
  'cadena',
  'caldera',
  'camara',
  'camaras',
  'camilla',
  'casco',
  'cerradura',
  'chaleco',
  'compresor',
  'conector',
  'conexion',
  'control',
  'controlador',
  'cuerda',
  'detector',
  'dispensador',
  'dispositivo',
  'dvr',
  'equipo',
  'escalera',
  'estacion',
  'extintor',
  'fibra',
  'filtro',
  'flujometro',
  'fuente',
  'gabinete',
  'gabinetes',
  'guante',
  'guantes',
  'herramienta',
  'hidrante',
  'iluminacion',
  'impresora',
  'intercambiador',
  'inversor',
  'jack',
  'kit',
  'lampara',
  'laptop',
  'licencia',
  'manguera',
  'manometro',
  'mascara',
  'medidor',
  'monitor',
  'motor',
  'mueble',
  'nvr',
  'panel',
  'pantalla',
  'patch',
  'poste',
  'proyector',
  'radio',
  'rack',
  'refaccion',
  'reflector',
  'remolque',
  'repetidor',
  'repuesto',
  'respirador',
  'rociador',
  'router',
  'sensor',
  'servidor',
  'sierra',
  'silla',
  'sirena',
  'sistema',
  'sprinkler',
  'switch',
  'tablero',
  'taladro',
  'tanque',
  'traje',
  'transformador',
  'tuberia',
  'ups',
  'valvula',
  'ventilador',
  'videoportero',
]

const MARCAS_PRODUCTO = [
  '3m',
  'amerex',
  'ansul',
  'apc',
  'belden',
  'bosch',
  'croydon',
  'dahua',
  'edwards',
  'estrobo',
  'fike',
  'gamewell',
  'hikvision',
  'hochiki',
  'honeywell',
  'kidde',
  'linkedpro',
  'north',
  'notifier',
  'panduit',
  'planet',
  'potter',
  'sick',
  'siemon',
  'simplex',
  'skold',
  'tyco',
  'victaulic',
  'viking',
]

const MARCAS_PRODUCTO_SET = new Set(MARCAS_PRODUCTO)

const PALABRAS_ACCESORIO = new Set([
  'accesorio',
  'adaptador',
  'base',
  'cable',
  'conector',
  'kit',
  'modulo',
  'parcheo',
  'patch',
  'refaccion',
  'repuesto',
  'tarjeta',
])

const TIPOS_AMPLIOS = new Set(['dispositivo', 'equipo', 'producto', 'sistema'])

const TOKENS_CONOCIDOS = new Set([...RAICES_PRODUCTO, ...MARCAS_PRODUCTO, ...PALABRAS_ACCESORIO])

const PATRON_ACCESORIO_SECUNDARIO =
  /\b(?:para|de)\s+(?:paneles?|detectores?|estaciones?|modulos?|gabinetes?)\b/u

const PATRON_CORREO = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/giu
const PATRON_URL = /\bhttps?:\/\/\S+/giu
const PATRON_MODELO_COMPUESTO = /[A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)+/gu
const PATRON_MODELO_SIMPLE = /\b[A-Za-z0-9]*\d[A-Za-z0-9]*\b/gu
const PATRON_MODELO_SEPARADO = /\b([A-Za-z]{2,12})\s+(\d{1,6}[A-Za-z]?)\b/gu

const PALABRAS_NO_MODELO = new Set([
  ...PALABRAS_VACIAS,
  'agrega',
  'agregar',
  'anade',
  'anadir',
  'busco',
  'cambia',
  'cambiar',
  'cantidad',
  'comprar',
  'correo',
  'cotiza',
  'cotizar',
  'cotizacion',
  'deseo',
  'detector',
  'detectores',
  'direccion',
  'entrega',
  'enviar',
  'envio',
  'equipo',
  'equipos',
  'es',
  'estacion',
  'estaciones',
  'gabinete',
  'gabinetes',
  'manual',
  'manuales',
  'modelo',
  'modelos',
  'necesito',
  'nombre',
  'ocupo',
  'pieza',
  'piezas',
  'producto',
  'productos',
  'quiero',
  'requiero',
  'sera',
  'seran',
  'serian',
  'solicito',
  'son',
  'tengo',
  'total',
  'unidad',
  'unidades',
  'varias',
  'varios',
])
const PATRON_FRASES_RELLENO =
  /\b(?:hola|buenas|buenos dias|buenas tardes|buenas noches|me interesa|me interesan|necesito|quiero|busco|cotizar|solicito|requiero|ocupo|deseo|por favor|gracias|precio|costo|stock|disponibilidad|informacion)\b/giu

type ProductoIndexado = {
  producto: ProductoCatalogo
  nombreNormalizado: string
  tokens: readonly string[]
  pesoTotal: number
  modelos: readonly string[]
  marca: string | null
  tipoPrincipal: string | null
  accesorio: boolean
}

export type OpcionesBusquedaProductos = {
  limite?: number
  excluirIds?: readonly string[]
}

type Puntuacion = {
  producto: ProductoCatalogo
  puntuacion: number
  motivo: MotivoCoincidencia
  peso: number
  precision: number
  modelos: readonly string[]
}

let indiceCache: ProductoIndexado[] | null = null
let catalogoCache: CatalogoProductos | null = null

export function esCategoriaProducto(texto: string): boolean {
  const consulta = limpiarConsulta(texto)
  const tokens = tokensUnicos(tokensCatalogo(consulta))
  return esCategoria(tokens)
}

export function buscarProductos(
  catalogo: CatalogoProductos,
  texto: string,
  opciones: OpcionesBusquedaProductos = {},
): ResultadoBusquedaProductos {
  if (catalogoCache !== catalogo || indiceCache === null) {
    catalogoCache = catalogo
    indiceCache = construirIndice(catalogo.productos)
  }

  const consulta = limpiarConsulta(texto)
  const consultaNormalizada = normalizarCatalogo(consulta)
  const tokensConsulta = tokensUnicos(tokensCatalogo(consulta))
  const modelosConsulta = extraerModelos(texto)
  const excluidos = new Set(opciones.excluirIds ?? [])

  if (tokensConsulta.length === 0 && modelosConsulta.length === 0) {
    return { tipo: 'ninguno', consulta }
  }

  const categoria = esCategoria(tokensConsulta)
  const marcaConsulta = marcaDeTokens(tokensConsulta)
  const tipoConsulta = tipoPrincipalDeTokens(tokensConsulta)
  const exactos: Puntuacion[] = []
  const parciales: Puntuacion[] = []

  for (const item of indiceCache) {
    if (excluidos.has(item.producto.id)) {
      continue
    }
    const exacto = puntuarExacto(item, consultaNormalizada, modelosConsulta)
    if (exacto) {
      exactos.push(exacto)
      continue
    }
    const parcial = puntuarParcial(item, tokensConsulta, categoria, {
      marcaConsulta,
      tipoConsulta,
      consultaGenerica: esConsultaGenerica(tokensConsulta, modelosConsulta),
    })
    if (parcial) {
      parciales.push(parcial)
    }
  }

  if (exactos.length > 0) {
    // Si el cliente escribio el nombre completo de un producto, ese nombre
    // manda sobre las coincidencias por modelo de sus variantes (por ejemplo,
    // "NBG-12LX" tambien aparece en las versiones en espanol e ingles).
    const nombreIgual = exactos.filter(
      (item) => item.motivo === 'nombre_exacto' && item.puntuacion >= 2000,
    )
    const porNombre =
      nombreIgual.length > 0
        ? nombreIgual
        : exactos.filter((item) => item.motivo === 'nombre_exacto')
    let base = porNombre.length > 0 ? porNombre : exactos
    if (porNombre.length === 0) {
      // Un modelo puede ser prefijo de otro (FSP-951 / FSP-951T). Solo se
      // aceptan coincidencias de modelo exactas; las parciales quedan fuera.
      const porModeloExacto = exactos.filter((item) =>
        item.modelos.some((modelo) => modelosConsulta.includes(modelo)),
      )
      if (porModeloExacto.length > 0) {
        base = preferirVarianteBase(porModeloExacto, modelosConsulta, tokensConsulta)
      }
    }
    const depurados = quitarNombresContenidos(base)
    return {
      tipo: 'confirmado',
      coincidencias: depurados.map((item) => ({
        producto: item.producto,
        puntuacion: item.puntuacion,
        motivo: item.motivo,
      })),
    }
  }

  parciales.sort((a, b) => b.puntuacion - a.puntuacion)
  const limite = limiteCandidatos(opciones.limite)
  const top = parciales[0]
  if (!top) {
    if (categoria) {
      return {
        tipo: 'ambiguo',
        candidatos: candidatosDeCategoria(indiceCache, tokensConsulta, {
          limite,
          excluidos,
          marcaConsulta,
          tipoConsulta,
        }),
      }
    }
    return { tipo: 'ninguno', consulta }
  }

  // Si el cliente escribio un codigo de modelo que no existe en el catalogo,
  // no se confirma ninguna coincidencia parcial: seria inventar un modelo.
  if (modelosConsulta.length > 0) {
    return {
      tipo: 'ambiguo',
      candidatos: candidatosParciales(parciales, limite),
    }
  }

  // La relevancia ordena opciones; una coincidencia parcial nunca confirma
  // por si sola un SKU, incluso cuando no hay un segundo resultado.
  return { tipo: 'ambiguo', candidatos: candidatosParciales(parciales, limite) }
}

function construirIndice(productos: readonly ProductoCatalogo[]): ProductoIndexado[] {
  return productos.map((producto) => {
    const nombreNormalizado = normalizarCatalogo(producto.nombre)
    const tokens = tokensUnicos(tokensCatalogo(producto.nombre))
    return {
      producto,
      nombreNormalizado,
      tokens,
      pesoTotal: tokens.reduce((total, token) => total + token.length, 0),
      modelos: extraerModelos(producto.nombre),
      marca: marcaDeTokens(tokens),
      tipoPrincipal: tipoPrincipalDeTokens(tokens),
      accesorio:
        tokens.some((token) => PALABRAS_ACCESORIO.has(token)) ||
        PATRON_ACCESORIO_SECUNDARIO.test(nombreNormalizado),
    }
  })
}

function limpiarConsulta(texto: string): string {
  return texto
    .replace(PATRON_CORREO, ' ')
    .replace(PATRON_URL, ' ')
    .replace(PATRON_FRASES_RELLENO, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function tokensUnicos(tokens: readonly string[]): string[] {
  const resultado: string[] = []
  const vistos = new Set<string>()
  for (const token of tokens) {
    if (token.length < 2 || PALABRAS_VACIAS.has(token) || /^\d+$/u.test(token)) {
      continue
    }
    const base = MARCAS_PRODUCTO_SET.has(token) ? token : singular(token)
    if (vistos.has(base)) {
      continue
    }
    vistos.add(base)
    resultado.push(base)
  }
  return resultado
}

function singular(token: string): string {
  if (token.length <= 3 || !token.endsWith('s') || /\d/u.test(token)) {
    return token
  }

  const sinS = token.slice(0, -1)
  if (TOKENS_CONOCIDOS.has(sinS)) {
    return sinS
  }
  if (token.endsWith('es')) {
    const sinEs = token.slice(0, -2)
    if (TOKENS_CONOCIDOS.has(sinEs)) {
      return sinEs
    }
    // "paneles", "rociadores", "detectores": el plural agrega "es" porque la
    // palabra base termina en consonante.
    return sinEs
  }
  return sinS
}

function raizDeToken(token: string): string | null {
  if (RAICES_PRODUCTO.includes(token)) {
    return token
  }
  const candidatos = RAICES_PRODUCTO.filter(
    (raiz) =>
      (raiz.length >= 4 && token.startsWith(raiz)) || (token.length >= 4 && raiz.startsWith(token)),
  )
  if (candidatos.length === 0) {
    return null
  }
  return [...candidatos].sort((a, b) => b.length - a.length)[0] ?? null
}

function esMarcaConocida(token: string): boolean {
  return MARCAS_PRODUCTO_SET.has(token)
}

function distanciaEdicion(a: string, b: string): number {
  const filas = a.length + 1
  const columnas = b.length + 1
  let anterior = Array.from({ length: columnas }, (_, indice) => indice)
  for (let fila = 1; fila < filas; fila += 1) {
    const actual = [fila]
    for (let columna = 1; columna < columnas; columna += 1) {
      const costo = a[fila - 1] === b[columna - 1] ? 0 : 1
      const arriba = (anterior[columna] ?? 0) + 1
      const izquierda = (actual[columna - 1] ?? 0) + 1
      const diagonal = (anterior[columna - 1] ?? 0) + costo
      actual[columna] = Math.min(arriba, izquierda, diagonal)
    }
    anterior = actual
  }
  return anterior[columnas - 1] ?? Math.max(a.length, b.length)
}

function umbralMarca(marca: string): number {
  if (marca.length >= 8) {
    return 2
  }
  return marca.length >= 5 ? 1 : 0
}

/**
 * Corrige errores menores de escritura de marcas ("hochicki" -> "hochiki").
 * Solo se acepta una correccion cuando hay un unico candidato suficientemente
 * cercano; no se adivina entre varias marcas parecidas.
 */
function corregirMarca(token: string): string | null {
  if (token.length < 4) {
    return null
  }
  let mejor: { marca: string; distancia: number } | null = null
  let empate = false
  for (const marca of MARCAS_PRODUCTO) {
    const umbral = umbralMarca(marca)
    if (umbral === 0 || Math.abs(marca.length - token.length) > umbral) {
      continue
    }
    const distancia = distanciaEdicion(token, marca)
    if (distancia > umbral) {
      continue
    }
    if (mejor === null || distancia < mejor.distancia) {
      mejor = { marca, distancia }
      empate = false
    } else if (distancia === mejor.distancia) {
      empate = true
    }
  }
  return mejor !== null && !empate ? mejor.marca : null
}

export function marcaDeTokens(tokensConsulta: readonly string[]): string | null {
  for (const token of tokensConsulta) {
    if (esMarcaConocida(token)) {
      return token
    }
    const porPrefijo = MARCAS_PRODUCTO.find(
      (marca) =>
        token.length >= 4 &&
        (marca.startsWith(token) || (token.startsWith(marca) && marca.length >= 4)),
    )
    if (porPrefijo) {
      return porPrefijo
    }
  }
  for (const token of tokensConsulta) {
    const corregida = corregirMarca(token)
    if (corregida) {
      return corregida
    }
  }
  return null
}

/**
 * Corrige erratas menores de marcas conocidas dentro de un texto libre
 * ("panel hochicki" -> "panel hochiki"). Solo sustituye cuando la correccion
 * es inequivoca, para no reescribir palabras que no son marcas.
 */
export function normalizarMarcasTexto(texto: string): string {
  let resultado = texto
  const vistos = new Set<string>()
  for (const token of tokensCatalogo(texto)) {
    if (token.length < 4 || vistos.has(token)) {
      continue
    }
    vistos.add(token)
    if (esMarcaConocida(token)) {
      continue
    }
    const corregida = corregirMarca(token)
    if (corregida === null) {
      continue
    }
    resultado = resultado.replace(new RegExp(`\\b${escaparRegex(token)}\\b`, 'giu'), corregida)
  }
  return resultado
}

/**
 * Traduce la relevancia interna a un nivel de confianza util para decidir si se
 * guarda o se pregunta. No es una probabilidad: es una clasificacion
 * determinista basada en el motivo y la puntuacion heuristica.
 */
export function confianzaCoincidencia(
  coincidencia: CoincidenciaProducto,
): 'alta' | 'media' | 'baja' {
  if (coincidencia.motivo === 'nombre_exacto' || coincidencia.motivo === 'modelo') {
    return 'alta'
  }
  if (coincidencia.puntuacion >= 45) {
    return 'media'
  }
  return 'baja'
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

export function tipoPrincipalDeTokens(tokensConsulta: readonly string[]): string | null {
  const tipos = tokensConsulta
    .map((token) => raizDeToken(token))
    .filter((tipo): tipo is string => tipo !== null)
  return tipos.find((tipo) => !TIPOS_AMPLIOS.has(tipo)) ?? tipos[0] ?? null
}

export function marcaDeProducto(nombre: string): string | null {
  return marcaDeTokens(tokensUnicos(tokensCatalogo(nombre)))
}

export function esConsultaGenericaProductos(texto: string): boolean {
  const consulta = limpiarConsulta(texto)
  const tokens = tokensUnicos(tokensCatalogo(consulta))
  return esConsultaGenerica(tokens, extraerModelos(texto))
}

export function esConsultaAmpliaProductos(texto: string): boolean {
  const tokens = tokensUnicos(tokensCatalogo(limpiarConsulta(texto)))
  return tokens.some((token) => TIPOS_AMPLIOS.has(raizDeToken(token) ?? token))
}

/**
 * Indica si la consulta combina una marca reconocida (aunque tenga una errata
 * menor) con un tipo de producto concreto. Sirve para conservar una solicitud
 * no verificada, por ejemplo "paneles Hochiki", sin inventar un SKU.
 */
export function esConsultaEspecificaProductos(texto: string): boolean {
  const tokens = tokensUnicos(tokensCatalogo(limpiarConsulta(texto)))
  const marca = marcaDeTokens(tokens)
  const tipo = tipoPrincipalDeTokens(tokens)
  return marca !== null && tipo !== null && !TIPOS_AMPLIOS.has(tipo)
}

function esConsultaGenerica(
  tokensConsulta: readonly string[],
  modelosConsulta: readonly string[],
): boolean {
  if (modelosConsulta.length > 0 || tokensConsulta.length === 0) {
    return false
  }

  const marca = marcaDeTokens(tokensConsulta)
  if (tokensConsulta.some((token) => TIPOS_AMPLIOS.has(raizDeToken(token) ?? token))) {
    return true
  }

  return tokensConsulta.every(
    (token) =>
      raizDeToken(token) !== null ||
      token === 'manual' ||
      esMarcaConocida(token) ||
      corregirMarca(token) !== null ||
      token === marca ||
      PALABRAS_ACCESORIO.has(token),
  )
}

function limiteCandidatos(limite: number | undefined): number {
  if (limite === undefined || !Number.isFinite(limite)) {
    return 5
  }
  return Math.max(1, Math.min(5, Math.trunc(limite)))
}

export function extraerModelos(texto: string): string[] {
  const modelos = new Set<string>()
  for (const coincidencia of texto.matchAll(PATRON_MODELO_COMPUESTO)) {
    const valor = normalizarModelo(coincidencia[0])
    if (valor.length >= 3 && /\d/u.test(valor) && /[a-z]/u.test(valor)) {
      modelos.add(valor)
    }
  }
  for (const coincidencia of texto.matchAll(PATRON_MODELO_SIMPLE)) {
    const original = coincidencia[0]
    const valor = normalizarModelo(original)
    if (valor.length >= 3 && /\d/u.test(valor) && /[a-z]/u.test(valor)) {
      modelos.add(valor)
    }
  }
  for (const coincidencia of texto.matchAll(PATRON_MODELO_SEPARADO)) {
    const prefijo = coincidencia[1] ?? ''
    const sufijo = coincidencia[2] ?? ''
    if (PALABRAS_NO_MODELO.has(normalizarCatalogo(prefijo))) {
      continue
    }
    const valor = normalizarModelo(`${prefijo}${sufijo}`)
    if (valor.length >= 3 && /\d/u.test(valor)) {
      modelos.add(valor)
    }
  }
  return [...modelos]
}

function puntuarExacto(
  item: ProductoIndexado,
  consultaNormalizada: string,
  modelosConsulta: readonly string[],
): Puntuacion | null {
  if (contieneFrase(consultaNormalizada, item.nombreNormalizado)) {
    // La igualdad exacta manda sobre la simple contención: si el cliente
    // escribio el nombre base, no debe ganar una variante con sufijo.
    const igual = consultaNormalizada === item.nombreNormalizado
    return {
      producto: item.producto,
      puntuacion: (igual ? 2000 : 1000) + item.nombreNormalizado.length,
      motivo: 'nombre_exacto',
      peso: item.nombreNormalizado.length,
      precision: 1,
      modelos: item.modelos,
    }
  }

  const modelo = item.modelos.find((candidato) =>
    modelosConsulta.some((consulta) => consulta === candidato),
  )
  if (modelo) {
    return {
      producto: item.producto,
      puntuacion: 800 + modelo.length,
      motivo: 'modelo',
      peso: modelo.length,
      precision: 1,
      modelos: item.modelos,
    }
  }

  return null
}

type ContextoPuntuacion = {
  marcaConsulta: string | null
  tipoConsulta: string | null
  consultaGenerica: boolean
}

function puntuarParcial(
  item: ProductoIndexado,
  tokensConsulta: readonly string[],
  categoria: boolean,
  contexto: ContextoPuntuacion,
): Puntuacion | null {
  let peso = 0
  let distintivo = false
  for (const token of item.tokens) {
    if (!tokensConsulta.includes(token)) {
      continue
    }
    peso += token.length
    if (token.length >= 5 || /\d/u.test(token)) {
      distintivo = true
    }
  }

  if (peso === 0 || item.pesoTotal === 0) {
    return null
  }

  const pesoConsulta = tokensConsulta.reduce((total, token) => total + token.length, 0)
  const precision = peso / item.pesoTotal
  const cobertura = pesoConsulta === 0 ? 0 : peso / pesoConsulta
  let puntuacion = peso * (0.6 + 0.4 * precision) + cobertura * 10

  // Medida interna de relevancia (no es una probabilidad): prima el tipo
  // principal y la marca, y castiga accesorios que solo mencionan la categoria
  // dentro de una frase como "para paneles".
  if (contexto.tipoConsulta !== null && item.tipoPrincipal === contexto.tipoConsulta) {
    puntuacion += 30
  }
  if (contexto.marcaConsulta !== null && item.marca === contexto.marcaConsulta) {
    puntuacion += 35
  }
  if (item.accesorio) {
    puntuacion -= contexto.consultaGenerica ? 25 : 12
  }

  if (categoria && !distintivo) {
    return {
      producto: item.producto,
      puntuacion: Math.max(puntuacion, 1),
      motivo: 'categoria',
      peso,
      precision,
      modelos: item.modelos,
    }
  }

  if (peso < 6 || precision < 0.25 || (!distintivo && !categoria)) {
    return null
  }

  return {
    producto: item.producto,
    puntuacion,
    motivo: 'parcial',
    peso,
    precision,
    modelos: item.modelos,
  }
}

function esCategoria(tokensConsulta: readonly string[]): boolean {
  return tokensConsulta.some((token) =>
    [...RAICES_PRODUCTO, ...MARCAS_PRODUCTO].some(
      (raiz) =>
        token === raiz ||
        (token.length >= 4 && raiz.startsWith(token)) ||
        (raiz.length >= 4 && token.startsWith(raiz)),
    ),
  )
}

/**
 * Cuando un modelo coincide con varias variantes del mismo producto
 * (`NBG-12LX`, `NBG-12LX - Espanol`, ...), se prefiere la variante base salvo
 * que el cliente haya escrito la palabra que distingue a una variante.
 */
function preferirVarianteBase(
  items: readonly Puntuacion[],
  modelosConsulta: readonly string[],
  tokensConsulta: readonly string[],
): Puntuacion[] {
  const grupos = new Map<string, Puntuacion[]>()
  for (const item of items) {
    const modelosExactos = item.modelos
      .filter((modelo) => modelosConsulta.includes(modelo))
      .sort((a, b) => b.length - a.length)
    const clave = modelosExactos[0] ?? item.producto.id
    const grupo = grupos.get(clave) ?? []
    grupo.push(item)
    grupos.set(clave, grupo)
  }

  const resultado: Puntuacion[] = []
  for (const grupo of grupos.values()) {
    resultado.push(...reducirVariantes(grupo, modelosConsulta, tokensConsulta))
  }
  return resultado
}

function reducirVariantes(
  grupo: readonly Puntuacion[],
  modelosConsulta: readonly string[],
  tokensConsulta: readonly string[],
): Puntuacion[] {
  if (grupo.length <= 1) {
    return [...grupo]
  }

  const normalizados = grupo.map((item) => ({
    item,
    nombre: normalizarCatalogo(item.producto.nombre),
  }))
  const masCorto = normalizados.reduce((a, b) => (a.nombre.length <= b.nombre.length ? a : b))
  const todosExtiendenAlCorto = normalizados.every(
    ({ nombre }) => nombre === masCorto.nombre || nombre.startsWith(`${masCorto.nombre} `),
  )
  if (!todosExtiendenAlCorto) {
    return [...grupo]
  }

  // Las palabras de la consulta que no forman parte del modelo (por ejemplo,
  // "Ingles") distinguen una variante concreta.
  const tokensExtra = tokensConsulta.filter(
    (token) => !modelosConsulta.some((modelo) => modelo.includes(token)),
  )
  let candidatos = [...grupo]
  if (tokensExtra.length > 0) {
    const conExtra = grupo.filter((item) => {
      const tokens = new Set(tokensCatalogo(item.producto.nombre))
      return tokensExtra.every((token) => tokens.has(token))
    })
    if (conExtra.length > 0) {
      candidatos = conExtra
    }
  }

  const corto = candidatos.reduce((a, b) =>
    normalizarCatalogo(a.producto.nombre).length <= normalizarCatalogo(b.producto.nombre).length
      ? a
      : b,
  )
  return [corto]
}

function quitarNombresContenidos(exactos: readonly Puntuacion[]): Puntuacion[] {
  const ordenados = [...exactos].sort((a, b) => b.producto.nombre.length - a.producto.nombre.length)
  const resultado: Puntuacion[] = []
  for (const item of ordenados) {
    const nombre = normalizarCatalogo(item.producto.nombre)
    const contenido = resultado.some((otro) =>
      contieneFrase(normalizarCatalogo(otro.producto.nombre), nombre),
    )
    if (!contenido) {
      resultado.push(item)
    }
  }
  return resultado
}

function candidatosParciales(parciales: readonly Puntuacion[], limite = 5): CoincidenciaProducto[] {
  const vistos = new Set<string>()
  const candidatos: CoincidenciaProducto[] = []
  for (const item of parciales) {
    if (vistos.has(item.producto.id)) {
      continue
    }
    vistos.add(item.producto.id)
    candidatos.push({
      producto: item.producto,
      puntuacion: item.puntuacion,
      motivo: item.motivo,
    })
    if (candidatos.length >= limite) {
      break
    }
  }
  return candidatos
}

function candidatosDeCategoria(
  indice: readonly ProductoIndexado[],
  tokensConsulta: readonly string[],
  opciones: {
    limite: number
    excluidos: ReadonlySet<string>
    marcaConsulta: string | null
    tipoConsulta: string | null
  },
): CoincidenciaProducto[] {
  const candidatos: Puntuacion[] = []
  const consultaGenerica = esConsultaGenerica(tokensConsulta, [])
  for (const item of indice) {
    if (opciones.excluidos.has(item.producto.id)) {
      continue
    }
    const peso = item.tokens
      .filter((token) => tokensConsulta.includes(token))
      .reduce((total, token) => total + token.length, 0)
    if (peso === 0) {
      continue
    }
    let puntuacion = peso
    if (opciones.tipoConsulta !== null && item.tipoPrincipal === opciones.tipoConsulta) {
      puntuacion += 30
    }
    if (opciones.marcaConsulta !== null && item.marca === opciones.marcaConsulta) {
      puntuacion += 35
    }
    if (item.accesorio) {
      puntuacion -= consultaGenerica ? 25 : 12
    }
    candidatos.push({
      producto: item.producto,
      puntuacion,
      motivo: 'categoria',
      peso,
      precision: peso / Math.max(1, item.pesoTotal),
      modelos: [],
    })
  }
  candidatos.sort((a, b) => b.puntuacion - a.puntuacion)
  return candidatosParciales(candidatos, opciones.limite)
}

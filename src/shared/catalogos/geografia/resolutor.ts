import { contieneFrase, indiceFrase, normalizarCatalogo } from '../texto.js'
import type {
  CatalogoExtranjero,
  CatalogoGeografia,
  CiudadExtranjera,
  EntidadGeo,
  LocalidadGeo,
  MunicipioGeo,
  PaisExtranjero,
  ResultadoUbicacion,
  UbicacionValidada,
} from './tipos.js'

type EntradaIndice<T> = {
  nombre: string
  valores: readonly T[]
  alias: boolean
}

type Coincidencia<T> = {
  nombre: string
  inicio: number
  fin: number
  valores: readonly T[]
  alias: boolean
}

type CiudadExtranjeraIndexada = {
  ciudad: CiudadExtranjera
  pais: PaisExtranjero
  alias: string
}

export type OpcionesResolverUbicaciones = {
  geografia: CatalogoGeografia
  extranjero: CatalogoExtranjero
}

export type ResolutorUbicaciones = {
  resolver(texto: string): ResultadoUbicacion
  resolverExacto(texto: string): ResultadoUbicacion
  formatearCandidatos(candidatos: readonly UbicacionValidada[], limite?: number): string
}

const ALIAS_ENTIDAD: Readonly<Record<string, string>> = {
  ags: '01',
  bc: '02',
  bcs: '03',
  camp: '04',
  coah: '05',
  chis: '07',
  chih: '08',
  cdmx: '09',
  df: '09',
  'distrito federal': '09',
  'ciudad de mexico': '09',
  dgo: '10',
  gto: '11',
  gro: '12',
  hgo: '13',
  jal: '14',
  'edo mex': '15',
  edomex: '15',
  'estado de mexico': '15',
  mich: '16',
  'michoacan de ocampo': '16',
  nay: '18',
  nl: '19',
  'nuevo leon': '19',
  oax: '20',
  qro: '22',
  qroo: '23',
  'q roo': '23',
  'quintana roo': '23',
  slp: '24',
  'san luis potosi': '24',
  tab: '27',
  tamps: '28',
  tlax: '29',
  'veracruz de ignacio de la llave': '30',
  yuc: '31',
  zac: '32',
}

const ALIAS_MUNICIPIO: Readonly<Record<string, string>> = {
  'ciudad juarez': '08037',
  'ciudad victoria': '28041',
  'ciudad acuna': '05002',
  'ciudad obregon': '26018',
  'ciudad del carmen': '04003',
  'ciudad valles': '24013',
  'ciudad mante': '28021',
  'ciudad madero': '28009',
  'ciudad guzman': '14023',
  'ciudad altamirano': '12050',
  gdl: '14039',
  mty: '19039',
  qro: '22014',
  tij: '02004',
}

const NOMBRES_GENERICOS = new Set([
  'centro',
  'juarez',
  'hidalgo',
  'morelos',
  'guerrero',
  'zaragoza',
  'allende',
  'independencia',
  'revolucion',
  'madero',
  'obregon',
  'cardenas',
  'cuauhtemoc',
  'libertad',
  'benito juarez',
  'lazaro cardenas',
  'emiliano zapata',
  'venustiano carranza',
  'francisco i madero',
  'miguel hidalgo',
  'jose maria morelos',
  'josefa ortiz de dominguez',
])

const PATRON_MUNICIPIO_EXPLICITO = /\b(?:municipio|alcaldia|delegacion|ciudad)\s+(?:de\s+)?/u

export function crearResolutorUbicaciones(
  opciones: OpcionesResolverUbicaciones,
): ResolutorUbicaciones {
  const { geografia, extranjero } = opciones

  const entidadesPorClave = new Map<string, EntidadGeo>()
  const municipiosPorCvegeo = new Map<string, MunicipioGeo>()
  const entidades: EntradaIndice<EntidadGeo>[] = []
  const municipios: EntradaIndice<MunicipioGeo>[] = []
  const localidades: EntradaIndice<LocalidadGeo>[] = []

  for (const entidad of geografia.entidades) {
    entidadesPorClave.set(entidad.clave, entidad)
    const nombre = normalizarCatalogo(entidad.nombre)
    if (nombre.length > 0 && nombre !== 'mexico') {
      entidades.push({ nombre, valores: [entidad], alias: false })
    }
  }

  for (const [alias, clave] of Object.entries(ALIAS_ENTIDAD)) {
    const entidad = entidadesPorClave.get(clave)
    if (entidad) {
      entidades.push({ nombre: normalizarCatalogo(alias), valores: [entidad], alias: true })
    }
  }

  const municipiosPorNombre = agruparPorNombre(geografia.municipios)
  for (const [nombre, valores] of municipiosPorNombre) {
    municipios.push({ nombre, valores, alias: false })
  }

  for (const municipio of geografia.municipios) {
    municipiosPorCvegeo.set(municipio.cvegeo, municipio)
  }

  for (const [alias, cvegeo] of Object.entries(ALIAS_MUNICIPIO)) {
    const municipio = municipiosPorCvegeo.get(cvegeo)
    if (municipio) {
      municipios.push({ nombre: normalizarCatalogo(alias), valores: [municipio], alias: true })
    }
  }

  const localidadesPorNombre = agruparPorNombre(geografia.localidades)
  for (const [nombre, valores] of localidadesPorNombre) {
    localidades.push({ nombre, valores, alias: false })
  }

  entidades.sort((a, b) => b.nombre.length - a.nombre.length)
  municipios.sort((a, b) => b.nombre.length - a.nombre.length)
  localidades.sort((a, b) => b.nombre.length - a.nombre.length)

  const entidadesExactas = indexarExacto(entidades)
  const municipiosExactos = indexarExacto(municipios)
  const localidadesExactas = indexarExacto(localidades)

  const paisesPorAlias = construirIndicePaises(extranjero)
  const ciudadesPorAlias = construirIndiceCiudades(extranjero)

  function resolverExacto(texto: string): ResultadoUbicacion {
    const normalizado = normalizarCatalogo(texto)
    if (normalizado.length === 0) {
      return { tipo: 'no_reconocida', texto }
    }

    const municipiosEncontrados = municipiosExactos.get(normalizado) ?? []
    const localidadesEncontradas = localidadesExactas.get(normalizado) ?? []
    const entidadesEncontradas = entidadesExactas.get(normalizado) ?? []

    const mexicanos: UbicacionValidada[] = []
    if (municipiosEncontrados.length > 0) {
      mexicanos.push(
        ...municipiosEncontrados.map((municipio) =>
          ubicacionDeMunicipio(municipio, municipiosPorCvegeo, entidadesPorClave),
        ),
      )
    } else if (entidadesEncontradas.length > 0) {
      // Un nombre de entidad (p. ej. Jalisco) puede coincidir con una localidad
      // homonima; el estado es la interpretacion mas probable y queda marcado
      // como incompleto hasta confirmar municipio o localidad.
      mexicanos.push(...entidadesEncontradas.map((entidad) => ubicacionDeEntidad(entidad)))
    } else if (localidadesEncontradas.length > 0) {
      mexicanos.push(
        ...localidadesEncontradas.map((localidad) =>
          ubicacionDeLocalidad(localidad, municipiosPorCvegeo, entidadesPorClave),
        ),
      )
    }

    const paisExacto = paisesPorAlias.get(normalizado)
    const ciudadesEncontradas = ciudadesPorAlias.get(normalizado) ?? []
    const extranjeras: UbicacionValidada[] = []
    if (paisExacto) {
      extranjeras.push(ubicacionDePais(paisExacto.nombre, paisesPorAlias))
    }
    for (const entrada of ciudadesEncontradas) {
      extranjeras.push(ubicacionDeCiudadExtranjera(entrada.ciudad, entrada.pais))
    }

    const candidatos = deduplicarUbicaciones([...mexicanos, ...extranjeras])
    if (candidatos.length === 0) {
      return { tipo: 'no_reconocida', texto }
    }

    const extranjeraAmbigua =
      ciudadesEncontradas.some((entrada) => entrada.ciudad.ambigua) ||
      ciudadesEncontradas.length > 1 ||
      (paisExacto !== undefined && ciudadesEncontradas.length > 0)
    if (candidatos.length > 1 || extranjeraAmbigua) {
      return { tipo: 'ambigua', candidatos }
    }

    return desdeCandidatos(candidatos)
  }

  function resolver(texto: string): ResultadoUbicacion {
    const normalizado = normalizarCatalogo(texto)
    if (normalizado.length === 0) {
      return { tipo: 'no_reconocida', texto }
    }

    const paisesExplicitos = paisesPresentes(normalizado, paisesPorAlias)
    const mexicano = resolverMexicano(normalizado, paisesExplicitos)
    const extranjeroResultado = resolverExtranjero(normalizado, paisesExplicitos)

    if (paisesExplicitos.size > 0) {
      if (extranjeroResultado.seguros.length > 0) {
        return desdeCandidatos(extranjeroResultado.seguros)
      }
      if (extranjeroResultado.ambiguos.length > 0) {
        return { tipo: 'ambigua', candidatos: extranjeroResultado.ambiguos }
      }
      return desdeCandidatos([ubicacionDePais([...paisesExplicitos][0] ?? '', paisesPorAlias)])
    }

    if (mexicano.entidadesExplicitas.size > 0 && mexicano.candidatos.length > 0) {
      return desdeCandidatos(mexicano.candidatos)
    }

    const candidatosExtranjerosSeguros = extranjeroResultado.seguros
    const candidatosExtranjerosAmbiguos = extranjeroResultado.ambiguos

    if (
      mexicano.candidatos.length > 0 &&
      candidatosExtranjerosSeguros.length === 0 &&
      candidatosExtranjerosAmbiguos.length === 0
    ) {
      return desdeCandidatos(mexicano.candidatos)
    }

    if (mexicano.candidatos.length === 0 && candidatosExtranjerosAmbiguos.length === 0) {
      if (candidatosExtranjerosSeguros.length > 0) {
        return desdeCandidatos(candidatosExtranjerosSeguros)
      }
      return { tipo: 'no_reconocida', texto }
    }

    const combinados = deduplicarUbicaciones([
      ...mexicano.candidatos,
      ...candidatosExtranjerosSeguros,
      ...candidatosExtranjerosAmbiguos,
    ])
    return { tipo: 'ambigua', candidatos: combinados }
  }

  function resolverMexicano(
    normalizado: string,
    paisesExplicitos: ReadonlySet<string>,
  ): { candidatos: UbicacionValidada[]; entidadesExplicitas: Set<string> } {
    const coincidenciasEntidad = buscarCoincidencias(normalizado, entidades)
    const entidadesExplicitas = new Set<string>()
    for (const coincidencia of coincidenciasEntidad) {
      for (const entidad of coincidencia.valores) {
        entidadesExplicitas.add(entidad.clave)
      }
    }

    const municipioExplicito = PATRON_MUNICIPIO_EXPLICITO.test(normalizado)
    const municipiosEncontrados = new Map<string, MunicipioGeo>()
    for (const coincidencia of buscarCoincidencias(normalizado, municipios)) {
      for (const municipio of coincidencia.valores) {
        if (
          esGenerico(coincidencia.nombre) &&
          !coincidencia.alias &&
          !municipioExplicito &&
          entidadesExplicitas.size === 0
        ) {
          continue
        }
        if (entidadesExplicitas.size > 0 && !entidadesExplicitas.has(municipio.cveEnt)) {
          continue
        }
        municipiosEncontrados.set(municipio.cvegeo, municipio)
      }
    }

    const localidadesEncontradas = new Map<string, LocalidadGeo>()
    for (const coincidencia of buscarCoincidencias(normalizado, localidades)) {
      for (const localidad of coincidencia.valores) {
        if (
          esGenerico(coincidencia.nombre) &&
          !coincidencia.alias &&
          entidadesExplicitas.size === 0
        ) {
          continue
        }
        if (entidadesExplicitas.size > 0 && !entidadesExplicitas.has(localidad.cveEnt)) {
          continue
        }
        localidadesEncontradas.set(localidad.cvegeo, localidad)
      }
    }

    if (municipiosEncontrados.size > 0) {
      return {
        candidatos: [...municipiosEncontrados.values()].map((municipio) =>
          ubicacionDeMunicipio(municipio, municipiosPorCvegeo, entidadesPorClave),
        ),
        entidadesExplicitas,
      }
    }

    if (localidadesEncontradas.size > 0) {
      return {
        candidatos: [...localidadesEncontradas.values()].map((localidad) =>
          ubicacionDeLocalidad(localidad, municipiosPorCvegeo, entidadesPorClave),
        ),
        entidadesExplicitas,
      }
    }

    if (paisesExplicitos.size === 0 && entidadesExplicitas.size > 0) {
      return {
        candidatos: [...entidadesExplicitas]
          .map((clave) => entidadesPorClave.get(clave))
          .filter((entidad): entidad is EntidadGeo => entidad !== undefined)
          .map((entidad) => ubicacionDeEntidad(entidad)),
        entidadesExplicitas,
      }
    }

    return { candidatos: [], entidadesExplicitas }
  }

  function resolverExtranjero(
    normalizado: string,
    paisesExplicitos: ReadonlySet<string>,
  ): { seguros: UbicacionValidada[]; ambiguos: UbicacionValidada[] } {
    const coincidencias = buscarCoincidencias(
      normalizado,
      construirEntradasCiudades(ciudadesPorAlias),
    )
    const seguros: UbicacionValidada[] = []
    const ambiguos: UbicacionValidada[] = []

    for (const coincidencia of coincidencias) {
      const porPais = new Map<string, CiudadExtranjeraIndexada[]>()
      for (const entrada of coincidencia.valores) {
        const actuales = porPais.get(entrada.pais.nombre) ?? []
        actuales.push(entrada)
        porPais.set(entrada.pais.nombre, actuales)
      }

      for (const [nombrePais, entradas] of porPais) {
        const entrada = entradas[0]
        if (!entrada) {
          continue
        }
        const ubicacion = ubicacionDeCiudadExtranjera(entrada.ciudad, entrada.pais)
        if (paisesExplicitos.has(nombrePais)) {
          seguros.push(ubicacion)
          continue
        }
        if (paisesExplicitos.size > 0) {
          continue
        }

        const ambigua =
          entrada.ciudad.ambigua ||
          normalizarCatalogo(entrada.ciudad.nombre).length < 5 ||
          coincidencia.nombre.length < 5 ||
          porPais.size > 1 ||
          entradas.length > 1
        if (ambigua) {
          ambiguos.push(ubicacion)
        } else {
          seguros.push(ubicacion)
        }
      }
    }

    return {
      seguros: deduplicarUbicaciones(seguros),
      ambiguos: deduplicarUbicaciones(ambiguos),
    }
  }

  function formatearCandidatos(candidatos: readonly UbicacionValidada[], limite = 3): string {
    return deduplicarUbicaciones(candidatos)
      .slice(0, limite)
      .map((candidato) => candidato.nombreMostrado)
      .join('; ')
  }

  return { resolver, resolverExacto, formatearCandidatos }
}

let resolutorCache: {
  geografia: CatalogoGeografia
  extranjero: CatalogoExtranjero
  resolutor: ResolutorUbicaciones
} | null = null

export function obtenerResolutorUbicaciones(
  geografia: CatalogoGeografia,
  extranjero: CatalogoExtranjero,
): ResolutorUbicaciones {
  if (
    !resolutorCache ||
    resolutorCache.geografia !== geografia ||
    resolutorCache.extranjero !== extranjero
  ) {
    resolutorCache = {
      geografia,
      extranjero,
      resolutor: crearResolutorUbicaciones({ geografia, extranjero }),
    }
  }
  return resolutorCache.resolutor
}

function agruparPorNombre<T extends { nombre: string }>(valores: readonly T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>()
  for (const valor of valores) {
    const nombre = normalizarCatalogo(valor.nombre)
    if (nombre.length < 3) {
      continue
    }
    const actuales = mapa.get(nombre) ?? []
    actuales.push(valor)
    mapa.set(nombre, actuales)
  }
  return mapa
}

function indexarExacto<T>(entradas: readonly EntradaIndice<T>[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>()
  for (const entrada of entradas) {
    const actuales = mapa.get(entrada.nombre) ?? []
    for (const valor of entrada.valores) {
      if (!actuales.includes(valor)) {
        actuales.push(valor)
      }
    }
    mapa.set(entrada.nombre, actuales)
  }
  return mapa
}

function buscarCoincidencias<T>(
  textoNormalizado: string,
  entradas: readonly EntradaIndice<T>[],
): Coincidencia<T>[] {
  const encontradas: Coincidencia<T>[] = []
  for (const entrada of entradas) {
    const inicio = indiceFrase(textoNormalizado, entrada.nombre)
    if (inicio < 0) {
      continue
    }
    const fin = inicio + entrada.nombre.length
    if (encontradas.some((actual) => inicio < actual.fin && fin > actual.inicio)) {
      continue
    }
    encontradas.push({
      nombre: entrada.nombre,
      inicio,
      fin,
      valores: entrada.valores,
      alias: entrada.alias,
    })
  }
  return encontradas
}

function esGenerico(nombre: string): boolean {
  return NOMBRES_GENERICOS.has(nombre)
}

function ubicacionDeMunicipio(
  municipio: MunicipioGeo,
  municipiosPorCvegeo: ReadonlyMap<string, MunicipioGeo>,
  entidadesPorClave: ReadonlyMap<string, EntidadGeo>,
): UbicacionValidada {
  void municipiosPorCvegeo
  const entidad = entidadesPorClave.get(municipio.cveEnt)
  const partes = [municipio.nombre]
  if (entidad) {
    partes.push(entidad.nombre)
  }
  return {
    tipo: 'municipio',
    nombreMostrado: partes.join(', '),
    pais: 'México',
    entidad: entidad?.nombre ?? null,
    municipio: municipio.nombre,
    localidad: null,
    cvegeo: municipio.cvegeo,
    completa: true,
    confianza: 'exacta',
  }
}

function ubicacionDeLocalidad(
  localidad: LocalidadGeo,
  municipiosPorCvegeo: ReadonlyMap<string, MunicipioGeo>,
  entidadesPorClave: ReadonlyMap<string, EntidadGeo>,
): UbicacionValidada {
  const municipio = municipiosPorCvegeo.get(`${localidad.cveEnt}${localidad.cveMun}`)
  const entidad = entidadesPorClave.get(localidad.cveEnt)
  const partes = [localidad.nombre]
  if (municipio && normalizarCatalogo(municipio.nombre) !== normalizarCatalogo(localidad.nombre)) {
    partes.push(municipio.nombre)
  }
  if (
    entidad &&
    !partes.some((parte) => normalizarCatalogo(parte) === normalizarCatalogo(entidad.nombre))
  ) {
    partes.push(entidad.nombre)
  }
  return {
    tipo: 'localidad',
    nombreMostrado: partes.join(', '),
    pais: 'México',
    entidad: entidad?.nombre ?? null,
    municipio: municipio?.nombre ?? null,
    localidad: localidad.nombre,
    cvegeo: localidad.cvegeo,
    completa: true,
    confianza: 'exacta',
  }
}

function ubicacionDeEntidad(entidad: EntidadGeo): UbicacionValidada {
  return {
    tipo: 'entidad',
    nombreMostrado: entidad.nombre,
    pais: 'México',
    entidad: entidad.nombre,
    municipio: null,
    localidad: null,
    cvegeo: entidad.clave,
    completa: entidad.clave === '09',
    confianza: 'exacta',
  }
}

function ubicacionDeCiudadExtranjera(
  ciudad: CiudadExtranjera,
  pais: PaisExtranjero,
): UbicacionValidada {
  return {
    tipo: 'extranjera',
    nombreMostrado: `${ciudad.nombre}, ${pais.nombre}`,
    pais: pais.nombre,
    entidad: null,
    municipio: null,
    localidad: ciudad.nombre,
    cvegeo: null,
    completa: true,
    confianza: 'exacta',
  }
}

function ubicacionDePais(
  nombrePais: string,
  paisesPorAlias: ReadonlyMap<string, PaisExtranjero>,
): UbicacionValidada {
  const pais = paisesPorAlias.get(nombrePais)
  return {
    tipo: 'extranjera',
    nombreMostrado: pais?.nombre ?? nombrePais,
    pais: pais?.nombre ?? nombrePais,
    entidad: null,
    municipio: null,
    localidad: null,
    cvegeo: null,
    completa: true,
    confianza: 'alias',
  }
}

function desdeCandidatos(candidatos: readonly UbicacionValidada[]): ResultadoUbicacion {
  const unicos = deduplicarUbicaciones(candidatos)
  if (unicos.length === 1) {
    const ubicacion = unicos[0]
    if (!ubicacion) {
      return { tipo: 'no_reconocida', texto: '' }
    }
    return ubicacion.tipo === 'extranjera'
      ? { tipo: 'extranjera', ubicacion, candidatos: unicos }
      : { tipo: 'mexicana', ubicacion, candidatos: unicos }
  }
  return { tipo: 'ambigua', candidatos: unicos }
}

function deduplicarUbicaciones(candidatos: readonly UbicacionValidada[]): UbicacionValidada[] {
  const vistos = new Set<string>()
  const resultado: UbicacionValidada[] = []
  for (const candidato of candidatos) {
    const clave = `${candidato.tipo}:${candidato.cvegeo ?? candidato.nombreMostrado}`
    if (vistos.has(clave)) {
      continue
    }
    vistos.add(clave)
    resultado.push(candidato)
  }
  return resultado
}

function construirIndicePaises(catalogo: CatalogoExtranjero): Map<string, PaisExtranjero> {
  const mapa = new Map<string, PaisExtranjero>()
  for (const pais of catalogo.paises) {
    for (const nombre of [pais.nombre, ...pais.aliases]) {
      const alias = normalizarCatalogo(nombre)
      if (alias.length > 0) {
        mapa.set(alias, pais)
      }
    }
  }
  return mapa
}

function construirIndiceCiudades(
  catalogo: CatalogoExtranjero,
): Map<string, CiudadExtranjeraIndexada[]> {
  const mapa = new Map<string, CiudadExtranjeraIndexada[]>()
  for (const pais of catalogo.paises) {
    for (const ciudad of pais.ciudades) {
      for (const nombre of [ciudad.nombre, ...ciudad.aliases]) {
        const alias = normalizarCatalogo(nombre)
        if (alias.length < 3) {
          continue
        }
        const actuales = mapa.get(alias) ?? []
        actuales.push({ ciudad, pais, alias })
        mapa.set(alias, actuales)
      }
    }
  }
  return mapa
}

function construirEntradasCiudades(
  ciudadesPorAlias: ReadonlyMap<string, CiudadExtranjeraIndexada[]>,
): EntradaIndice<CiudadExtranjeraIndexada>[] {
  const entradas: EntradaIndice<CiudadExtranjeraIndexada>[] = []
  for (const [nombre, valores] of ciudadesPorAlias) {
    entradas.push({ nombre, valores, alias: true })
  }
  return entradas.sort((a, b) => b.nombre.length - a.nombre.length)
}

function paisesPresentes(
  textoNormalizado: string,
  paisesPorAlias: ReadonlyMap<string, PaisExtranjero>,
): Set<string> {
  const presentes = new Set<string>()
  for (const [alias, pais] of paisesPorAlias) {
    if (alias.length >= 3 && contieneFrase(textoNormalizado, alias)) {
      presentes.add(pais.nombre)
    }
  }
  return presentes
}

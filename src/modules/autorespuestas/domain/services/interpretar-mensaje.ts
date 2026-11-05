import {
  buscarProductosLocal,
  resolverUbicacionLocal,
} from '../../../../shared/catalogos/consultas.js'
import {
  extraerModelos,
  type CoincidenciaProducto,
} from '../../../../shared/catalogos/productos/index.js'
import type { ContextoMensajeLead } from '../types/contexto-mensaje-lead.js'
import type {
  ContextoProductoLead,
  ProductoLead,
  SugerenciaProductoLead,
  UbicacionLead,
} from '../types/datos-lead.js'
import { clasificarIntencion, type IntencionLead } from './clasificar-intencion.js'
import {
  detectarReferenciaProducto,
  type ReferenciaProducto,
} from './detectar-referencia-producto.js'
import {
  aUbicacionLead,
  esAgregadoDeProductos,
  esCorreccionDeProductos,
  esCtaGlobal,
  extraerCantidadAproximada,
  extraerProductosMensaje,
  extraerUbicacionMensaje,
  formatearCandidatosProductos,
  formatearProductos,
  mencionaProducto,
  normalizarProducto,
  parecerUbicacionAislada,
  type OperacionProductos as OperacionProductosExtraidos,
  type ResultadoProductosMensaje,
  type ResultadoUbicacionMensaje,
} from './extraer-datos-lead.js'
import {
  buscarCantidades,
  esCantidadAislada,
  interpretarCantidad,
  type ResultadoCantidad,
} from './interpretar-cantidad.js'
import { normalizarTexto, quitarPuntuacion } from './normalizar-texto.js'
import { esSolicitudProductoSuficiente, validarCorreo, validarNombre } from './validar-datos.js'

export type DatosInterpretados = {
  nombre: string | null
  nombreRechazado: boolean
  correo: string | null
  productos: readonly ProductoLead[]
  solicitudProductoTexto: string | null
  cantidad: number | null
  cantidadAproximada: string | null
  ubicacion: UbicacionLead | null
}

export type OperacionProductos = 'agregar' | 'reemplazar' | null

export type InterpretacionMensaje = {
  datos: DatosInterpretados
  error: string | null
  variables: Record<string, string>
  intencion: IntencionLead
  esSaludo: boolean
  operacionProductos: OperacionProductos
  categoriaProducto: string | null
  candidatosProducto: readonly CoincidenciaProducto[]
}

export type SugerenciasInterpretacion = {
  nombre?: string | null
  correo?: string | null
  productos?: readonly { nombre: string; cantidad?: number | null }[]
  operacionProductos?: 'agregar' | 'reemplazar' | null
  cantidad?: number | null
  ciudad?: string | null
}

const PATRON_CORRECCION_CANTIDAD =
  /\b(?:en realidad|mejor|corrijo|corregir|cantidad es|serian|seran|son|total)\b/iu

const PATRON_MARCA_UBICACION =
  /\b(?:mi ciudad es|mi ubicacion es|vivo en|vive en|vives en|estoy en|estamos en|trabajo en|radico en|soy de|somos de|ciudad de|municipio de|entrega en|entregar en|envio a|me encuentro en|para|hacia)\b/iu

export function interpretarMensaje(
  contexto: ContextoMensajeLead,
  sugerencias: SugerenciasInterpretacion = {},
): InterpretacionMensaje {
  const { lead } = contexto
  const limpio = contexto.texto.trim()
  const intencion = clasificarIntencion(limpio)
  const esSaludo = intencion === 'saludo'
  const datos = datosVacios()
  const variables: Record<string, string> = {}

  if (limpio.length === 0 || intencion === 'sin_contenido') {
    return {
      datos,
      error: null,
      variables,
      intencion,
      esSaludo: false,
      operacionProductos: null,
      categoriaProducto: null,
      candidatosProducto: [],
    }
  }

  if (intencion === 'solicitud_humano') {
    return {
      datos,
      error: null,
      variables,
      intencion,
      esSaludo: false,
      operacionProductos: null,
      categoriaProducto: null,
      candidatosProducto: [],
    }
  }

  const errores = {
    nombre: null as string | null,
    correo: null as string | null,
    producto: null as string | null,
    cantidad: null as string | null,
    ubicacion: null as string | null,
  }

  interpretarCorreo(limpio, sugerencias, datos, errores)
  interpretarNombre(contexto, sugerencias, intencion, datos, errores)
  interpretarUbicacion(contexto, sugerencias, datos, errores, variables)
  const productosInterpretados = interpretarProductos(
    contexto,
    sugerencias,
    intencion,
    datos,
    errores,
    variables,
  )
  interpretarCantidadMensaje(contexto, sugerencias, datos, errores, variables)
  ajustarCantidadDesdeProductos(datos)

  const otrosDatos = tieneOtrosDatos(datos)
  const intentaResponder = intencion !== 'saludo' && intencion !== 'agradecimiento'
  const intencionSinProducto =
    intencion === 'aclaracion' ||
    intencion === 'solicitud_orientacion' ||
    intencion === 'referencia_producto' ||
    intencion === 'negacion'
  if (intentaResponder && !otrosDatos) {
    if (lead.pasoActual === 'correo' && errores.correo === null) {
      errores.correo = 'correo_invalido'
    }
    if (lead.pasoActual === 'nombre' && errores.nombre === null) {
      errores.nombre = 'nombre_invalido'
    }
    if (lead.pasoActual === 'modelos' && errores.producto === null && !intencionSinProducto) {
      errores.producto = 'producto_invalido'
    }
    if (
      lead.pasoActual === 'ciudad' &&
      lead.estado !== 'fuera_de_cobertura' &&
      errores.ubicacion === null
    ) {
      errores.ubicacion = 'ubicacion_invalida'
    }
  }

  const error = seleccionarError(lead.pasoActual, errores, intencion)
  const operacionProductos =
    productosInterpretados.operacion ??
    (datos.productos.length > 0 || datos.solicitudProductoTexto !== null
      ? resolverOperacionSugerida(sugerencias, contexto)
      : null)

  variables.nombre = datos.nombre ?? ''
  variables.correo = datos.correo ?? ''
  variables.productos =
    formatearProductos(
      datos.productos,
      datos.productos.every((producto) => producto.cantidad !== null),
    ) ??
    datos.solicitudProductoTexto ??
    ''
  variables.cantidad = datos.cantidad?.toString() ?? datos.cantidadAproximada ?? ''
  variables.ciudad = datos.ubicacion?.nombreMostrado ?? ''

  return {
    datos,
    error,
    variables,
    intencion,
    esSaludo,
    operacionProductos,
    categoriaProducto: productosInterpretados.categoria,
    candidatosProducto: productosInterpretados.candidatos,
  }
}

function interpretarCorreo(
  texto: string,
  sugerencias: SugerenciasInterpretacion,
  datos: DatosInterpretados,
  errores: ErroresInterpretacion,
): void {
  const correo = validarCorreo(texto)
  if (correo.valido) {
    datos.correo = correo.correo
    return
  }
  if (correo.motivo === 'multiple') {
    errores.correo = 'correo_ambiguo'
    return
  }

  const sugerido = sugerencias.correo?.trim()
  if (!sugerido || !texto.toLowerCase().includes(sugerido.toLowerCase())) {
    return
  }
  const validado = validarCorreo(sugerido)
  if (validado.valido) {
    datos.correo = validado.correo
  }
}

function interpretarNombre(
  contexto: ContextoMensajeLead,
  sugerencias: SugerenciasInterpretacion,
  intencion: IntencionLead,
  datos: DatosInterpretados,
  errores: ErroresInterpretacion,
): void {
  const { lead } = contexto
  const texto = contexto.texto.trim()
  const esPasoNombre = lead.pasoActual === 'nombre'

  const explicito = validarNombre(texto, {
    aceptarTextoSimple: false,
    permitirRechazo: esPasoNombre,
  })
  if (explicito.valido) {
    if (explicito.rechazado) {
      datos.nombreRechazado = true
    } else {
      datos.nombre = explicito.nombre
    }
    return
  }

  if (esPasoNombre && intencion !== 'saludo' && intencion !== 'agradecimiento') {
    const simple = validarNombre(texto, {
      aceptarTextoSimple: true,
      permitirRechazo: true,
    })
    if (simple.valido) {
      if (simple.rechazado) {
        datos.nombreRechazado = true
      } else {
        datos.nombre = simple.nombre
      }
      return
    }
  }

  const sugerido = sugerencias.nombre?.trim()
  if (!esPasoNombre || !sugerido || !sugerenciaPresente(sugerido, texto)) {
    return
  }
  const validado = validarNombre(sugerido, {
    aceptarTextoSimple: true,
    permitirRechazo: false,
  })
  if (validado.valido && !validado.rechazado) {
    datos.nombre = validado.nombre
    errores.nombre = null
  }
}

function interpretarUbicacion(
  contexto: ContextoMensajeLead,
  sugerencias: SugerenciasInterpretacion,
  datos: DatosInterpretados,
  errores: ErroresInterpretacion,
  variables: Record<string, string>,
): void {
  const { lead } = contexto
  const texto = contexto.texto.trim()
  const esPasoCiudad = lead.pasoActual === 'ciudad'
  const buscarEnTexto =
    esPasoCiudad ||
    lead.estado === 'fuera_de_cobertura' ||
    PATRON_MARCA_UBICACION.test(quitarPuntuacion(normalizarTexto(texto))) ||
    parecerUbicacionAislada(texto)

  const sugerida = sugerencias.ciudad?.trim()
  const sugerenciaFundamentada =
    sugerida !== undefined && sugerida.length > 0 && sugerenciaPresente(sugerida, texto)

  if (!buscarEnTexto && !sugerenciaFundamentada) {
    return
  }

  if (buscarEnTexto) {
    const resultado = extraerUbicacionMensaje(texto, {
      aceptarTextoSimple: esPasoCiudad,
      buscarEnTexto: true,
    })
    aplicarResultadoUbicacion(resultado, datos, errores, variables)
  }

  if (
    datos.ubicacion !== null ||
    errores.ubicacion !== null ||
    !sugerida ||
    !sugerenciaFundamentada
  ) {
    return
  }

  // La sugerencia de la IA tambien pasa por el catalogo geografico local.
  aplicarResultadoUbicacion(desdeUbicacionSugerida(sugerida), datos, errores, variables)
}

function aplicarResultadoUbicacion(
  resultado: ResultadoUbicacionMensaje,
  datos: DatosInterpretados,
  errores: ErroresInterpretacion,
  variables: Record<string, string>,
): void {
  switch (resultado.tipo) {
    case 'mexicana':
      datos.ubicacion = resultado.ubicacion
      return
    case 'extranjera':
      datos.ubicacion = resultado.ubicacion
      return
    case 'incompleta':
      datos.ubicacion = resultado.ubicacion
      errores.ubicacion = 'ubicacion_incompleta'
      variables.ciudad = resultado.ubicacion.nombreMostrado
      return
    case 'ambigua':
      errores.ubicacion = 'ubicacion_ambigua'
      variables.candidatos = resultado.candidatos
        .map((candidato) => candidato.nombreMostrado)
        .join('; ')
      return
    case 'ninguna':
      return
  }
}

function desdeUbicacionSugerida(texto: string): ResultadoUbicacionMensaje {
  const resultado = resolverUbicacionLocal(texto)
  switch (resultado.tipo) {
    case 'mexicana': {
      const ubicacion = aUbicacionLead(resultado.ubicacion)
      return resultado.ubicacion.completa
        ? { tipo: 'mexicana', ubicacion }
        : { tipo: 'incompleta', ubicacion }
    }
    case 'extranjera':
      return { tipo: 'extranjera', ubicacion: aUbicacionLead(resultado.ubicacion) }
    case 'ambigua':
      return {
        tipo: 'ambigua',
        candidatos: resultado.candidatos.map(aUbicacionLead),
      }
    case 'no_reconocida':
      return { tipo: 'ninguna' }
  }
}

type ProductosInterpretados = {
  operacion: OperacionProductosExtraidos | null
  categoria: string | null
  candidatos: readonly CoincidenciaProducto[]
}

function interpretarProductos(
  contexto: ContextoMensajeLead,
  sugerencias: SugerenciasInterpretacion,
  intencion: IntencionLead,
  datos: DatosInterpretados,
  errores: ErroresInterpretacion,
  variables: Record<string, string>,
): ProductosInterpretados {
  const { lead } = contexto
  const texto = contexto.texto.trim()
  const esPasoCantidad = lead.pasoActual === 'cantidad'
  const debeBuscar =
    lead.pasoActual === 'modelos' ||
    esPasoCantidad ||
    contexto.esPrimerMensaje ||
    esCorreccionDeProductos(texto) ||
    esAgregadoDeProductos(texto) ||
    esCtaGlobal(texto) ||
    mencionaProducto(texto)

  let operacion: OperacionProductosExtraidos | null = null
  let candidatosAmbiguos: readonly CoincidenciaProducto[] = []
  let categoria: string | null = null

  // El bot acaba de ofrecer una sola alternativa de producto y el cliente
  // responde "si": no hay ambiguedad que resolver, se acepta esa sugerencia.
  if (
    intencion === 'confirmacion' &&
    lead.aclaracionPendiente === 'producto' &&
    lead.contextoProducto.sugerencias.length === 1
  ) {
    const unica = lead.contextoProducto.sugerencias[0]
    if (unica !== undefined) {
      datos.productos = [{ nombre: unica.nombre, url: unica.url, cantidad: null }]
      operacion =
        lead.productosCatalogo.length > 0 ||
        lead.solicitudProductoTexto !== null ||
        lead.pasoActual === 'cantidad'
          ? 'agregar'
          : 'reemplazar'
      return { operacion, categoria, candidatos: [] }
    }
  }

  if (intencion === 'referencia_producto') {
    const referencia = detectarReferenciaProducto(texto)
    const contextoProducto = lead.contextoProducto
    const seleccion = seleccionarSugerencia(referencia, contextoProducto)
    if (seleccion !== null) {
      datos.productos = [
        {
          nombre: seleccion.nombre,
          url: seleccion.url,
          cantidad: null,
        },
      ]
      operacion =
        lead.productosCatalogo.length > 0 ||
        lead.solicitudProductoTexto !== null ||
        lead.pasoActual === 'cantidad'
          ? 'agregar'
          : 'reemplazar'
      return { operacion, categoria, candidatos: [] }
    }

    const consulta =
      contextoProducto.ultimaConsulta ?? contextoProducto.sugerencias[0]?.nombre ?? null
    if (referencia === 'ese' || referencia === 'segundo' || referencia === 'primero') {
      errores.producto = 'producto_referencia_aclarar'
      variables.candidatos = contextoProducto.sugerencias.map((item) => item.nombre).join('; ')
      return { operacion, categoria, candidatos: [] }
    }
    if (consulta !== null) {
      const consultaAlternativas =
        referencia === 'misma_marca' && contextoProducto.ultimaMarca !== null
          ? `${contextoProducto.ultimaMarca} ${consulta}`
          : consulta
      const excluirIds = [
        ...contextoProducto.rechazados,
        ...contextoProducto.sugerencias.map((sugerencia) => sugerencia.id),
      ]
      const alternativas = buscarProductosLocal(consultaAlternativas, {
        limite: 3,
        excluirIds,
      })
      if (alternativas.tipo === 'ambiguo' && alternativas.candidatos.length > 0) {
        candidatosAmbiguos = alternativas.candidatos
        errores.producto = 'producto_referencia'
        variables.candidatos = formatearCandidatosProductos(candidatosAmbiguos)
        return { operacion, categoria, candidatos: candidatosAmbiguos }
      }
      if (alternativas.tipo === 'confirmado' && alternativas.coincidencias.length > 0) {
        candidatosAmbiguos = alternativas.coincidencias
        errores.producto = 'producto_referencia'
        variables.candidatos = formatearCandidatosProductos(candidatosAmbiguos)
        return { operacion, categoria, candidatos: candidatosAmbiguos }
      }
    }

    errores.producto = 'producto_referencia_vacia'
    return { operacion, categoria, candidatos: [] }
  }

  if (debeBuscar) {
    const resultado = extraerProductosMensaje(texto, {
      pasoActual: lead.pasoActual,
      esPrimerMensaje: contexto.esPrimerMensaje,
      nombre: datos.nombre ?? lead.nombre,
      correo: datos.correo ?? lead.correo,
      ubicacion: datos.ubicacion ?? lead.ubicacion,
    })
    const aplica = debeAplicarProductos(
      resultado,
      lead.productosCatalogo,
      lead.solicitudProductoTexto,
      texto,
      esPasoCantidad,
    )
    if (aplica) {
      aplicarResultadoProductos(resultado, datos, errores, variables)
      if (resultado.tipo === 'confirmado' || resultado.tipo === 'suficiente') {
        operacion = resultado.operacion
      }
      if (resultado.tipo === 'ambiguo') {
        candidatosAmbiguos = resultado.candidatos
        variables.consultaProducto = resultado.consulta
      }
      if (resultado.tipo === 'categoria') {
        categoria = resultado.categoria
        variables.categoria = resultado.categoria
      }
    }
  }

  if (datos.productos.length === 0 && datos.solicitudProductoTexto === null) {
    const sugeridos = productosDesdeSugerencias(texto, sugerencias)
    if (sugeridos.productos.length > 0) {
      datos.productos = sugeridos.productos
      operacion = sugeridos.operacion ?? operacion
    } else if (sugeridos.solicitud !== null) {
      datos.solicitudProductoTexto = sugeridos.solicitud
      operacion = sugeridos.operacion ?? operacion
    }
    if (sugeridos.ambiguos.length > 0) {
      candidatosAmbiguos = sugeridos.ambiguos
    }
  }

  if (candidatosAmbiguos.length > 0 && datos.productos.length === 0) {
    errores.producto = 'producto_ambiguo'
    variables.candidatos = formatearCandidatosProductos(candidatosAmbiguos)
    return { operacion, categoria, candidatos: candidatosAmbiguos }
  }

  const esPasoProducto = lead.pasoActual === 'modelos'
  const intentaResponder =
    intencion !== 'saludo' &&
    intencion !== 'agradecimiento' &&
    intencion !== 'aclaracion' &&
    intencion !== 'solicitud_orientacion' &&
    intencion !== 'negacion'
  if (
    esPasoProducto &&
    intentaResponder &&
    datos.productos.length === 0 &&
    datos.solicitudProductoTexto === null &&
    errores.producto === null
  ) {
    errores.producto = 'producto_invalido'
  }

  return { operacion, categoria, candidatos: candidatosAmbiguos }
}

function aplicarResultadoProductos(
  resultado: ResultadoProductosMensaje,
  datos: DatosInterpretados,
  errores: ErroresInterpretacion,
  variables: Record<string, string>,
): void {
  switch (resultado.tipo) {
    case 'confirmado':
      datos.productos = resultado.productos
      return
    case 'suficiente':
      datos.solicitudProductoTexto = resultado.solicitud
      variables.consultaProducto = resultado.consulta
      return
    case 'categoria':
      variables.consultaProducto = resultado.consulta
      return
    case 'ambiguo':
      variables.candidatos = formatearCandidatosProductos(resultado.candidatos)
      errores.producto = 'producto_ambiguo'
      return
    case 'ninguno':
      return
  }
}

function seleccionarSugerencia(
  referencia: ReferenciaProducto | null,
  contexto: ContextoProductoLead,
): SugerenciaProductoLead | null {
  if (referencia === null || contexto.sugerencias.length === 0) {
    return null
  }
  const primera = contexto.sugerencias[0]
  switch (referencia) {
    case 'primero':
      return primera ?? null
    case 'ese':
      return contexto.sugerencias.length === 1 ? (primera ?? null) : null
    case 'segundo':
      return contexto.sugerencias[1] ?? null
    case 'otro':
    case 'diferente':
    case 'ese_no':
    case 'misma_marca':
      return null
  }
}

function productosDesdeSugerencias(
  texto: string,
  sugerencias: SugerenciasInterpretacion,
): {
  productos: ProductoLead[]
  solicitud: string | null
  ambiguos: CoincidenciaProducto[]
  operacion: OperacionProductosExtraidos | null
} {
  const productos: ProductoLead[] = []
  const ambiguos: CoincidenciaProducto[] = []
  let solicitud: string | null = null

  for (const sugerencia of sugerencias.productos ?? []) {
    const nombre = sugerencia.nombre.trim()
    if (nombre.length === 0 || !productoSugeridoRespaldado(nombre, texto)) {
      continue
    }
    const busqueda = buscarProductosLocal(nombre)
    if (busqueda.tipo === 'confirmado') {
      const cantidad = cantidadSugeridaValida(texto, sugerencia.cantidad)
      for (const coincidencia of busqueda.coincidencias) {
        productos.push({
          nombre: coincidencia.producto.nombre,
          url: coincidencia.producto.url,
          cantidad,
        })
      }
    } else if (busqueda.tipo === 'ambiguo') {
      ambiguos.push(...busqueda.candidatos)
    } else if (solicitud === null && esSolicitudProductoSuficiente(nombre)) {
      solicitud = nombre
    }
  }

  const operacion = sugerencias.operacionProductos ?? null
  return {
    productos: deduplicarProductos(productos),
    solicitud,
    ambiguos,
    operacion,
  }
}

function interpretarCantidadMensaje(
  contexto: ContextoMensajeLead,
  sugerencias: SugerenciasInterpretacion,
  datos: DatosInterpretados,
  errores: ErroresInterpretacion,
  variables: Record<string, string>,
): void {
  const { lead } = contexto
  const texto = contexto.texto.trim()
  const resultado = interpretarCantidad(texto)
  const esPasoCantidad = lead.pasoActual === 'cantidad'
  const hayProductos = datos.productos.length > 0 || datos.solicitudProductoTexto !== null
  const esCorreccion = PATRON_CORRECCION_CANTIDAD.test(quitarPuntuacion(normalizarTexto(texto)))

  const cantidadDeterminista = resultado.tipo === 'valida' ? resultado.valor : null
  // La cantidad sugerida por la IA solo se acepta si el texto la respalda como
  // cantidad real (no una medida tecnica ni parte de un modelo).
  const cantidadSugerida =
    cantidadDeterminista === null && (resultado.tipo === 'ausente' || resultado.tipo === 'tecnica')
      ? cantidadSugeridaValida(texto, sugerencias.cantidad)
      : null
  const cantidad = cantidadDeterminista ?? cantidadSugerida
  // Una cantidad aislada ("90", "serian 90 piezas") se conserva como dato
  // preliminar aunque el producto aun no este confirmado. No se asocia a un
  // modelo hasta que exista una coincidencia real.
  const cantidadAislada = esCantidadAislada(texto)

  if (cantidad !== null && (esPasoCantidad || hayProductos || esCorreccion || cantidadAislada)) {
    datos.cantidad = cantidad
    datos.cantidadAproximada = extraerCantidadAproximada(texto)
    variables.cantidad = cantidad.toString()
    return
  }

  if (esPasoCantidad && errores.producto === null) {
    if (resultado.tipo === 'ausente') {
      if (!hayProductos) {
        errores.cantidad = 'cantidad_invalida'
      }
    } else if (resultado.tipo !== 'valida') {
      // Un mensaje que agrega o corrige un producto puede incluir numeros de
      // modelo (BC-1R, FSP-951): no son una cantidad tecnica ni deben impedir
      // que el producto se registre. La cantidad se pedira en el siguiente paso.
      if (!hayProductos && !(esCorreccion && resultado.tipo === 'tecnica')) {
        errores.cantidad = claveErrorCantidad(resultado)
      }
    }
  } else if (
    esCorreccion &&
    resultado.tipo !== 'valida' &&
    resultado.tipo !== 'ausente' &&
    resultado.tipo !== 'tecnica'
  ) {
    errores.cantidad = claveErrorCantidad(resultado)
  }
}

function cantidadSugeridaValida(texto: string, cantidad: number | null | undefined): number | null {
  if (typeof cantidad !== 'number' || !Number.isInteger(cantidad) || cantidad <= 0) {
    return null
  }
  const respaldo = buscarCantidades(texto).some(
    (coincidencia) =>
      coincidencia.valor === cantidad && !coincidencia.tecnica && !coincidencia.referencia,
  )
  return respaldo ? cantidad : null
}

function ajustarCantidadDesdeProductos(datos: DatosInterpretados): void {
  if (datos.productos.length === 0) {
    return
  }
  if (datos.cantidad === null && datos.productos.every((producto) => producto.cantidad !== null)) {
    datos.cantidad = datos.productos.reduce(
      (total, producto) => total + (producto.cantidad ?? 0),
      0,
    )
    return
  }
  if (datos.cantidad !== null && datos.productos.length === 1) {
    const producto = datos.productos[0]
    if (producto && producto.cantidad === null) {
      datos.productos = [{ ...producto, cantidad: datos.cantidad }]
    }
  }
}

function seleccionarError(
  paso: string,
  errores: ErroresInterpretacion,
  intencion: IntencionLead,
): string | null {
  if (errores.correo === 'correo_ambiguo') {
    return errores.correo
  }
  if (
    errores.producto === 'producto_referencia' ||
    errores.producto === 'producto_referencia_vacia'
  ) {
    return errores.producto
  }
  if (paso === 'nombre' && errores.nombre) {
    return errores.nombre
  }
  if (paso === 'correo' && errores.correo) {
    return errores.correo
  }
  if (paso === 'modelos' && errores.producto) {
    return errores.producto
  }
  if (paso === 'cantidad' && errores.producto) {
    return errores.producto
  }
  if (paso === 'cantidad' && errores.cantidad) {
    return errores.cantidad
  }
  if (paso === 'ciudad' && errores.ubicacion) {
    return errores.ubicacion
  }
  if (intencion === 'correccion' && errores.cantidad) {
    return errores.cantidad
  }
  return null
}

function tieneOtrosDatos(datos: DatosInterpretados): boolean {
  return (
    datos.nombre !== null ||
    datos.nombreRechazado ||
    datos.correo !== null ||
    datos.productos.length > 0 ||
    datos.solicitudProductoTexto !== null ||
    datos.cantidad !== null ||
    datos.ubicacion !== null
  )
}

function resolverOperacionSugerida(
  sugerencias: SugerenciasInterpretacion,
  contexto: ContextoMensajeLead,
): OperacionProductos {
  if (sugerencias.operacionProductos) {
    return sugerencias.operacionProductos
  }
  const texto = contexto.texto
  if (esCorreccionDeProductos(texto)) {
    return 'reemplazar'
  }
  if (
    esAgregadoDeProductos(texto) ||
    contexto.lead.modelos !== null ||
    contexto.lead.productosCatalogo.length > 0
  ) {
    return 'agregar'
  }
  return 'reemplazar'
}

function sugerenciaPresente(sugerencia: string, texto: string): boolean {
  const tokens = normalizarTexto(quitarPuntuacion(sugerencia))
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !PALABRAS_NEUTRAS.has(token))
  if (tokens.length === 0) {
    return false
  }
  const textoNormalizado = normalizarTexto(quitarPuntuacion(texto))
  const coincidencias = tokens.filter((token) => textoNormalizado.includes(token))
  const modelo = tokens.some((token) => /\d/u.test(token) && textoNormalizado.includes(token))
  return modelo || coincidencias.length >= 2 || (tokens.length === 1 && coincidencias.length === 1)
}

/**
 * Una sugerencia de producto de la IA solo se acepta si el cliente menciono el
 * producto completo, su modelo, o una parte sustancial de sus palabras. Asi se
 * evita que la IA convierta "estaciones manuales" en un modelo especifico que
 * nunca aparecio en la conversacion.
 */
function productoSugeridoRespaldado(nombre: string, texto: string): boolean {
  const nombreNormalizado = normalizarTexto(quitarPuntuacion(nombre))
  const textoNormalizado = normalizarTexto(quitarPuntuacion(texto))
  if (nombreNormalizado.length === 0 || textoNormalizado.length === 0) {
    return false
  }
  if (textoNormalizado.includes(nombreNormalizado)) {
    return true
  }

  const modelosTexto = new Set(extraerModelos(texto))
  if (extraerModelos(nombre).some((modelo) => modelosTexto.has(modelo))) {
    return true
  }

  const tokens = nombreNormalizado
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !PALABRAS_NEUTRAS.has(token))
  if (tokens.length < 2) {
    return false
  }
  const coincidencias = tokens.filter((token) => textoNormalizado.includes(token))
  return coincidencias.length / tokens.length >= 0.75
}

function deduplicarProductos(productos: readonly ProductoLead[]): ProductoLead[] {
  const vistos = new Set<string>()
  const resultado: ProductoLead[] = []
  for (const producto of productos) {
    const clave = producto.url ?? normalizarTexto(producto.nombre)
    if (vistos.has(clave)) {
      continue
    }
    vistos.add(clave)
    resultado.push(producto)
  }
  return resultado
}

function debeAplicarProductos(
  resultado: ResultadoProductosMensaje,
  productosLead: readonly ProductoLead[],
  solicitudLead: string | null,
  texto: string,
  esPasoCantidad: boolean,
): boolean {
  if (!esPasoCantidad) {
    return true
  }

  const esAgregado = esAgregadoDeProductos(texto)
  const esCorreccion = esCorreccionDeProductos(texto)

  if (resultado.tipo === 'ambiguo') {
    // "6 detectores" en el paso de cantidad suele ser una respuesta de cantidad
    // sobre el producto ya registrado, no un producto nuevo.
    return !(interpretarCantidad(texto).tipo === 'valida' && !esAgregado && !esCorreccion)
  }

  if (resultado.tipo === 'confirmado') {
    const hayProductoNuevo = resultado.productos.some(
      (producto) => !productoYaRegistrado(productosLead, producto),
    )
    return hayProductoNuevo || esAgregado || esCorreccion
  }

  if (resultado.tipo === 'suficiente') {
    const esSolicitudNueva =
      solicitudLead === null ||
      normalizarProducto(solicitudLead) !== normalizarProducto(resultado.solicitud)
    return esSolicitudNueva || esAgregado || esCorreccion
  }

  return true
}

function productoYaRegistrado(
  productosLead: readonly ProductoLead[],
  producto: ProductoLead,
): boolean {
  return productosLead.some(
    (existente) =>
      (existente.url !== null && existente.url === producto.url) ||
      normalizarProducto(existente.nombre) === normalizarProducto(producto.nombre),
  )
}

function datosVacios(): DatosInterpretados {
  return {
    nombre: null,
    nombreRechazado: false,
    correo: null,
    productos: [],
    solicitudProductoTexto: null,
    cantidad: null,
    cantidadAproximada: null,
    ubicacion: null,
  }
}

type ErroresInterpretacion = {
  nombre: string | null
  correo: string | null
  producto: string | null
  cantidad: string | null
  ubicacion: string | null
}

const PALABRAS_NEUTRAS = new Set([
  'del',
  'las',
  'los',
  'para',
  'por',
  'con',
  'una',
  'uno',
  'unos',
  'unas',
  'que',
])

export function claveErrorCantidad(cantidad: ResultadoCantidad): string {
  switch (cantidad.tipo) {
    case 'rango':
      return 'cantidad_rango'
    case 'tecnica':
      return 'cantidad_tecnica'
    case 'multiple':
    case 'ambigua':
      return 'cantidad_ambigua'
    case 'ausente':
      return 'cantidad_invalida'
    case 'valida':
      return 'cantidad_invalida'
  }
}

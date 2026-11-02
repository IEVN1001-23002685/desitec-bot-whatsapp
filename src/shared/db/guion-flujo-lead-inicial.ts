export type EntradaGuionInicial = {
  clave: string
  orden: number
  texto: string
}

export const TEXTO_PASO_A_ASESOR_ANTERIOR =
  'Entiendo. Una persona de nuestro equipo te atenderá en breve.'

export const TEXTO_PASO_A_ASESOR =
  'He registrado tu solicitud para atención humana. Un asesor revisará tu conversación.'

export const GUION_FLUJO_LEAD_INICIAL: EntradaGuionInicial[] = [
  {
    clave: 'bienvenida',
    orden: 1,
    texto:
      'Hola, gracias por escribir a Desitec. Soy el asistente virtual y te ayudo a cotizar. ¿Me compartes tu nombre?',
  },
  {
    clave: 'pedir_nombre',
    orden: 2,
    texto: '¿Me compartes tu nombre, por favor?',
  },
  {
    clave: 'pedir_correo',
    orden: 3,
    texto: 'Gracias. ¿Me compartes tu correo electrónico?',
  },
  {
    clave: 'correo_invalido',
    orden: 4,
    texto: 'El correo no parece válido. ¿Me lo compartes de nuevo, por favor?',
  },
  {
    clave: 'pedir_modelos',
    orden: 5,
    texto: '¿Qué modelos de productos te interesan?',
  },
  {
    clave: 'pedir_cantidad',
    orden: 6,
    texto: '¿Cuántas piezas necesitas en total?',
  },
  {
    clave: 'cantidad_invalida',
    orden: 7,
    texto: 'Necesito un número entero mayor a cero. ¿Cuántas piezas necesitas?',
  },
  {
    clave: 'pedir_ciudad',
    orden: 8,
    texto: '¿En qué ciudad o municipio de México te encuentras?',
  },
  {
    clave: 'confirmacion',
    orden: 9,
    texto: 'Gracias, ya tengo tus datos. Un asesor te contactará muy pronto.',
  },
  {
    clave: 'paso_a_asesor',
    orden: 10,
    texto: TEXTO_PASO_A_ASESOR,
  },
  {
    clave: 'correo_ambiguo',
    orden: 11,
    texto: 'Encontré más de un correo en tu mensaje. ¿Cuál de ellos debo usar?',
  },
  {
    clave: 'cantidad_rango',
    orden: 12,
    texto: 'Necesito una cantidad exacta, no un rango. ¿Cuántas piezas necesitas en total?',
  },
  {
    clave: 'cantidad_tecnica',
    orden: 13,
    texto: 'Ese número parece una especificación técnica. ¿Cuántas piezas necesitas en total?',
  },
  {
    clave: 'cantidad_ambigua',
    orden: 14,
    texto: 'Necesito una sola cantidad total. ¿Cuántas piezas necesitas?',
  },
  {
    clave: 'producto_agregado',
    orden: 15,
    texto: 'Agregué el producto a tu solicitud. ¿Cuántas piezas necesitas en total?',
  },
  {
    clave: 'productos_agregados',
    orden: 16,
    texto: 'Agregué los productos a tu solicitud. ¿Cuántas piezas necesitas en total?',
  },
  {
    clave: 'nombre_invalido',
    orden: 17,
    texto: 'No pude reconocer un nombre válido. ¿Me compartes solo tu nombre, por favor?',
  },
  {
    clave: 'producto_invalido',
    orden: 18,
    texto:
      'No reconocí el producto en tu mensaje. ¿Me compartes el nombre o modelo exacto del producto que necesitas?',
  },
  {
    clave: 'producto_ambiguo',
    orden: 19,
    texto: 'Encontré varios productos posibles: {{candidatos}}. ¿Cuál de ellos te interesa?',
  },
  {
    clave: 'producto_opcion',
    orden: 31,
    texto: 'Encontré esta opción: {{candidatos}}. ¿Es el producto que necesitas?',
  },
  {
    clave: 'producto_referencia_aclarar',
    orden: 32,
    texto:
      '¿Cuál producto quieres elegir? Indícame su nombre o su posición en las opciones ofrecidas: {{candidatos}}.',
  },
  {
    clave: 'producto_categoria',
    orden: 24,
    texto:
      '¡Hola! Claro, te ayudo a cotizar. ¿Qué tipo de {{categoria}} necesitas? Por ejemplo, extintores, detectores, rociadores u otro producto.',
  },
  {
    clave: 'aclaracion_producto',
    orden: 25,
    texto:
      'Tienes razón, todavía no hemos definido qué equipo necesitas. ¿Buscas extintores, detectores, rociadores u otro producto?',
  },
  {
    clave: 'orientacion_producto',
    orden: 26,
    texto: 'Claro, puedo orientarte. ¿Qué tipo de equipo o sistema estás buscando?',
  },
  {
    clave: 'producto_referencia',
    orden: 27,
    texto:
      'Claro, revisemos otras opciones: {{candidatos}}. ¿Cuál de estas alternativas te interesa?',
  },
  {
    clave: 'producto_referencia_vacia',
    orden: 28,
    texto:
      'Claro, revisemos otras opciones. ¿Buscas un panel de control, un detector, un rociador u otro equipo?',
  },
  {
    clave: 'producto_ayuda',
    orden: 29,
    texto:
      'Puedo ayudarte a identificarlo. ¿Es para una instalación nueva, para reemplazar un equipo o para un proyecto en cotización?',
  },
  {
    clave: 'orientacion_detalle',
    orden: 30,
    texto:
      'Para orientarte mejor: ¿qué necesitas proteger o qué problema quieres resolver? Con eso te propongo el tipo de equipo adecuado.',
  },
  {
    clave: 'ubicacion_invalida',
    orden: 20,
    texto: 'No reconocí esa ubicación en México. ¿Me compartes tu ciudad o municipio, por favor?',
  },
  {
    clave: 'ubicacion_ambigua',
    orden: 21,
    texto:
      'Encontré varias ubicaciones posibles: {{candidatos}}. ¿Cuál corresponde a tu ciudad de entrega?',
  },
  {
    clave: 'ubicacion_incompleta',
    orden: 22,
    texto:
      'Registré {{ciudad}}, pero necesito confirmar el municipio o localidad dentro de México para la entrega. ¿Me lo compartes?',
  },
  {
    clave: 'fuera_de_cobertura',
    orden: 23,
    texto:
      'Por ahora solo atendemos entregas dentro de México. Si tu entrega es en una ciudad mexicana, compárteme el municipio o localidad.',
  },
]

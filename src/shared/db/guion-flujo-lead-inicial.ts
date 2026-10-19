export type EntradaGuionInicial = {
  clave: string
  orden: number
  texto: string
}

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
    texto: '¿En qué ciudad te encuentras?',
  },
  {
    clave: 'confirmacion',
    orden: 9,
    texto: 'Gracias, ya tengo tus datos. Un asesor te contactará muy pronto.',
  },
]

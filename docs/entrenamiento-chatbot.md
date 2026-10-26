# Entrenamiento y límites del chatbot de leads

Guía operativa de la Fase 4 para entender qué reconoce el bot, qué guarda y
cuándo debe intervenir un asesor. El bot es determinista: no usa IA externa.

## Orden de decisión

1. Filtrar remitente permitido (`WHATSAPP_BOT_NUMEROS_PERMITIDOS`).
2. Ignorar conversaciones en `en_asesor` o fuera de `capturando`.
3. Detectar solicitud de atención humana.
4. Interpretar correcciones explícitas y datos del mensaje.
5. Guardar solo lo válido y pedir el primer dato faltante.
6. Enviar una sola respuesta por mensaje.

## Datos que captura

- **Nombre:** “Ana”, “soy Ana”, “me llamo Ana”, “mi nombre es Ana”.
- **Correo:** uno o varios correos dentro del texto; se normaliza a minúsculas.
  Si hay más de uno distinto, pide aclaración.
- **Productos:** frases como “necesito cotizar 6 estaciones manuales” o
  “2 gabinetes y 6 estaciones manuales”.
- **Cantidad:** números enteros positivos en dígitos o palabras (“6”, “seis”,
  “unas 6”, “7 piezas”). Rechaza rangos, decimales, cero, negativos y números
  técnicos como “500 GPM”.
- **Ciudad:** “para Querétaro”, “en Puebla”, “soy de Monterrey”, “vivo en León”,
  o el texto simple cuando el bot ya pregunta la ciudad.

## Primer mensaje

El bot intenta capturar todo lo que venga en el primer mensaje y solo pregunta lo
que falte. Ejemplos:

- “Hola, necesito cotizar 6 estaciones manuales para Querétaro”
  → guarda producto, cantidad y ciudad; pregunta el nombre.
- “Hola, soy Ana, mi correo es ana@example.com, necesito 2 gabinetes y 6
  estaciones manuales para Querétaro”
  → guarda todo y confirma.
- “Hola, soy Ana” → guarda el nombre y pregunta el correo.
- «Quiero información del producto: Garrett Arco Detector de Metales PD 6500i»
  → guarda ese producto y pregunta el nombre; no envía ficha ni información.
- «Hola, me gustaría recibir asesoría de un especialista para elegir la solución
  adecuada. ¿Me pueden apoyar?» → no guarda producto ni deriva a asesor; inicia la
  captura pidiendo el nombre.

## Productos y cantidades

- `leads.modelos` conserva el detalle: `gabinetes (2); estaciones manuales (6)`.
- `leads.cantidad` guarda el total: 8.
- Si no todas las cantidades son explícitas, no se asume ninguna: se pide el
  total.
- En el paso de cantidad, “Gabinete” agrega el producto a la lista y vuelve a
  pedir el total.
- Varios modelos en un mismo mensaje (“Modelo Y y Modelo Z”) se guardan en la
  lista.
- Si el cliente corrige (“en realidad son 6”), se actualiza el total sin
  reiniciar el flujo.
- Si corrige un solo modelo (“en realidad el modelo es Modelo Y”, “mejor el modelo
  Y”, “corrige el modelo a Modelo Y”), se reemplaza `modelos` y se conserva la
  cantidad actual, salvo que el mismo mensaje incluya una cantidad nueva.
- Si corrige varios modelos (“mejor los modelos Modelo Y y Modelo Z”), se agregan
  a la lista existente y se vuelve a pedir el total.

## Correos ambiguos

- “ana@example.com” → válido.
- “ana@example.com, pedro@example.com” → pide aclaración.
- “correo-malo” o “ana@example” → correo inválido.
- Los correos dentro de una oración se reconocen sin arrastrar la puntuación.

## Atención humana

Se deriva a un asesor cuando el cliente pide explícitamente una persona, asesor,
agente, ejecutivo, representante, vendedor o atención personalizada, incluso con
variantes como “me gustaría una persona” o “que me llamen”.

No se deriva por:

- “No necesito hablar con un asesor”.
- “Modelo Ejecutivo”.
- “Persona moral” o “persona física”.
- “Recursos humanos”.
- Un correo que contiene palabras como “asesor”.
- El CTA global «Quiero asesoría de un especialista para elegir la solución
  adecuada»: inicia la captura normal, no deriva automáticamente.

Al derivar, el lead pasa a `en_asesor`, conserva sus datos, se pausan sus
seguimientos y el bot deja de responder esa conversación. El texto es:

> He registrado tu solicitud para atención humana. Un asesor revisará tu
> conversación.

## Límites conocidos

- No hay cantidades separadas por producto en PostgreSQL: el detalle vive en
  `modelos` y el total en `cantidad`.
- No se reabre automáticamente un lead `listo_pipedrive` ni se saca de
  `en_asesor`.
- La interpretación es por reglas: frases muy ambiguas o productos fuera del
  léxico pueden requerir un mensaje de aclaración o intervención humana.
- No se envían mensajes reales con `WHATSAPP_DRY_RUN=true`.

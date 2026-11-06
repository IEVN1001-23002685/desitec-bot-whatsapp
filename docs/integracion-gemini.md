# Integración opcional con Google Gemini

Esta capa permite que Gemini interprete mensajes ambiguos del bot de captura de
leads. **No reemplaza** las reglas deterministas, la persistencia, la máquina de
estados ni los envíos: solo propone datos que el motor existente vuelve a validar.

- Proveedor único: Google Gemini mediante el SDK oficial `@google/genai`.
- La IA no persiste, no envía mensajes, no cambia de estado y no aprueba
  `listo_pipedrive`.
- Las respuestas comerciales siguen saliendo del guion editable de PostgreSQL
  (`guion_flujo_lead`).
- `IA_ACTIVA` es independiente de `WHATSAPP_BOT_ACTIVO`: activar la IA no activa
  el bot, y el bot puede funcionar sin IA.

## Flujo

```text
mensaje entrante
  └─ ProcesarMensajeAutorespuesta
       └─ InterpretarMensajeLead
            1. interpretarMensaje + aplicarInterpretacion (determinista)
            2. ¿el mensaje quedó ambiguo? ──no──▶ se usa el resultado determinista
            3. sí ──▶ InterpreteConversacionalIA
                        └─ ProveedorGeminiInterpretacion (Gemini)
            4. sugerencias vuelven a pasar por interpretarMensaje/aplicarInterpretacion
            5. salvaguardas: estado, completado, regresión y mejora real
            6. se conserva el resultado determinista o se aplica el asistido
       └─ una sola escritura en `leads` y un solo envío por `EnviarMensajeSaliente`
```

### Cuándo se consulta a Gemini

Solo cuando la interpretación determinista no entendió el mensaje:

- `claveRespuesta` es `nombre_invalido`, `correo_invalido`, `correo_ambiguo`,
  `cantidad_invalida`, `producto_invalido` o `producto_referencia`;
- o la intención es `correccion` y no hubo cambios relevantes.

Nunca se consulta para saludos, agradecimientos, solicitudes de atención humana,
estados finales (`listo_pipedrive`) ni mensajes que el determinista ya resolvió.

## Contrato de sugerencias

El adaptador devuelve el mismo contrato que usa el intérprete determinista:

```ts
type SugerenciasInterpretacion = {
  nombre?: string | null
  correo?: string | null
  productos?: readonly { nombre: string; cantidad?: number | null }[]
  operacionProductos?: 'agregar' | 'reemplazar' | null
  cantidad?: number | null
  ciudad?: string | null
}
```

El esquema Zod (`esquema-interpretacion-ia.ts`) es estricto: cualquier campo
desconocido, tipo incorrecto o JSON inválido descarta la respuesta completa y se
usa el resultado determinista. El JSON Schema que se envía a Gemini se mantiene
alineado con ese esquema.

Las sugerencias no se aplican a ciegas:

- un nombre sugerido debe aparecer en el mensaje del cliente;
- un producto debe estar respaldado por el texto o por el contexto de producto;
- correo, cantidad y ciudad se validan con las mismas reglas de negocio;
- los productos de catálogo se resuelven con el catálogo local.

## Minimización de datos

Nunca se envían el nombre ni el correo ya capturados. Al proveedor solo viajan:

- el texto del mensaje del cliente;
- `pasoActual`, `estado` y `aclaracionPendiente`;
- booleanos `tieneNombre` y `tieneCorreo`;
- cantidad, cantidad aproximada y ciudad;
- productos confirmados (nombre y cantidad);
- contexto de producto: última consulta, marca, contadores, sugerencias y
  rechazados.

Los logs redactan `*.claveApi`, `*.apiKey`, `*.GEMINI_API_KEY`, `*.texto` y
`*.prompt`. No se registran el mensaje completo ni la respuesta cruda del modelo.

## Modos

- `asistido` (por defecto): si la sugerencia aporta una mejora válida, se aplica;
  si no, se conserva el determinista.
- `sombra`: consulta a Gemini y registra la comparación, pero **nunca** modifica el
  lead. Útil para evaluar calidad.

## Salvaguardas

El resultado asistido se descarta y se conserva el determinista cuando:

- `sombra`: el modo es `sombra`.
- `sin_mejora`: el resultado asistido es idéntico al determinista.
- `cambio_estado`: el asistido cambiaría el estado del lead salvo el caso de
  completado.
- `riesgo_completado`: el asistido intentaría pasar a `listo_pipedrive` sin
  aclaración pendiente.
- `aclaracion_completaria`: el asistido completaría el lead pero Gemini pidió
  aclaración.
- `regresion`: el asistido perdería nombre, correo, cantidad, ubicación, solicitud
  o productos ya capturados.
- `error`: Gemini falló, agotó el tiempo, devolvió datos inválidos o el
  cortacircuitos está abierto.

En todos los casos se registra el diagnóstico (`claveDeterminista`,
`claveAsistida`, `intencionIA`, `requiereAclaracion`) sin datos personales.

## Timeout, reintentos y cortacircuitos

- La consulta se ejecuta dentro de `IA_TIMEOUT_MS` (500–30000 ms; 4000 por
  defecto). El webhook de Meta espera la respuesta como máximo ese tiempo.
- Solo se reintenta **una vez** ante errores `5xx` o de red, dentro del
  presupuesto total.
- El cortacircuitos es en memoria y por proceso (servidor y worker no lo
  comparten):
  - autenticación, permisos, modelo o configuración: 5 min;
  - cuota agotada: 60 s;
  - red, timeout o error del proveedor: 15 s.

Una respuesta inválida del modelo no abre el cortacircuitos: es un problema de
contenido, no una caída del proveedor.

## Variables de entorno

- `IA_ACTIVA` (opcional, `false` por defecto): activa la capa de IA. No modifica
  el bot de WhatsApp.
- `IA_PROVEEDOR` (opcional, `gemini`): único valor admitido. Un valor distinto
  invalida el arranque.
- `IA_MODELO` (opcional, `gemini-3.5-flash-lite`): modelo de Gemini.
- `GEMINI_API_KEY` (solo si `IA_ACTIVA=true`): credencial de Google AI Studio. Si
  falta, se registra un aviso y se usa el flujo determinista.
- `IA_TIMEOUT_MS` (opcional, `4000`): presupuesto total de la consulta
  (500–30000 ms).
- `IA_MODO` (opcional, `asistido`): `asistido` o `sombra`.
- `IA_MAX_TOKENS_SALIDA` (opcional, `512`): límite de tokens de salida
  (64–4096).

No existen alias: el código solo lee estos nombres. Variables antiguas como
`GEMINI_MODEL` o `GEMINI_TIMEOUT_MS` se ignoran.

## Activación

1. Copiar el bloque de `.env.example` a `.env` (o al gestor de secretos).
2. Definir la credencial y activar la IA:

   ```dotenv
   WHATSAPP_BOT_ACTIVO=true
   IA_ACTIVA=true
   IA_PROVEEDOR=gemini
   IA_MODELO=gemini-3.5-flash-lite
   GEMINI_API_KEY=<credencial>
   IA_TIMEOUT_MS=4000
   IA_MODO=asistido
   IA_MAX_TOKENS_SALIDA=512
   ```

3. Mantener `WHATSAPP_DRY_RUN=true` hasta validar el flujo con el simulador.
4. Arrancar servidor/worker (o el simulador) y revisar los logs
   `modoRespuestas` y `modeloIA` del arranque.

### Vuelta al flujo determinista

- Cambiar `IA_ACTIVA=false` y reiniciar el proceso. No hace falta borrar
  `GEMINI_API_KEY`.
- Alternativa inmediata sin reiniciar la lógica: `IA_MODO=sombra` deja de aplicar
  sugerencias pero sigue consumiendo cuota.
- Si se elimina `GEMINI_API_KEY` con `IA_ACTIVA=true`, el arranque **no falla**:
  se registra un warning y el bot sigue determinista.

## Pruebas

- `tests/prueba-configuracion-ia.test.ts` — valores por defecto, validación y
  separación entre `IA_ACTIVA` y `WHATSAPP_BOT_ACTIVO`.
- `tests/prueba-interprete-gemini.test.ts` — esquema Zod, respuesta inválida,
  reintento único, cortacircuitos y timeout.
- `tests/prueba-interpretacion-asistida.test.ts` — decisión sombra/asistido,
  `sin_mejora`, `regresion`, cambio de estado y fallback por error.
- `tests/integracion/prueba-autorespuestas-ia.test.ts` — persistencia real del
  nombre sugerido contra PostgreSQL.

Los clientes falsos (`tests/helpers/ia-falsa.ts`) evitan consumir cuota real.

## Verificación en PowerShell

```powershell
npm run typecheck
npm run lint
npm run format:check
npm test
docker compose up -d --wait db
npm run test:integracion
npm run build
```

Para probar la conversación sin proveedor real, usar el simulador:

```powershell
$env:NODE_ENV = 'development'
$env:WHATSAPP_DRY_RUN = 'true'
$env:WHATSAPP_SEGUIMIENTOS_ACTIVOS = 'false'
$env:DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/desitec_bot_sim'
$env:WHATSAPP_BOT_ACTIVO = 'true'
$env:IA_ACTIVA = 'false'   # primero comparar el flujo determinista
npm run simulador
```

Después se puede repetir con `IA_ACTIVA=true` y `IA_MODO=sombra` para comparar
sin modificar el lead.

## Limitaciones conocidas

- El webhook de Meta espera la IA de forma síncrona; si la latencia del proveedor
  es un problema, la migración natural es reutilizar el patrón de inbox asíncrono
  de 360dialog.
- `correo_ambiguo` se detecta antes de consultar sugerencias, por lo que la IA no
  resuelve hoy ese caso concreto.
- El cortacircuitos no se comparte entre procesos ni se persiste.
- La calidad de la extracción depende del modelo configurado; `sombra` es el modo
  recomendado para evaluar cambios de modelo.

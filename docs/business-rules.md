# Reglas de negocio — desitec-bot-whatsapp

## Cuentas empresariales (números)

- El sistema soporta **tres líneas numeradas independientes** y es escalable a más.
- Nunca se codifican los números dentro de los controladores: se resuelven desde
  la tabla `cuentas_whatsapp` por `id_numero_telefono` de Meta.
- Cada conversación conserva la cuenta que la originó (`id_cuenta_whatsapp`).
- Un mismo cliente (mismo `id_wa`) puede tener **conversaciones independientes** en
  distintas líneas; la unicidad de conversación es (cuenta, contacto).

## Recepción segura

- Todo `POST /webhooks/whatsapp` exige firma `X-Hub-Signature-256` válida
  (HMAC-SHA256 con `META_APP_SECRET` sobre el cuerpo original). Sin firma → 401.
- Todo `POST /webhooks/360dialog` exige `X-Webhook-Token` igual al secreto de la
  cuenta resuelta por `metadata.phone_number_id` (comparación en tiempo constante).
  Token ausente/incorrecto o número desconocido → 401. Cada línea tiene su propio
  secreto (`webhook_secret_ref` → variable de entorno); no hay secreto global.
- El reto GET requiere comparación en tiempo constante de `hub.verify_token`.
- Los eventos malformados se rechazan con 400 sin efectos secundarios.
- No se responde 200 si la persistencia requerida aún no está confirmada (Meta);
  360dialog sí recibe 200 en cuanto el evento queda persistido (inbox asíncrono).

## Idempotencia y deduplicación

1. **Por evento**: `eventos_webhook.clave_evento` = SHA-256 del cuerpo crudo
   (único). Reenvíos idénticos se ignoran salvo que el evento previo quedara
   `fallido` o `recibido` (permite reintentos seguros; el worker reintenta los
   `fallido` y drena los `recibido` de 360dialog).
2. **Por mensaje**: `mensajes.id_mensaje_meta` único (`ON CONFLICT DO NOTHING`),
   de modo que un mismo `wamid` jamás se inserta dos veces aunque se reprocese.
3. **Ecos de Coexistence**: un mismo `id` de `smb_message_echoes` se guarda una
   sola vez; un eco duplicado no vuelve a pausar seguimientos.

## Mensajes y tipos

- Tipos de mensaje no soportados (imagen, video, audio, location, etc.) se
  **registran** (`tipo` guardada, `cuerpo = null`, payload en `carga_util` jsonb)
  sin romper la solicitud.
- Los eventos de `statuses` (entregados/leídos) **no** crean mensajes entrantes;
  actualizan el estado del mensaje referenciado si existe.
- Los **ecos** (`smb_message_echoes`, mensajes enviados desde la app de WhatsApp
  Business con Coexistence) se registran como salientes humanos y pausan los
  seguimientos pendientes con motivo `respuesta_asesor`; **no** disparan el bot.
- `id_wa` e `id_numero_telefono` se validan con patrones estrictos antes de usar.

## Envíos

- Cada cuenta (número) usa su **propia credencial**. `meta` usa
  `cuentas_whatsapp.token_acceso` (Meta Cloud API); `360dialog` usa una variable
  de entorno referenciada por `credencial_ref` (`D360_API_KEY_<LINEA>`). Nunca se
  guardan secretos en PostgreSQL. Si la cuenta no tiene credencial resuelta, el
  envío se rechaza con 503 `ACCOUNT_NO_TOKEN`.
- `ProveedorMensajes` es un puerto: `EnrutadorProveedorMensajes` delega en
  `ProveedorMetaMensajes` o `Proveedor360DialogMensajes` según el proveedor de la
  cuenta. 360dialog usa `POST https://waba-v2.360dialog.io/messages` con header
  `D360-API-KEY` y `recipient_type='individual'`; reintenta solo 429/5xx/timeout
  (nunca 400/401) con espera exponencial.
- `WHATSAPP_DRY_RUN=true` por defecto: el envío se simula (id `dry-run-...`) sin
  llamar a Meta. Para envíos reales: `WHATSAPP_DRY_RUN=false` + token real.
- Guard de ventana de atención: con `WHATSAPP_VENTANA_ATENCION_ACTIVA=true` solo
  se envía si hubo un mensaje **entrante dentro de las últimas 24 h**; si no,
  responde 409 `WINDOW_CLOSED`. La flag existe para pruebas locales
  (`false`); en producción se mantiene activa.
- Un mensaje saliente se persiste con `direccion='saliente'`,
  `id_mensaje_meta` de Meta y `estado='enviado'`. Los `statuses` posteriores de
  Meta (entregado/leído) actualizan ese mismo registro por `id_mensaje_meta`.
- Si Meta falla o se agota el tiempo de espera, el envío responde 502
  `MESSAGE_SEND_FAILED` y **no** se persiste el saliente.
- El endpoint `POST /api/mensajes` es interno y exige el header
  `x-api-key-interna` igual a `API_INTERNAL_KEY` (comparación en tiempo constante);
  sin clave configurada la ruta no se registra (404).
- Fuera de la ventana de 24 h solo se puede contactar con **plantillas aprobadas**
  de Meta; el módulo `followups` las usa para los seguimientos.

## Seguimientos programados

- Un seguimiento se programa por **conversación + regla** (índice único); las
  reglas activas definen la demora (`demora_horas`) y el contenido (plantilla o
  `cuerpo` de texto).
- `reglas_seguimiento.parametros` (jsonb, arreglo de textos) define los valores de
  los `{{1}}`, `{{2}}`, ... de la plantilla, en orden. Cada texto admite
  placeholders `{{nombre}}`, `{{id_wa}}`, `{{telefono}}` y `{{cuenta}}`, que se
  resuelven con los datos del destino (contacto + cuenta) antes de enviar; un
  placeholder desconocido se deja tal cual. Sin `parametros`, el envío va sin
  componentes de cuerpo (compatible con plantillas sin variables).
- `POST /api/seguimientos` (interno, `x-api-key-interna`) programa los
  seguimientos de una conversación a partir de las reglas activas.
- El worker (`npm run worker`) toma **solo** los `pendiente` con
  `programado_para <= ahora`, los marca `en_proceso` y luego:
  - `enviado` si Meta acepta (guarda `id_mensaje_meta` y `enviado_en`),
  - `fallido` si el envío falla (guarda `error`, **sin** persistir el saliente),
  - `cancelado` si la regla dejó de estar activa, la conversación no existe o el
    estado comercial ya no permite continuar (guarda `motivo_cancelacion`).
- Antes de enviar se **reverifica** la regla activa y el estado comercial
  (`VerificadorEstadoComercial`); el guard de ventana de 24 h **no** aplica a
  seguimientos con plantilla, por ser mensajes aprobados.
- La idempotencia/comparación segura de la clave interna y el uso del token por
  cuenta son idénticos al envío de `POST /api/mensajes`.
- Con `WHATSAPP_PAUSAR_SEGUIMIENTOS_POR_RESPUESTA=true`, un mensaje entrante
  **nuevo** cancela los seguimientos `pendiente` de esa conversación (motivo
  `respuesta_cliente`); los `enviado`/`en_proceso` no se tocan. Un **eco** del
  asesor (`smb_message_echoes`) los cancela con motivo `respuesta_asesor`
  (esta pausa aplica siempre, sin depender del flag). Los reintentos de
  Meta/360dialog (evento duplicado) no vuelven a disparar la pausa y un error al
  pausar no tumba la recepción del webhook.
- La pausa por respuesta del asesor se apoya en la columna
  `seguimientos_programados.motivo_cancelacion` (texto libre, sin CHECK).

## Bot de captura de leads

- Con `WHATSAPP_BOT_ACTIVO=true` (`false` por defecto), un mensaje entrante
  **nuevo** dispara el flujo de captura una sola vez por evento (los reintentos de
  Meta/360dialog no duplican respuestas). Los ecos de Coexistence **no** disparan
  el bot.
- Si `WHATSAPP_BOT_NUMEROS_PERMITIDOS` no está vacía (lista separada por comas),
  el bot **solo** responde a mensajes cuyo remitente coincide con alguno de esos
  números. La comparación ignora `+`, espacios y la lada mexicana `52`/`521`, de
  modo que `4772905770` equivale a `+52 1 477 290 5770`. Los mensajes de otros
  números se registran y pausan seguimientos, pero no reciben respuesta del bot.
- El contenido de cada respuesta vive en `guion_flujo_lead` (editable sin
  desplegar). Si falta el texto de una clave, el procesamiento falla de forma
  controlada (se registra) y no rompe la recepción del webhook.
- Datos capturados por lead: nombre, correo (formato válido), modelos, cantidad
  (entero > 0) y ciudad. Un dato inválido o un mensaje no-texto vuelve a pedir el
  paso actual sin avanzar.
- El primer mensaje se interpreta completo: se extraen nombre explícito, correo,
  ciudad y productos con cantidades, y solo se piden los datos faltantes. Los
  productos se guardan en `modelos` con su cantidad (`Producto (N); Producto`) y
  el total en `cantidad`. Si falta alguna cantidad no se asume: se pide el total.
  En el paso de cantidad, un producto adicional se agrega y se vuelve a pedir el
  total.
- Se aceptan correcciones explícitas («mi correo es…», «me llamo…», «en realidad
  son 6», «mejor…»). Las correcciones de modelo/producto («en realidad el modelo
  es…», «mejor el modelo…», «corrige el modelo a…») reemplazan `modelos` y
  conservan la cantidad actual salvo que incluyan una cantidad nueva. Varios
  correos distintos se rechazan con `correo_ambiguo`; rangos, decimales y
  especificaciones técnicas se aclaran con sus claves.
- Si el mensaje solicita atención humana (p. ej. «persona», «asesor», «agente»,
  «ejecutivo», «hablar con alguien», «que me llamen»), la detección ocurre antes
  de validar el paso: el lead pasa a `en_asesor` conservando los datos ya
  capturados, se cancelan sus seguimientos `pendiente` y se responde con
  `paso_a_asesor` («He registrado tu solicitud para atención humana. Un asesor
  revisará tu conversación.»). El bot deja de responder esa conversación y no se
  reactiva automáticamente. La detección ignora correos y evita falsos positivos
  como «Modelo Ejecutivo» o «persona moral», además de negaciones como «no
  necesito un asesor».
- Al completar, el lead guarda `completado_en` y pasa a `listo_pipedrive`; el bot
  deja de responder esa conversación. Una solicitud humana posterior también
  cambia el estado a `en_asesor`. La sincronización con Pipedrive y los endpoints
  de handoff siguen en fases posteriores.
- Las respuestas usan `EnviarMensajeSaliente` (ventana de atención y `DRY_RUN`).

## Privacidad y logs

- No se registran tokens, firmas ni números telefónicos completos.
  `enmascararTelefono(() => '***####')` en logs de diagnóstico y Pino `redact` en
  Payload de serializadores.
- Los eventos se almacenan de forma controlada (`eventos_webhook.carga_util_original`);
  no se duplican datos personales innecesariamente.

## Pauta de cambios de esquema

Todo cambio de esquema genera migración no destructiva (`npm run db:generate` y
`npm run db:migrate` desde PowerShell).

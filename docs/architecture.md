# Arquitectura — desitec-bot-whatsapp

Monolito modular con arquitectura limpia/hexagonal, en TypeScript ESM estricto.

## Capas y regla de dependencias

```
presentation (rutas Fastify, validaciones HTTP)
   ↓
application (casos de uso, puertos)
   ↓
domain (entidades, tipos, interfaces de repositorio)
   ↓
infrastructure (repositorios Drizzle, HMAC, transacciones)
```

- `domain` **no** depende de Fastify, Drizzle, Meta ni Pipedrive.
- Las interfaces (puertos) se declaran en `domain`/`application`; las
  implementaciones en `infrastructure`.
- `shared/` contiene configuración, logging, errores, base de datos y utilidades
  de seguridad; es la capa más interna.

## Módulos

| Módulo                  | Responsabilidad                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `whatsapp`              | Verificación, resolución de cuenta, recepción y normalización de eventos, HMAC, proveedores de mensajería. |
| `contacts`              | Entidad Contacto y su repositorio.                                                                         |
| `conversations`         | Entidades Conversación/Mensaje y sus repositorios.                                                         |
| `pipedrive` (pendiente) | Integración con Pipedrive (fase posterior).                                                                |
| `followups`             | Plantillas, reglas y seguimientos programados; programación y procesamiento.                               |
| `autorespuestas`        | Flujo de captura de leads: guion editable, máquina de pasos y persistencia.                                |

## Selección de proveedor de mensajería

Cada cuenta (`cuentas_whatsapp.proveedor`) declara su proveedor: `meta` (WhatsApp
Cloud API) o `360dialog` (WABA v2). `EnrutadorProveedorMensajes` implementa el
puerto `ProveedorMensajes` y delega en el adapter correspondiente
(`ProveedorMetaMensajes` o `Proveedor360DialogMensajes`) según
`EntradaEnviarMensaje.proveedor`. Los puertos de envío transportan `credencial`
(sin conocer de dónde sale) y `ResolverCredencialCuentaEntorno` la resuelve por
`credencial_ref` desde variables de entorno; las cuentas `meta` sin referencia
usan `token_acceso` durante la transición. Cuentas nuevas sin `proveedor`
declarado usan `PROVEEDOR_MENSAJERIA_DEFECTO` (por defecto `360dialog`).

## Flujo del webhook de Meta (POST /webhooks/whatsapp)

1. Fastify captura el **cuerpo original** en `solicitud.cuerpoCrudo`
   (`shared/http/cuerpo-crudo.ts`, parser de `application/json` con `parseAs: buffer`).
2. La ruta valida `X-Hub-Signature-256` (`HMAC-SHA256` sobre el cuerpo crudo con
   `META_APP_SECRET`) usando `timingSafeEqual`.
3. Se valida la estructura externa del evento con Zod (`payload-webhook.ts`,
   esquemas `objetoLibre` para tolerar campos desconocidos de Meta).
4. `RecibirEventoWhatsApp` computa `claveEvento = hashSha256(cuerpoCrudo)` para la
   idempotencia por evento (`eventos_webhook.clave_evento` único).
5. Itera **todas** las `entry[]`/`changes[]`, mensajes y estados.
6. `ResolverCuentaWhatsApp` resuelve la cuenta por `metadata.phone_number_id`
   (solo cuentas activas); si no existe, se registra el evento como `ignorado`.
7. Por cada mensaje entrante, `RegistrarMensajeEntrante` ejecuta una **transacción**:
   `BuscarOCrearContacto` → `BuscarOCrearConversacion` (única por cuenta+contacto) →
   `insertarEntrante` con `INSERT ... ON CONFLICT DO NOTHING` sobre
   `id_mensaje_meta` (anti-duplicado).
8. Si el mensaje se insertó (no era duplicado) y
   `WHATSAPP_PAUSAR_SEGUIMIENTOS_POR_RESPUESTA` está activo,
   `PausadorSeguimientosRespuesta` (adapter en `followups/infrastructure/adapters`
   que implementa el puerto `whatsapp/application/ports/pausador-seguimientos`)
   cancela los seguimientos `pendiente` de la conversación con motivo
   `respuesta_cliente`. Es best-effort: un fallo se registra y no rompe el webhook.
9. Si el mensaje se insertó, `WHATSAPP_BOT_ACTIVO` está activo y el remitente
   pasa el filtro opcional `WHATSAPP_BOT_NUMEROS_PERMITIDOS`,
   `ProcesarMensajeAutorespuesta` (puerto `whatsapp/application/ports/procesador-autorespuesta`)
   ejecuta la máquina de pasos del flujo (`autorespuestas/domain/services/maquina-flujo-lead`):
   crea o continúa el `lead` de la conversación, guarda el dato capturado y
   responde con el texto del guion vía `EnviarMensajeSaliente`. Antes de validar
   el paso, `detectar-solicitud-humano` reconoce pedidos de atención humana: el
   lead pasa a `en_asesor`, se pausan sus seguimientos y se responde
   `paso_a_asesor`; el bot deja de responder esa conversación. Es best-effort:
   un fallo se registra y no rompe el webhook.
10. Los estados (`statuses`) actualizan el estado del mensaje existente si existe;
    los ecos de Coexistence (`smb_message_echoes`) se registran como salientes
    humanos (`insertarSalienteHumano`), pausan seguimientos con motivo
    `respuesta_asesor` y **no** disparan el bot.
11. El servidor responde **200 solo después de persistir**: si algo falla se lanza
    el error (5xx) para que Meta reintente.

## Flujo del webhook de 360dialog (POST /webhooks/360dialog)

Inbox asíncrono para Coexistence: la ruta solo autentica y persiste; el worker
procesa después (esto absorbe la latencia de la máquina de pasos del bot sin
arriesgar el timeout de 360dialog, que es de ~5 s).

1. La ruta lee `solicitud.cuerpoCrudo` y `x-webhook-token` (cabeceras HTTP en
   minúscula).
2. `RecibirEvento360Dialog` reconoce la carga útil: forma Cloud API (mensajes,
   estados, `smb_message_echoes`) o forma de sincronización Coexistence
   (`smb_app_state_sync` / `history` con `{ id, event, data: { metadata, ... } }`).
3. Resuelve la cuenta por `metadata.phone_number_id` y obtiene su secreto de
   webhook con `ResolverSecretoWebhookCuenta` (`webhook_secret_ref` →
   variable de entorno); compara con `timingSafeEqual` (`comparacionSegura`).
   Cuenta desconocida o token ausente/incorrecto → 401 `UNAUTHORIZED`.
4. Persiste el evento en `eventos_webhook` con `fuente='360dialog'`,
   `estado='recibido'` y `carga_util_original` (idempotencia por
   `clave_evento = hashSha256(cuerpoCrudo)`; duplicado → 200 sin duplicar).
5. Los eventos de sincronización se marcan `ignorado` de inmediato (no generan
   acciones comerciales).
6. Responde 200 `{ recibido: true }`.

El worker drena estos eventos en cada ciclo con `ProcesarEventosWebhookPendientes`
(`obtenerRecibidos` → `ProcesarPayloadWhatsApp`, el mismo normalizador que usa
`RecibirEventoWhatsApp`): cuenta desconocida o carga no reconocible → `ignorado`;
éxito → `procesado`; error → `fallido` (se reintenta en el siguiente ciclo).

## Casos de uso

- `VerificarWebhookWhatsApp` — reto GET con comparación segura.
- `RecibirEventoWhatsApp` — valida HMAC y orquesta el procesamiento de un webhook de Meta.
- `ProcesarPayloadWhatsApp` — normalizador compartido: mensajes entrantes, estados, ecos, pausa de seguimientos y bot.
- `RecibirEvento360Dialog` — inbox de 360dialog: token por cuenta, idempotencia y persistencia (sin procesar).
- `ProcesarEventosWebhookPendientes` — drena eventos `recibido` y los procesa (worker).
- `RegistrarMensajeSalienteHumano` — persiste ecos de Coexistence como salientes.
- `ResolverCuentaWhatsApp` — cuenta por `phone_number_id`.
- `RegistrarMensajeEntrante` — transacción contacto + conversación + mensaje.
- `BuscarOCrearContacto` / `BuscarOCrearConversacion` — búsqueda y creación idempotentes.
- `ProgramarSeguimientos` — crea seguimientos para las reglas activas de una conversación.
- `EnviarSeguimientoProgramado` — reverifica regla/estado comercial y envía por plantilla o texto.
- `ProcesarSeguimientosPendientes` — orquesta un lote de seguimientos vencidos.
- `ProcesarMensajeAutorespuesta` — captura del lead: crea o continúa el flujo, guarda el paso y responde.

## Flujo del worker (src/trabajador.ts)

Proceso separado del servidor HTTP (sin Fastify). En cada ciclo:

1. `ProcesarEventosWebhookPendientes` drena hasta `LOTE_EVENTOS` (50) eventos
   `recibido` (típicamente de 360dialog) y los procesa con `ProcesarPayloadWhatsApp`.
   Este paso corre siempre, aunque los seguimientos estén desactivados.
2. `ProcesarSeguimientosPendientes` (solo si `WHATSAPP_SEGUIMIENTOS_ACTIVOS`)
   pide a `RepositorioSeguimientoProgramado` los seguimientos `pendiente` con
   `programado_para <= ahora` (hasta el tamaño de lote configurado).
3. Cada seguimiento se marca `en_proceso` y se envía con `EnviarSeguimientoProgramado`:
   carga la regla activa, verifica `VerificadorEstadoComercial`, resuelve el
   destino (`RepositorioDestinoSeguimiento`: cuenta + contacto de la conversación)
   y envía con `ProveedorMensajes` (plantilla si `id_plantilla`, si no texto). Los
   `parametros` de la regla se interpolan con `interpolarVariables` (helper en
   `shared/texto`) usando nombre del contacto, `id_wa`, teléfono visible y nombre
   de la cuenta.
4. Éxito → `enviado`; fallo de envío → `fallido`; regla inactiva/conversación
   inexistente/estado comercial no vigente → `cancelado`. El saliente se persiste
   vía `TransaccionMensajeEntrante` (`insertarSaliente` + `actualizarUltimoMensaje`).
5. El ciclo se repite cada `WHATSAPP_SEGUIMIENTOS_INTERVALO_MS`, sin solaparse, y
   se detiene ordenadamente con `SIGINT`/`SIGTERM` (espera el ciclo en curso y
   cierra el pool).

## Transaccionalidad

`TransaccionMensajeEntrante` (puerto en `whatsapp/application/ports`) expone
`ejecutar(trabajo)`; la implementación `TransaccionDrizzleMensajeEntrante` abre
`bd.transaccion` y construye los repositorios enlazados a la transacción,
garantizando atomicidad entre contacto, conversación y mensaje.

## Esquema de datos

Definido con Drizzle en `shared/db/schema/`. Tablas:

- `cuentas_whatsapp` — cuentas empresariales (código interno, `id_numero_telefono`,
  número visible, activa, `proveedor` —`meta`/`360dialog`—, `credencial_ref` y
  `webhook_secret_ref`: referencias a variables de entorno, nunca secretos en SQL).
- `contactos` — contactos únicos por `id_wa`.
- `conversaciones` — una por cuenta+contacto (índice único compuesto).
- `mensajes` — mensajes con `id_mensaje_meta` único (dedupe) y `carga_util` jsonb.
- `eventos_webhook` — auditoría/idempotencia con `clave_evento` único, `fuente`
  (`whatsapp`/`360dialog`), `estado` y `carga_util_original` jsonb (reintentos del worker).
- `plantillas_whatsapp` — plantillas aprobadas de Meta (`nombre_meta`, `idioma`, `componentes`).
- `reglas_seguimiento` — reglas por cuenta (demora, plantilla o cuerpo,
  `parametros` jsonb con los valores de la plantilla, `activa`).
- `seguimientos_programados` — seguimientos por conversación+regla (único) con
  `programado_para`, `estado`, `intentos`, `id_mensaje_meta`, `error`,
  `motivo_cancelacion` y `enviado_en`.
- `leads` — un lead por conversación (único) con `nombre`, `correo`, `modelos`,
  `cantidad`, `ciudad`, `paso_actual`, `estado` y `completado_en`.
- `guion_flujo_lead` — textos editables del bot (`clave` único, `orden`, `texto`,
  `activo`); se siembran con `db:seed` e incluyen `paso_a_asesor`.

Las fechas usan `timestamptz`. Las migraciones se generan con `npm run db:generate`.
El método `ProcesarSeguimientosPendientes` de los repositorios Drizzle filtra por
`estado`+`programado_para` (índice) para no cargar toda la tabla.

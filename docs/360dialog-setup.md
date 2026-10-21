# Configuración de 360dialog (Coexistence)

Guía operativa para conectar las tres líneas de Desitec a la API de 360dialog
(WABA v2), incluyendo webhooks, credenciales por número y eventos de Coexistence.

## 1. Resumen

- El microservicio envía mensajes por **360dialog** (`POST /messages` en
  `waba-v2.360dialog.io`, cabecera `D360-API-KEY`) o por **Meta Cloud API**, según
  `cuentas_whatsapp.proveedor`.
- Los webhooks entran por `POST /webhooks/360dialog`. La ruta autentica por
  cuenta, **persiste el evento y responde 200** (inbox asíncrono); el worker
  (`npm run worker`) lo procesa después.
- Los secretos (API key y token de webhook) viven en variables de entorno. La
  base de datos solo guarda las **referencias** (`credencial_ref`,
  `webhook_secret_ref`).
- La lógica comercial (conversaciones, pausa de seguimientos, bot de leads) es la
  misma que con Meta: no hay reglas duplicadas por proveedor.

## 2. Requisitos previos

- Cuenta de 360dialog con acceso al panel/Partner Hub y las tres líneas dadas de
  alta en modo **Coexistence**.
- El número `phone_number_id` de cada línea (lo entrega 360dialog; no es el número
  telefónico visible).
- Una **API key por número** y un **token de webhook por número** (puedes generarlos
  en el panel; si el panel entrega uno global, usa un valor por línea igualmente
  para mantener el aislamiento).
- URL pública con HTTPS para el webhook (`https://<tu-dominio>/webhooks/360dialog`).
- PostgreSQL migrado y el proceso `worker` corriendo (sin worker no se procesan
  los eventos de 360dialog).

## 3. Variables de entorno

Copia `.env.example` a `.env` y completa:

```dotenv
PROVEEDOR_MENSAJERIA_DEFECTO=360dialog
D360_API_BASE_URL=https://waba-v2.360dialog.io

D360_API_KEY_LINEA_COMERCIAL=<api-key-linea-comercial>
D360_WEBHOOK_SECRET_LINEA_COMERCIAL=<token-webhook-linea-comercial>
D360_API_KEY_LINEA_SOPORTE=<api-key-linea-soporte>
D360_WEBHOOK_SECRET_LINEA_SOPORTE=<token-webhook-linea-soporte>
D360_API_KEY_LINEA_POSTVENTA=<api-key-linea-postventa>
D360_WEBHOOK_SECRET_LINEA_POSTVENTA=<token-webhook-linea-postventa>

WHATSAPP_DRY_RUN=true
WHATSAPP_VENTANA_ATENCION_ACTIVA=true
WHATSAPP_SEGUIMIENTOS_ACTIVOS=false
WHATSAPP_BOT_ACTIVO=false
WHATSAPP_BOT_NUMEROS_PERMITIDOS=
```

- Los nombres `D360_*_LINEA_*` son una convención; lo obligatorio es que coincidan
  con `credencialRef`/`webhookSecretRef` de `WHATSAPP_ACCOUNTS`.
- `META_APP_SECRET` y `META_VERIFY_TOKEN` solo son obligatorios si alguna cuenta
  usa `proveedor: "meta"`.
- `.env` está ignorado por Git. Nunca subas valores reales.

## 4. Registrar las cuentas (`WHATSAPP_ACCOUNTS`)

`WHATSAPP_ACCOUNTS` es un JSON con una entrada por línea. Ejemplo mínimo:

```json
[
  {
    "codigo": "linea-comercial",
    "nombreComercial": "Linea Comercial",
    "idNumeroTelefono": "<phone_number_id>",
    "telefonoVisible": "+5210000000001",
    "proveedor": "360dialog",
    "credencialRef": "D360_API_KEY_LINEA_COMERCIAL",
    "webhookSecretRef": "D360_WEBHOOK_SECRET_LINEA_COMERCIAL",
    "activa": true
  }
]
```

- `codigo` es el identificador interno (se usa en `POST /api/mensajes`).
- `idNumeroTelefono` debe ser el `phone_number_id` que 360dialog envía en
  `metadata.phone_number_id`; es la clave para resolver la cuenta en el webhook.
- `credencialRef`/`webhookSecretRef` **nombran** variables de entorno, no contienen
  secretos.
- `proveedor` selecciona el adapter de envío y la ruta de webhook (`meta` o
  `360dialog`). Las cuentas nuevas sin `proveedor` usan
  `PROVEEDOR_MENSAJERIA_DEFECTO`.
- `tokenAcceso` solo se conserva para cuentas `meta` durante la transición.

## 5. Migrar y sembrar

En PowerShell (Windows), con PostgreSQL arriba:

```powershell
docker compose up -d --wait db
npm run db:migrate
npm run db:seed
```

`db:seed` hace upsert de las cuentas por `codigo`; puedes volver a ejecutarlo cada
vez que cambies `WHATSAPP_ACCOUNTS` o las referencias de secretos. No guarda los
valores de las variables de entorno.

## 6. Configurar el webhook en 360dialog

1. En el panel de 360dialog, abre la configuración de webhooks de cada línea.
2. URL: `https://<tu-dominio>/webhooks/360dialog`.
3. Cabecera de autenticación: `X-Webhook-Token` con el valor del secreto de esa
   línea (`D360_WEBHOOK_SECRET_<LINEA>`).
4. Suscribe los eventos de mensajes y los de Coexistence
   (`smb_message_echoes`, `smb_app_state_sync`, `history` si el panel lo permite).
5. Guarda y usa la opción de prueba del panel: debe responder `200` con
   `{ "recibido": true }`.

No se usa la firma HMAC de Meta en esta ruta.

## 7. Autenticación y respuestas del webhook

| Situación                                | Respuesta              |
| ---------------------------------------- | ---------------------- |
| Token correcto para el `phone_number_id` | `200 {recibido:true}`  |
| Token ausente o incorrecto               | `401 UNAUTHORIZED`     |
| `phone_number_id` sin cuenta registrada  | `401 UNAUTHORIZED`     |
| JSON válido pero con forma no reconocida | `400 VALIDATION_ERROR` |
| Evento duplicado (mismo cuerpo)          | `200` (sin duplicar)   |

- El token se compara en tiempo constante (`timingSafeEqual`).
- El evento se guarda con `fuente='360dialog'`, `estado='recibido'` y
  `carga_util_original`; el `clave_evento` es el SHA-256 del cuerpo crudo.
- Un evento que el worker no puede procesar queda `fallido` y se reintenta en el
  siguiente ciclo. Los que no aplican (sincronización/historial) quedan
  `ignorado`.

## 8. Envío de mensajes

- Endpoint del proveedor: `POST {D360_API_BASE_URL}/messages` con cabecera
  `D360-API-KEY` (la credencial resuelta para la cuenta) y
  `messaging_product: "whatsapp"`, `recipient_type: "individual"`.
- Texto: `type: "text"`, `text: { body, preview_url }`.
- Plantilla: `type: "template"`, `template: { name, language: { code }, components }`.
- Reintentos: solo 429, 5xx y timeouts, con espera exponencial acotada; 400/401 no
  se reintentan. Timeout por petición con `AbortController`.
- Ventana de atención: con `WHATSAPP_VENTANA_ATENCION_ACTIVA=true` solo se envía si
  hubo un entrante en las últimas 24 h (`409 WINDOW_CLOSED`). Los seguimientos con
  plantilla son la vía fuera de ventana.
- Con `WHATSAPP_DRY_RUN=true` no se llama a 360dialog; se devuelve un id
  `dry-run-...` y el saliente se persiste como simulado.

## 9. Coexistence: ecos, sincronización e historial

- `smb_message_echoes`: mensajes enviados por el asesor desde la app de WhatsApp
  Business. Se persisten como salientes humanos (`insertarSalienteHumano`, dedupe
  por `id_mensaje_meta`), pausan los seguimientos pendientes con motivo
  `respuesta_asesor` y **no** disparan el bot. No extienden la ventana de 24 h.
- `smb_app_state_sync` y `history`: se marcan `ignorado`; no generan mensajes,
  pausas ni respuestas.
- Entrantes y `statuses` se procesan igual que en Meta (misma normalización en
  `ProcesarPayloadWhatsApp`).

## 10. Verificación local y diagnóstico

Con `npm run dev` y `npm run worker` en marcha:

```powershell
# Liveness
Invoke-RestMethod http://localhost:3000/health

# Evento de sincronización (token de la linea comercial)
$body = '{"id":"evt-1","event":"smb_app_state_sync","data":{"metadata":{"display_phone_number":"+5210000000000","phone_number_id":"<phone_number_id>"},"state_sync":[]}}'
Invoke-WebRequest -Method Post -Uri http://localhost:3000/webhooks/360dialog `
  -Headers @{ 'Content-Type' = 'application/json'; 'X-Webhook-Token' = '<secreto-linea>' } `
  -Body $body

# Comprobar eventos y mensajes
docker compose exec db psql -U postgres -d desitec_bot `
  -c "select fuente, estado, recibido_en from eventos_webhook order by recibido_en desc limit 5;"
docker compose exec db psql -U postgres -d desitec_bot `
  -c "select direccion, id_mensaje_meta, cuerpo from mensajes order by creado_en desc limit 5;"
```

Problemas comunes:

- **401 con token correcto**: el `phone_number_id` no coincide con
  `WHATSAPP_ACCOUNTS.idNumeroTelefono` o la cuenta está inactiva (`activa: false`).
- **El evento queda `recibido`**: el worker no está corriendo o está apuntando a
  otra base de datos.
- **`ACCOUNT_NO_TOKEN` al enviar**: `credencialRef` apunta a una variable vacía o
  inexistente; revisa `.env` y reinicia el proceso.
- **`WINDOW_CLOSED`**: no hay entrante reciente; usa plantilla o, solo en local,
  `WHATSAPP_VENTANA_ATENCION_ACTIVA=false`.
- **Formato**: `npx prettier --check .` antes de commitear.

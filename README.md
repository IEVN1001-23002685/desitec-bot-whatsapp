# desitec-bot-whatsapp

Bot de WhatsApp empresarial para Desitec basado en la **360dialog WhatsApp API**
(con soporte para la **Meta WhatsApp Cloud API**), **Fastify**,
**TypeScript** (Clean/Hexagonal), **PostgreSQL** y **Drizzle ORM**.

Estado actual (Fase 5b): recepción segura de webhooks, identificación de tres
números empresariales independientes, persistencia de mensajes entrantes y de
conversaciones, **envío real de mensajes** de texto/plantilla por número con
**proveedor seleccionable** (`meta`/`360dialog`) y credenciales resueltas por
cuenta, **motor de seguimientos programados** (plantillas, reglas, programación
vía endpoint interno y un worker que procesa los vencidos desde PostgreSQL) y
**webhook 360dialog con inbox asíncrono** para Coexistence (ecos de asesor y
eventos de sincronización). Los envíos siguen en `WHATSAPP_DRY_RUN` por defecto.

## Stack

- Node.js 24, TypeScript (strict, ESM/NodeNext), Fastify 5, PostgreSQL, Drizzle ORM,
  Zod, Pino, Vitest.
- Sin dependencias nuevas en Fase 1/2: HMAC-SHA256 con `node:crypto` y envío con
  el `fetch` global de Node.

## Comandos

Ejecutar **siempre en PowerShell de Windows** (el proyecto vive en Windows y la
copia de WSL solo edita archivos — nunca `npm install`/builds dentro de WSL).

```powershell
npm install
npm run typecheck        # tsc --noEmit
npm run lint             # eslint .
npm test                 # vitest run (unitarias)
npm run test:integracion # integracion con PostgreSQL real (requiere docker compose up -d --wait db)
npx prettier --check .   # verificar formato
npm run db:generate      # generar migración Drizzle
npm run db:migrate       # aplicar migraciones
npm run db:seed          # cargar/actualizar las cuentas de WhatsApp desde .env
npm run dev              # servidor HTTP (tsx watch src/servidor.ts)
npm run worker           # worker: eventos de webhook + seguimientos (polling sobre PostgreSQL)
npm run build            # tsc -p tsconfig.build.json -> dist/
npm run start            # node dist/servidor.js
```

## Variables de entorno

Ver `.env.example`:

- `DATABASE_URL`
- `PROVEEDOR_MENSAJERIA_DEFECTO` — proveedor de mensajería para cuentas nuevas sin
  proveedor declarado: `meta` o `360dialog` (por defecto `360dialog`).
- `D360_API_BASE_URL` — URL base de 360dialog (por defecto
  `https://waba-v2.360dialog.io`).
- `META_APP_SECRET` — valida `X-Hub-Signature-256`. Obligatorio solo si alguna
  cuenta usa el proveedor `meta`.
- `META_VERIFY_TOKEN` — reto GET de verificación. Obligatorio solo si alguna cuenta
  usa el proveedor `meta`.
- `META_API_VERSION` — versión de la Graph API (por defecto `v21.0`).
- `WHATSAPP_DRY_RUN` — `true` por defecto; simula el envío sin llamar al proveedor.
- `WHATSAPP_VENTANA_ATENCION_ACTIVA` — `true` por defecto; exige un mensaje
  entrante dentro de 24 h para enviar. Ponlo en `false` solo para pruebas locales.
- `WHATSAPP_SEGUIMIENTOS_ACTIVOS` — `false` por defecto; mientras esté en `false`,
  el worker no procesa ni envía seguimientos.
- `WHATSAPP_SEGUIMIENTOS_INTERVALO_MS` — intervalo del worker en ms (por defecto
  `30000`).
- `WHATSAPP_SEGUIMIENTOS_LOTE` — seguimientos por lote que procesa el worker (por
  defecto `50`).
- `WHATSAPP_PAUSAR_SEGUIMIENTOS_POR_RESPUESTA` — `false` por defecto; al activarlo,
  un mensaje entrante nuevo pausa (`cancelado`, motivo `respuesta_cliente`) los
  seguimientos pendientes de esa conversación.
- `WHATSAPP_BOT_ACTIVO` — `false` por defecto; activa el bot de captura de leads
  (ver «Bot de captura de leads»).
- `WHATSAPP_BOT_NUMEROS_PERMITIDOS` — lista separada por comas de números que
  pueden activar el bot. Vacía = cualquier remitente. La comparación ignora `+`,
  espacios y la lada mexicana `52`/`521` (ver «Bot de captura de leads»).
- `API_INTERNAL_KEY` — clave compartida para `POST /api/mensajes` y
  `POST /api/seguimientos`. Si está vacía, los endpoints no se registran (404).
- `WHATSAPP_ACCOUNTS` — JSON con las cuentas a sembrar (`codigo`, `nombreComercial`,
  `idNumeroTelefono`, `telefonoVisible`, `proveedor`, `credencialRef`,
  `webhookSecretRef`, `activa`, y `tokenAcceso` solo para cuentas `meta` durante la
  transición). `credencialRef`/`webhookSecretRef` **nombran** variables de entorno
  (p. ej. `D360_API_KEY_LINEA_COMERCIAL`) cuyo valor es el secreto; los secretos
  nunca se guardan en PostgreSQL. Ver `docs/360dialog-setup.md`.
- `WEBHOOK_BODY_LIMIT` — límite de cuerpo HTTP (bytes).

Nunca se versionan credenciales reales (`.gitignore` excluye `.env*` salvo `.env.example`).

## Endpoints

| Método | Ruta                  | Descripción                                                      |
| ------ | --------------------- | ---------------------------------------------------------------- |
| GET    | `/health`             | Liveness.                                                        |
| GET    | `/webhooks/whatsapp`  | Verificación del webhook de Meta (`hub.challenge`).              |
| POST   | `/webhooks/whatsapp`  | Eventos de WhatsApp de Meta (firma HMAC obligatoria).            |
| POST   | `/webhooks/360dialog` | Eventos de 360dialog/Coexistence (`X-Webhook-Token` por cuenta). |
| POST   | `/api/mensajes`       | Envío de texto interno (header `x-api-key-interna`).             |
| POST   | `/api/seguimientos`   | Programa seguimientos de una conversación (interno).             |

La ruta de Meta solo se registra cuando hay al menos una cuenta con proveedor
`meta`; la de 360dialog, cuando hay al menos una cuenta `360dialog`. Ambas
comparten la lógica de negocio (`ProcesarPayloadWhatsApp`); solo cambia la
autenticación y, en 360dialog, el evento se persiste y se procesa en el worker.

## Webhook en Meta for Developers

1. En la app de Meta for Developers, sección _WhatsApp → Configuration_.
2. _Webhook callback URL_: `https://<tu-dominio>/webhooks/whatsapp`.
3. _Verify token_: el mismo valor de `META_VERIFY_TOKEN`.
4. Suscribir el campo `messages` del objeto `whatsapp_business_account`.
5. Guardar el valor de _App secret_ de _App settings → Basic_ en `META_APP_SECRET`.

Cuándo Meta llame al `GET`, el servidor responderá el `hub.challenge` solo si el
`hub.verify_token` coincide (comparación en tiempo constante).

## Webhook en 360dialog (Coexistence)

1. En el panel de 360dialog, configura la URL
   `https://<tu-dominio>/webhooks/360dialog` para cada línea.
2. Genera un secreto por línea y guárdalo **solo** en la variable de entorno a la
   que apunta `webhookSecretRef` de esa cuenta en `WHATSAPP_ACCOUNTS`
   (p. ej. `D360_WEBHOOK_SECRET_LINEA_COMERCIAL`). No hay secreto global: la
   cuenta se resuelve por `metadata.phone_number_id` y el token se compara en
   tiempo constante. Token ausente/incorrecto o número desconocido → 401.
3. 360dialog enviará la cabecera `X-Webhook-Token` en cada POST.
4. El endpoint **no procesa** en la petición: persiste el evento (`recibido`) y
   responde 200 (`{ "recibido": true }`). El worker (`npm run worker`) drena los
   pendientes con `ProcesarEventosWebhookPendientes` y aplica la misma lógica que
   Meta (entrantes, estados, bot), además de:
   - `smb_message_echoes` → se guarda como saliente humano y pausa los
     seguimientos pendientes con motivo `respuesta_asesor` (los ecos **no**
     disparan el bot).
   - `smb_app_state_sync` / `history` → `ignorado` (sin acciones comerciales).
5. Duplicados (mismo cuerpo) devuelven 200 sin duplicar el evento; si el worker
   falla, el evento queda `fallido` y se reintenta en el siguiente ciclo.

Ver `docs/360dialog-setup.md` para la configuración completa inicial.

También puedes probar el endpoint con un token de línea (PowerShell):

```powershell
$body = '{"id":"evt-1","event":"smb_app_state_sync","data":{"metadata":{"display_phone_number":"+5210000000000","phone_number_id":"111111111111111"},"state_sync":[]}}'
Invoke-WebRequest -Method Post -Uri http://localhost:3000/webhooks/360dialog `
  -Headers @{ 'Content-Type' = 'application/json'; 'X-Webhook-Token' = '<secreto-linea>' } `
  -Body $body
```

## Probar localmente con solicitudes firmadas

Con el servidor corriendo (`npm run dev`), el proyecto incluye pruebas. Para
reproducir manualmente una solicitud firmada (PowerShell):

```powershell
$body = @'
{"object":"whatsapp_business_account","entry":[{"id":"waba-id","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"+5210000000000","phone_number_id":"111111111111111"},"contacts":[{"profile":{"name":"Cliente"},"wa_id":"5215512345678"}],"messages":[{"from":"5215512345678","id":"wamid.TEST","timestamp":"1700000000","type":"text","text":{"body":"Hola"}}]}}]}]}
'@
$secret = 'reemplaza-por-META_APP_SECRET'
$hmac = "sha256=$((New-Object System.Security.Cryptography.HMACSHA256([Text.Encoding]::UTF8.GetBytes($secret))).ComputeHash([Text.Encoding]::UTF8.GetBytes($body)) | ForEach-Object { $_.ToString('x2') } -join '')"

Invoke-WebRequest -Method Post -Uri http://localhost:3000/webhooks/whatsapp `
  -Headers @{ 'Content-Type' = 'application/json'; 'X-Hub-Signature-256' = $hmac } `
  -Body $body
```

Verificación GET:

```powershell
$url = "http://localhost:3000/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=reemplaza-por-token&hub.challenge=CHALLENGE_OK"
(Invoke-WebRequest -Method Get -Uri $url).Content   # -> CHALLENGE_OK
```

Los logs no registran tokens, firmas ni números completos (métricas y
`enmascararTelefono` enmascaran a `***####`).

## Envío de mensajes (Fase 2)

`POST /api/mensajes` envía un mensaje de texto desde una de las líneas. Requiere:

- Header `x-api-key-interna` igual a `API_INTERNAL_KEY` (comparación en tiempo
  constante). Sin `API_INTERNAL_KEY` configurada, la ruta no existe (404).
- `WHATSAPP_DRY_RUN=false` y una credencial real resuelta para la cuenta (vía
  `credencialRef`, p. ej. `D360_API_KEY_LINEA_COMERCIAL`; las cuentas `meta`
  conservan `tokenAcceso`).
- Con `WHATSAPP_VENTANA_ATENCION_ACTIVA=true`, debe existir un mensaje entrante
  dentro de las últimas 24 h; si no, responde 409 `WINDOW_CLOSED`.

Cuerpo y respuestas:

```jsonc
// request
{ "codigoCuenta": "linea-comercial", "idWa": "5215512345678", "cuerpo": "Hola" }
// 200
{ "enviado": true, "idMensajeMeta": "wamid...", "idConversacion": "uuid" }
```

Script de prueba (con `npm run dev` corriendo):

```powershell
$env:API_INTERNAL_KEY = '<clave>'   # o pásala con -Clave
.\scripts\prueba-envio.ps1 -IdWa 5215512345678
```

Recomendado: validar primero con `WHATSAPP_DRY_RUN=true` (devuelve un id
`dry-run-...` y guarda el saliente sin llamar al proveedor) y después con `false`.

## Seguimientos programados (Fase 3)

El módulo `followups` programa recordatorios persistidos en PostgreSQL y un worker
separado los envía cuando vencen. No se usan temporizadores en memoria.

- **Plantillas** (`plantillas_whatsapp`): plantillas aprobadas de Meta
  (`nombre_meta`, `idioma`, `componentes`).
- **Reglas** (`reglas_seguimiento`): por cuenta, con `demora_horas`, plantilla
  (`id_plantilla`) o `cuerpo` de texto, `parametros` (jsonb) y flag `activa`.
- **Seguimientos** (`seguimientos_programados`): uno por conversación+regla, con
  `programado_para`, `estado` (`pendiente`/`en_proceso`/`enviado`/`cancelado`/
  `fallido`), `intentos`, `id_mensaje_meta` y `motivo_cancelacion`.

`POST /api/seguimientos` programa los seguimientos de una conversación:

```jsonc
// request (header x-api-key-interna)
{ "idConversacion": "uuid" }
// 201
{ "programados": 1 }
```

El worker (`npm run worker`) hace polling cada `WHATSAPP_SEGUIMIENTOS_INTERVALO_MS`,
drena los eventos de webhook pendientes (360dialog) y, si
`WHATSAPP_SEGUIMIENTOS_ACTIVOS=true`, procesa hasta `WHATSAPP_SEGUIMIENTOS_LOTE`
seguimientos vencidos:
reverifica la regla y el estado comercial (`VerificadorEstadoComercial`), resuelve
la cuenta/contacto de la conversación y envía por **plantilla** (o texto si la
regla no tiene plantilla). Los `parametros` de la regla llenan los `{{1}}`,
`{{2}}`, ... de la plantilla y admiten placeholders `{{nombre}}`, `{{id_wa}}`,
`{{telefono}}` y `{{cuenta}}`, resueltos con los datos de la conversación. Los
envíos con plantilla funcionan fuera de la ventana de 24 h; el mensaje saliente se
persiste con `tipo` y `estado='enviado'`. Si el envío falla se marca `fallido` sin
persistir el saliente. El worker cierra ordenadamente con `SIGINT`/`SIGTERM`.

Con `WHATSAPP_PAUSAR_SEGUIMIENTOS_POR_RESPUESTA=true`, cada mensaje entrante
**nuevo** (idempotente ante reintentos) cancela los seguimientos `pendiente` de
esa conversación con motivo `respuesta_cliente`; un eco del asesor
(`smb_message_echoes` de Coexistence) los cancela siempre con motivo
`respuesta_asesor`. Los ya `enviado` no se tocan y el webhook nunca falla por un
error de esta pausa.

## Bot de captura de leads (Fase 4)

Con `WHATSAPP_BOT_ACTIVO=true`, cada mensaje entrante **nuevo**
dispara el flujo de captura del módulo `autorespuestas`:

- El **guion** vive en `guion_flujo_lead` (`clave`, `orden`, `texto`, `activo`) y
  se siembra con `npm run db:seed`: `bienvenida`, `pedir_nombre`, `pedir_correo`,
  `correo_invalido`, `pedir_modelos`, `pedir_cantidad`, `cantidad_invalida`,
  `pedir_ciudad`, `confirmacion` y `paso_a_asesor`. Se puede editar sin desplegar.
- Al primer mensaje se crea un **lead** por conversación (`leads`) y se pide el
  nombre; después correo (validado), modelos, cantidad (entero > 0) y ciudad. Un
  dato inválido o un mensaje no-texto vuelve a pedir el paso actual.
- En cualquier paso, si el mensaje pide atención humana (“persona”, “asesor”,
  “agente”, “ejecutivo”, “hablar con alguien”, “que me llamen”, etc.), el lead
  pasa a `en_asesor`, se cancelan sus seguimientos pendientes y se envía
  `paso_a_asesor`: «Entiendo. Una persona de nuestro equipo te atenderá en breve.»
  El bot deja de responder esa conversación. La detección ignora correos y evita
  falsos positivos como “Modelo Ejecutivo” o “persona moral”.
- Al completar se guarda `completado_en`, el lead pasa a `listo_pipedrive` y se
  envía la confirmación; el bot deja de responder esa conversación (la
  sincronización con Pipedrive llega en una fase posterior). Una solicitud humana
  posterior también se deriva a `en_asesor`.
- Las respuestas salen por `EnviarMensajeSaliente` (misma ventana de atención y
  `DRY_RUN`). Un fallo del bot se registra y **no** tumba la recepción del webhook.
- Con `WHATSAPP_BOT_NUMEROS_PERMITIDOS` no vacía, el bot **solo** responde a esos
  remitentes; el resto se registra pero no recibe respuestas. Los números se
  normalizan (sin `+`/espacios y sin lada `52`/`521`), así que `4772905770`
  coincide con `+52 1 477 290 5770`. Para pruebas locales con una sola línea usa
  un `idNumeroTelefono` placeholder hasta conectar el webhook real de 360dialog.

## Docker (PostgreSQL y la pila completa)

Requisitos: Docker Desktop con WSL2. **Todo se corre desde PowerShell.**

```powershell
# 1. Copiar variables y ajustar DATABASE_URL / META_* si hace falta
Copy-Item .env.example .env

# 2. Levantar solo PostgreSQL (esperando a que esté sano) y aplicar migraciones + semilla
docker compose up -d --wait db
npm run db:migrate
npm run db:seed

# 3. Pila completa (API en http://localhost:3000 + worker de seguimientos)
docker compose up -d --build
```

El servicio `db` publica `5432` en el host, así que `npm run db:migrate` y
`npm run db:seed` (drizzle-kit lee el `DATABASE_URL` del `.env` vía `dotenv/config`)
apuntan a `localhost:5432`. Dentro de la red de Compose, `app` y `worker` usan
`DATABASE_URL=postgres://postgres:postgres@db:5432/desitec_bot` (el servicio `db`).
`db:migrate` y `db:seed` reintentan la conexión al arrancar, así que también
funcionan si Postgres tarda unos segundos en aceptar conexiones (cold start).

## Integración continua

El pipeline `.github/workflows/ci.yml` corre en GitHub Actions en cada push/PR:
`npm ci`, typecheck, lint, `prettier --check`, unitarias, migraciones contra un
PostgreSQL real, integración contra una BD dedicada `desitec_bot_test` (se crea y
migra sola) y `npm run build`.

## Verificación end-to-end (Fase 1 y 2)

Con `npm run build` correcto y la pila arriba (`docker compose up -d --build`),
en PowerShell:

```powershell
Invoke-RestMethod http://localhost:3000/health   # -> estado ok
```

Enviar un webhook firmado siguiendo el ejemplo de la sección "Probar localmente
con solicitudes firmadas" y comprobar la persistencia:

```powershell
docker compose exec db psql -U postgres -d desitec_bot -c "\dt"
docker compose exec db psql -U postgres -d desitec_bot `
  -c "select id_wa from contactos; select id_mensaje_meta from mensajes;"
```

Probar un envío (requiere `API_INTERNAL_KEY` y, en real, credencial resuelta + `DRY_RUN=false`):

```powershell
$env:API_INTERNAL_KEY = '<clave>'
.\scripts\prueba-envio.ps1 -IdWa <numero-destino>
docker compose exec db psql -U postgres -d desitec_bot `
  -c "select direccion, estado, id_mensaje_meta from mensajes;"
```

## Estructura

```
src/
  app.ts, servidor.ts, trabajador.ts
  shared/            configuracion, registro, errores, bd (esquema + cliente + sembrado), http, seguridad
  modules/
    whatsapp/        verificacion, resolucion de cuentas, recepcion de eventos, HMAC
    contacts/        BuscarOCrearContacto
    conversations/   BuscarOCrearConversacion, mensajes y transaccion entrante/saliente
    pipedrive/       (pendiente, fase posterior)
    followups/       reglas, plantillas y seguimientos programados + casos de uso
tests/               Vitest: unitarias (fakes + fastify.inject) e integracion (tests/integracion/)
docs/                arquitectura y reglas de negocio
scripts/             utilidades manuales (prueba-envio.ps1)
drizzle/             migraciones (generadas con npm run db:generate)
Dockerfile + compose.yaml   imagen de la app y pila local (db/app/worker)
.github/workflows/ci.yml    pipeline CI
```

Ver `docs/architecture.md`, `docs/business-rules.md` y `docs/360dialog-setup.md`
para detalles.

## Pendiente

- Integración con Pipedrive.

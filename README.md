# desitec-bot-whatsapp

Bot de WhatsApp empresarial para Desitec basado en la **Meta WhatsApp Cloud API**,
**Fastify**, **TypeScript** (Clean/Hexagonal), **PostgreSQL** y **Drizzle ORM**.

Estado actual (Fase 3): recepción segura de webhooks, identificación de tres
números empresariales independientes, persistencia de mensajes entrantes y de
conversaciones, **envío real de mensajes** de texto/plantilla por número (token
por cuenta) y **motor de seguimientos programados** (plantillas, reglas,
programación vía endpoint interno y un worker que procesa los vencidos desde
PostgreSQL). Los envíos siguen en `WHATSAPP_DRY_RUN` por defecto.

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
npm run worker           # worker de seguimientos (polling sobre PostgreSQL)
npm run build            # tsc -p tsconfig.build.json -> dist/
npm run start            # node dist/servidor.js
```

## Variables de entorno

Ver `.env.example`:

- `DATABASE_URL`
- `META_APP_SECRET` — valida `X-Hub-Signature-256`.
- `META_VERIFY_TOKEN` — reto GET de verificación.
- `META_API_VERSION` — versión de la Graph API (por defecto `v21.0`).
- `WHATSAPP_DRY_RUN` — `true` por defecto; simula el envío sin llamar a Meta.
- `WHATSAPP_VENTANA_ATENCION_ACTIVA` — `true` por defecto; exige un mensaje
  entrante dentro de 24 h para enviar. Ponlo en `false` solo para pruebas locales.
- `WHATSAPP_SEGUIMIENTOS_INTERVALO_MS` — intervalo del worker en ms (por defecto
  `30000`).
- `WHATSAPP_SEGUIMIENTOS_LOTE` — seguimientos por lote que procesa el worker (por
  defecto `50`).
- `WHATSAPP_PAUSAR_SEGUIMIENTOS_POR_RESPUESTA` — `false` por defecto; al activarlo,
  un mensaje entrante nuevo pausa (`cancelado`, motivo `respuesta_cliente`) los
  seguimientos pendientes de esa conversación.
- `WHATSAPP_BOT_ACTIVO` — `true` por defecto; activa el bot de captura de leads
  (ver «Bot de captura de leads»).
- `API_INTERNAL_KEY` — clave compartida para `POST /api/mensajes` y
  `POST /api/seguimientos`. Si está vacía, los endpoints no se registran (404).
- `WHATSAPP_ACCOUNTS` — JSON con las cuentas a sembrar (`codigo`, `nombreComercial`,
  `idNumeroTelefono`, `telefonoVisible`, `tokenAcceso`, `activa`). El `tokenAcceso`
  es el token de Meta **por número** (cada línea tiene el suyo).
- `WEBHOOK_BODY_LIMIT` — límite de cuerpo HTTP (bytes).

Nunca se versionan credenciales reales (`.gitignore` excluye `.env*` salvo `.env.example`).

## Endpoints

| Método | Ruta                 | Descripción                                          |
| ------ | -------------------- | ---------------------------------------------------- |
| GET    | `/health`            | Liveness.                                            |
| GET    | `/webhooks/whatsapp` | Verificación del webhook de Meta (`hub.challenge`).  |
| POST   | `/webhooks/whatsapp` | Eventos de WhatsApp (firma HMAC obligatoria).        |
| POST   | `/api/mensajes`      | Envío de texto interno (header `x-api-key-interna`). |
| POST   | `/api/seguimientos`  | Programa seguimientos de una conversación (interno). |

## Webhook en Meta for Developers

1. En la app de Meta for Developers, sección _WhatsApp → Configuration_.
2. _Webhook callback URL_: `https://<tu-dominio>/webhooks/whatsapp`.
3. _Verify token_: el mismo valor de `META_VERIFY_TOKEN`.
4. Suscribir el campo `messages` del objeto `whatsapp_business_account`.
5. Guardar el valor de _App secret_ de _App settings → Basic_ en `META_APP_SECRET`.

Cuándo Meta llame al `GET`, el servidor responderá el `hub.challenge` solo si el
`hub.verify_token` coincide (comparación en tiempo constante).

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
- `WHATSAPP_DRY_RUN=false` y un `tokenAcceso` real para la cuenta (guardado por
  `npm run db:seed`).
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
`dry-run-...` y guarda el saliente sin llamar a Meta) y después con `false`.

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

El worker (`npm run worker`) hace polling cada `WHATSAPP_SEGUIMIENTOS_INTERVALO_MS`
y procesa hasta `WHATSAPP_SEGUIMIENTOS_LOTE` seguimientos vencidos:
reverifica la regla y el estado comercial (`VerificadorEstadoComercial`), resuelve
la cuenta/contacto de la conversación y envía por **plantilla** (o texto si la
regla no tiene plantilla). Los `parametros` de la regla llenan los `{{1}}`,
`{{2}}`, ... de la plantilla y admiten placeholders `{{nombre}}`, `{{id_wa}}`,
`{{telefono}}` y `{{cuenta}}`, resueltos con los datos de la conversación. Los
envíos con plantilla funcionan fuera de la ventana de 24 h; el mensaje saliente se
persiste con `tipo` y `estado='enviado'`. Si el envío falla se marca `fallido` sin
persistir el saliente. El worker cierra ordenadamente con `SIGINT`/`SIGTERM`.

Con `WHATSAPP_PAUSAR_SEGUIMIENTOS_POR_RESPUESTA=true`, cada mensaje entrante
**nuevo** (idempotente ante reintentos de Meta) cancela los seguimientos
`pendiente` de esa conversación con motivo `respuesta_cliente`; los ya `enviado`
no se tocan y el webhook nunca falla por un error de esta pausa.

## Bot de captura de leads (Fase 4)

Con `WHATSAPP_BOT_ACTIVO=true` (por defecto), cada mensaje entrante **nuevo**
dispara el flujo de captura del módulo `autorespuestas`:

- El **guion** vive en `guion_flujo_lead` (`clave`, `orden`, `texto`, `activo`) y
  se siembra con `npm run db:seed`: `bienvenida`, `pedir_nombre`, `pedir_correo`,
  `correo_invalido`, `pedir_modelos`, `pedir_cantidad`, `cantidad_invalida`,
  `pedir_ciudad` y `confirmacion`. Se puede editar sin desplegar.
- Al primer mensaje se crea un **lead** por conversación (`leads`) y se pide el
  nombre; después correo (validado), modelos, cantidad (entero > 0) y ciudad. Un
  dato inválido o un mensaje no-texto vuelve a pedir el paso actual.
- Al completar se guarda `completado_en`, el lead pasa a `listo_pipedrive` y se
  envía la confirmación; el bot deja de responder esa conversación (la
  sincronización con Pipedrive llega en una fase posterior).
- Las respuestas salen por `EnviarMensajeSaliente` (misma ventana de atención y
  `DRY_RUN`). Un fallo del bot se registra y **no** tumba la recepción del webhook.

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

Probar un envío (requiere `API_INTERNAL_KEY` y, en real, `tokenAcceso` + `DRY_RUN=false`):

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

Ver `docs/architecture.md` y `docs/business-rules.md` para detalles.

## Pendiente

- Motor de respuestas / chatbot.
- Integración con Pipedrive.

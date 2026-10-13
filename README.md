# desitec-bot-whatsapp

Bot de WhatsApp empresarial para Desitec basado en la **Meta WhatsApp Cloud API**,
**Fastify**, **TypeScript** (Clean/Hexagonal), **PostgreSQL** y **Drizzle ORM**.

Estado actual (Fase 1): recepción segura de webhooks, identificación de tres
números empresariales independientes, persistencia de mensajes entrantes y de
conversaciones. **No** envía mensajes todavía (modo `WHATSAPP_DRY_RUN`).

## Stack

- Node.js 24, TypeScript (strict, ESM/NodeNext), Fastify 5, PostgreSQL, Drizzle ORM,
  Zod, Pino, Vitest.
- Sin dependencias nuevas en Fase 1: HMAC-SHA256 con `node:crypto`.

## Comandos

Ejecutar **siempre en PowerShell de Windows** (el proyecto vive en Windows y la
copia de WSL solo edita archivos — nunca `npm install`/builds dentro de WSL).

```powershell
npm install
npm run typecheck        # tsc --noEmit
npm run lint             # eslint .
npm test                 # vitest run
npm run db:generate      # generar migración Drizzle
npm run db:migrate       # aplicar migraciones
npm run db:seed          # cargar/actualizar las cuentas de WhatsApp desde .env
npm run dev              # servidor HTTP (tsx watch src/servidor.ts)
npm run worker           # worker de seguimientos (placeholder)
npm run build            # tsc -p tsconfig.build.json -> dist/
npm run start            # node dist/servidor.js
```

## Variables de entorno

Ver `.env.example`:

- `DATABASE_URL`
- `META_APP_SECRET` — valida `X-Hub-Signature-256`.
- `META_VERIFY_TOKEN` — reto GET de verificación.
- `META_ACCESS_TOKEN` — **aún sin uso** (previsto para envíos en fases siguientes).
- `META_API_VERSION`
- `WHATSAPP_DRY_RUN` — `true` por defecto; no enviar mensajes reales.
- `WHATSAPP_ACCOUNTS` — JSON con las cuentas a sembrar (`codigo`, `nombreComercial`,
  `idNumeroTelefono`, `telefonoVisible`, `activa`).
- `WEBHOOK_BODY_LIMIT` — límite de cuerpo HTTP (bytes).

Nunca se versionan credenciales reales (`.gitignore` excluye `.env*` salvo `.env.example`).

## Endpoints

| Método | Ruta | Descripción |
| ------ | ---- | ----------- |
| GET | `/health` | Liveness. |
| GET | `/webhooks/whatsapp` | Verificación del webhook de Meta (`hub.challenge`). |
| POST | `/webhooks/whatsapp` | Eventos de WhatsApp (firma HMAC obligatoria). |

## Webhook en Meta for Developers

1. En la app de Meta for Developers, sección *WhatsApp → Configuration*.
2. *Webhook callback URL*: `https://<tu-dominio>/webhooks/whatsapp`.
3. *Verify token*: el mismo valor de `META_VERIFY_TOKEN`.
4. Suscribir el campo `messages` del objeto `whatsapp_business_account`.
5. Guardar el valor de *App secret* de *App settings → Basic* en `META_APP_SECRET`.

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

## Estructura

```
src/
  app.ts, servidor.ts, trabajador.ts
  shared/            configuracion, registro, errores, bd (esquema + cliente + sembrado), http, seguridad
  modules/
    whatsapp/        verificacion, resolucion de cuentas, recepcion de eventos, HMAC
    contacts/        BuscarOCrearContacto
    conversations/   BuscarOCrearConversacion, mensajes y transaccion entrante
    pipedrive/       (pendiente, fase posterior)
    followups/       (pendiente, fase posterior)
tests/               pruebas Vitest (unitarias con fakes + fastify.inject)
docs/                arquitectura y reglas de negocio
drizzle/             migraciones (generadas con npm run db:generate)
Dockerfile + compose.yaml   imagen de la app y pila local (db/app/worker)
```

Ver `docs/architecture.md` y `docs/business-rules.md` para detalles.

## Pendiente

- Envío real de mensajes (usar `META_ACCESS_TOKEN`, fuera de `DRY_RUN`).
- Motor de respuestas / chatbot.
- Integración con Pipedrive.
- Worker de seguimientos persistidos en PostgreSQL (skeleton Docker listo).
- Pipeline CI (`.github/workflows/ci.yml`) y pruebas de integración con PostgreSQL real.
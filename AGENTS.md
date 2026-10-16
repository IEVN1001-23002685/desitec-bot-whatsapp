# AGENTS.md

Reglas de desarrollo para OpenCode en el proyecto **desitec-bot-whatsapp**.

## Entorno Windows + WSL (obligatorio)

- Proyecto: paquete npm `desitec-bot-whatsapp`, repo GitHub `desitec-bot-whatsapp`. No cambiar nombre, gestor de paquetes ni stack.
- El desarrollo ocurre en Windows (VS Code/PowerShell). OpenCode corre **solo desde WSL** y accede a los archivos vía `/mnt/c/Users/Saul/Documents/Proyectos/Desitec/desitec-bot-whatsapp`.
- Node.js 24, npm, Git y Docker existen **solo en Windows**.
- **Nunca** ejecutar desde WSL: `npm install`, `npm run`, migraciones ni Docker. Ejecútalos en PowerShell de Windows.

  Consecuencias:
  - No crear otra copia del proyecto dentro del filesystem de WSL; editar siempre el directorio `/mnt/c/...`.
  - No ejecutar builds/CLIs que generen dependencias o artefactos de compilación Linux dentro del `node_modules` de Windows.
  - Para verificar (typecheck, lint, tests, build, migraciones) proporciona los comandos de PowerShell y solicita sus resultados en vez de ejecutarlos tú.

## Comandos (script de npm en package.json)

- `npm run dev` — servidor HTTP con `tsx watch src/servidor.ts`
- `npm run worker` — worker `tsx watch src/trabajador.ts`
- `npm run build` — `tsc -p tsconfig.json` → `dist/`
- `npm run start` — `node dist/servidor.js`
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — `eslint .`
- `npm run format` — `prettier --write .` (formatea todo el repo)
- `npm run format:check` — `prettier --check .` (verificación usada en CI)
- `npm test` — `vitest run` (un solo test: `npx vitest run <ruta>`)
- `npm run test:integracion` — `vitest run --config vitest.integracion.config.ts`; usa una BD dedicada `desitec_bot_test` que se crea y migra sola (requiere `docker compose up -d --wait db`). Los archivos corren secuenciales (`fileParallelism: false`) porque comparten la misma BD.
- `npm run db:generate` — `drizzle-kit generate` → `drizzle/`
- `npm run db:migrate` — `tsx src/shared/db/migrar.ts` (migrador de `drizzle-orm`; usa este en vez de `drizzle-kit migrate`, que en 0.31.x oculta los errores de migración y sale con código 1 sin mensaje). Antes de migrar/sembrar, espera a Postgres con `docker compose up -d --wait db` (el `healthcheck` usa `pg_isready -h 127.0.0.1` por TCP); `db:migrate` y `db:seed` además reintentan la conexión al arrancar.

No hay script de `test:watch`. El formato se aplica con `npm run format` y el CI lo verifica con `npm run format:check`; `.editorconfig` fuerza `insert_final_newline`/LF para evitar fallos de Prettier por newline final o CRLF.

## TypeScript / ESM

- `strict: true`, `module: nodenext`, ESM (`"type": "module"`).
- `verbatimModuleSyntax` activo → imports solo de tipos deben usar `import type { ... }`.
- `exactOptionalPropertyTypes` → no asignar `undefined` a propiedades opcionales; omítelas.
- `noUncheckedIndexedAccess` → el acceso por índice devuelve `T | undefined`; acota antes de usar.
- Imports relativos en ESM/NodeNext requieren extensión explícita: `import { x } from './a.js'`.
- Evitar `any` y `as` innecesarios.
- Estado actual: `tsconfig.json` tiene `"types": ["node"]`, por lo que los tipos de Node (`process`, `Buffer`, etc.) se cargan automáticamente.

## Arquitectura

- Monolito modular (Clean/Hexagonal): un único microservicio desplegable organizado en módulos independientes.
- Módulos en `src/modules/`: `whatsapp`, `pipedrive`, `contacts`, `conversations`, `followups`. Cada uno con las capas que necesite: `domain` (entidades, tipos, interfaces), `application` (casos de uso), `infrastructure` (persistencia/proveedores externos), `presentation` (rutas/validaciones HTTP).
- Regla de dependencias: el `domain` **no** puede depender de Fastify, Drizzle, Meta ni Pipedrive; las dependencias apuntan hacia las capas internas.
- `src/shared/` para configuración, logging (Pino), errores y base de datos; `src/app.ts`, `src/servidor.ts`, `src/trabajador.ts`; `drizzle/`, `tests/`, `docs/adr/`, `scripts/`.
- El worker es un proceso separado que procesará seguimientos persistidos en PostgreSQL — no usar temporizadores en memoria como mecanismo de programación.
- Patrones permitidos cuando haya necesidad real: Repository, Adapter, Strategy, State Machine, DI, Event-Driven, Outbox/Inbox. No crear abstracciones decorativas. Sin Redis/RabbitMQ/NestJS/Prisma/React sin justificación.

## Persistencia

- PostgreSQL + Drizzle. Tablas: cuentas empresariales de WhatsApp (`cuentas_whatsapp` incluye `token_acceso` —token de Meta por número—), contactos, conversaciones, mensajes, referencias a persona/deal de Pipedrive, reglas de seguimiento, seguimientos programados, eventos de webhook procesados.
- Cada conversación conserva el número empresarial que la originó; un teléfono puede corresponder a varias oportunidades → no asumir unicidad.
- Fechas con zona horaria; toda relación debe quedar indexada.
- Cambios de esquema ⇒ generar migración con `npm run db:generate` y aplicar con `db:migrate`.

## Seguridad y reglas comerciales

- Modo `DRY_RUN` activado por defecto: sin envíos reales en desarrollo. No implementar envíos reales sin credenciales, validación y pruebas.
- Webhooks de Meta: validar firma HMAC-SHA256 con el **cuerpo original** de la solicitud (raw body). Webhooks de Pipedrive según su mecanismo oficial.
- Idempotencia: eventos repetidos no ejecutan acciones comerciales dos veces.
- Todos los llamados externos manejan errores y timeouts; los registros no exponen tokens ni datos personales innecesarios.
- Seguimientos: reverificar el estado comercial antes de enviar, respetar consentimiento/cancelación, pausar la secuencia cuando el cliente responde, usar plantillas aprobadas de Meta fuera de la ventana de atención.
- **Fase 2 (envío):** el caso de uso `EnviarMensajeSaliente` valida la ventana de atención (flag `WHATSAPP_VENTANA_ATENCION_ACTIVA`) y usa `ProveedorMetaMensajes` (fetch con AbortController). Los salientes se persisten con `direccion='saliente'`, `id_mensaje_meta` y `estado`. Si el envío falla a Meta, **no** se persiste el mensaje saliente.
- **Endpoint interno:** `POST /api/mensajes` y `POST /api/seguimientos` exigen `x-api-key-interna` igual a `API_INTERNAL_KEY` (comparación en tiempo constante); si no hay `API_INTERNAL_KEY`, las rutas no se registran (404).
- **Fase 3 (seguimientos):** el módulo `followups` usa tablas `plantillas_whatsapp`, `reglas_seguimiento` y `seguimientos_programados` (una por conversación+regla). `ProgramarSeguimientos` los crea desde las reglas activas; el worker (`npm run worker`) procesa lotes de vencidos con `ProcesarSeguimientosPendientes`/`EnviarSeguimientoProgramado` (reverifica regla activa y `VerificadorEstadoComercial`, resuelve el destino de la conversación, interpola `reglas_seguimiento.parametros` con `{{nombre}}`/`{{id_wa}}`/`{{telefono}}`/`{{cuenta}}` y envía por plantilla o texto). Nunca usar temporizadores en memoria. El worker hace polling cada `WHATSAPP_SEGUIMIENTOS_INTERVALO_MS` (lote `WHATSAPP_SEGUIMIENTOS_LOTE`) y cierra ordenadamente con `SIGINT`/`SIGTERM`. Con `WHATSAPP_PAUSAR_SEGUIMIENTOS_POR_RESPUESTA=true` (default `false`), un mensaje entrante nuevo pausa los seguimientos `pendiente` de la conversación (motivo `respuesta_cliente`) vía `PausadorSeguimientosRespuesta`, de forma best-effort.
- No exponer endpoints de webhook que aparenten validar eventos sin validarlos: si la verificación no está implementada, el endpoint queda explícitamente bloqueado.
- No incluir claves, tokens ni datos personales reales en el repo (ver `.env.example`).

## Estructura esperada del repo

Presente: `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`, `.gitattributes`, `.editorconfig`, `.prettierignore`, `node_modules/`.
Creados con la Fase 1: `eslint.config.js`, `.prettierrc`, `.env.example`, `drizzle.config.ts`, `README.md`, `Dockerfile`, `compose.yaml`, `.dockerignore`, `.github/workflows/ci.yml`.
Incluye `scripts/` para utilidades manuales.

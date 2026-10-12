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

- `npm run dev` — servidor HTTP con `tsx watch src/server.ts`
- `npm run worker` — worker `tsx watch src/worker.ts`
- `npm run build` — `tsc -p tsconfig.json` → `dist/`
- `npm run start` — `node dist/server.js`
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — `eslint .`
- `npm test` — `vitest run` (un solo test: `npx vitest run <ruta>`)
- `npm run db:generate` / `npm run db:migrate` — `drizzle-kit generate` / `migrate`

No hay scripts de `format` ni `test:watch`; Prettier corre vía CLI (`npx prettier --write .`).

## TypeScript / ESM

- `strict: true`, `module: nodenext`, ESM (`"type": "module"`).
- `verbatimModuleSyntax` activo → imports solo de tipos deben usar `import type { ... }`.
- `exactOptionalPropertyTypes` → no asignar `undefined` a propiedades opcionales; omítelas.
- `noUncheckedIndexedAccess` → el acceso por índice devuelve `T | undefined`; acota antes de usar.
- Imports relativos en ESM/NodeNext requieren extensión explícita: `import { x } from './a.js'`.
- Evitar `any` y `as` innecesarios.
- Estado actual: `tsconfig.json` tiene `"types": []`, por lo que `@types/node` (instalado) **no se carga** automáticamente; al usar `process`/`Buffer`/globals de Node hay que agregar `"node"` a `types` o declarar los tipos explícitamente.

## Arquitectura

- Monolito modular (Clean/Hexagonal): un único microservicio desplegable organizado en módulos independientes.
- Módulos en `src/modules/`: `whatsapp`, `pipedrive`, `contacts`, `conversations`, `followups`. Cada uno con las capas que necesite: `domain` (entidades, tipos, interfaces), `application` (casos de uso), `infrastructure` (persistencia/proveedores externos), `presentation` (rutas/validaciones HTTP).
- Regla de dependencias: el `domain` **no** puede depender de Fastify, Drizzle, Meta ni Pipedrive; las dependencias apuntan hacia las capas internas.
- `src/shared/` para configuración, logging (Pino), errores y base de datos; `src/app.ts`, `src/server.ts`, `src/worker.ts`; `drizzle/`, `tests/`, `docs/adr/`.
- El worker es un proceso separado que procesará seguimientos persistidos en PostgreSQL — no usar temporizadores en memoria como mecanismo de programación.
- Patrones permitidos cuando haya necesidad real: Repository, Adapter, Strategy, State Machine, DI, Event-Driven, Outbox/Inbox. No crear abstracciones decorativas. Sin Redis/RabbitMQ/NestJS/Prisma/React sin justificación.

## Persistencia

- PostgreSQL + Drizzle. Tablas previstas: cuentas empresariales de WhatsApp, contactos, conversaciones, mensajes, referencias a persona/deal de Pipedrive, reglas de seguimiento, seguimientos programados, eventos de webhook procesados.
- Cada conversación conserva el número empresarial que la originó; un teléfono puede corresponder a varias oportunidades → no asumir unicidad.
- Fechas con zona horaria; toda relación debe quedar indexada.
- Cambios de esquema ⇒ generar migración con `npm run db:generate` y aplicar con `db:migrate`.

## Seguridad y reglas comerciales

- Modo `DRY_RUN` activado por defecto: sin envíos reales en desarrollo. No implementar envíos reales sin credenciales, validación y pruebas.
- Webhooks de Meta: validar firma HMAC-SHA256 con el **cuerpo original** de la solicitud (raw body). Webhooks de Pipedrive según su mecanismo oficial.
- Idempotencia: eventos repetidos no ejecutan acciones comerciales dos veces.
- Todos los llamados externos manejan errores y timeouts; los registros no exponen tokens ni datos personales innecesarios.
- Seguimientos: reverificar el estado comercial antes de enviar, respetar consentimiento/cancelación, pausar la secuencia cuando el cliente responde, usar plantillas aprobadas de Meta fuera de la ventana de atención.
- No exponer endpoints de webhook que aparenten validar eventos sin validarlos: si la verificación no está implementada, el endpoint queda explícitamente bloqueado.
- No incluir claves, tokens ni datos personales reales en el repo (ver `.env.example`).

## Estructura esperada del repo

Presente: `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`, `node_modules/`.
Pendiente de crear (no lo borres de la planificación): `eslint.config.js`, `.prettierrc`, `.env.example`, `drizzle.config.ts`, `Dockerfile`, `compose.yaml`, `README.md`, `.github/workflows/ci.yml`.
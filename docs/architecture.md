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

| Módulo                  | Responsabilidad                                                                 |
| ----------------------- | ------------------------------------------------------------------------------- |
| `whatsapp`              | Verificación, resolución de cuenta, recepción y normalización de eventos, HMAC. |
| `contacts`              | Entidad Contacto y su repositorio.                                              |
| `conversations`         | Entidades Conversación/Mensaje y sus repositorios.                              |
| `pipedrive` (pendiente) | Integración con Pipedrive (fase posterior).                                     |
| `followups` (pendiente) | Seguimientos programados (fase posterior).                                      |

## Flujo del webhook (POST /webhooks/whatsapp)

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
8. Los estados (`statuses`) actualizan el estado del mensaje existente si existe.
9. El servidor responde **200 solo después de persistir**: si algo falla se lanza
   el error (5xx) para que Meta reintente.

## Casos de uso

- `VerificarWebhookWhatsApp` — reto GET con comparación segura.
- `RecibirEventoWhatsApp` — orquesta el procesamiento de un webhook.
- `ResolverCuentaWhatsApp` — cuenta por `phone_number_id`.
- `RegistrarMensajeEntrante` — transacción contacto + conversación + mensaje.
- `BuscarOCrearContacto` / `BuscarOCrearConversacion` — búsqueda y creación idempotentes.

## Transaccionalidad

`TransaccionMensajeEntrante` (puerto en `whatsapp/application/ports`) expone
`ejecutar(trabajo)`; la implementación `TransaccionDrizzleMensajeEntrante` abre
`bd.transaccion` y construye los repositorios enlazados a la transacción,
garantizando atomicidad entre contacto, conversación y mensaje.

## Esquema de datos

Definido con Drizzle en `shared/db/schema/`. Tablas:

- `cuentas_whatsapp` — cuentas empresariales (código interno, `id_numero_telefono`,
  número visible, activa).
- `contactos` — contactos únicos por `id_wa`.
- `conversaciones` — una por cuenta+contacto (índice único compuesto).
- `mensajes` — mensajes con `id_mensaje_meta` único (dedupe) y `carga_util` jsonb.
- `eventos_webhook` — auditoría/idempotencia con `clave_evento` único y estado.

Las fechas usan `timestamptz`. Las migraciones se generan con `npm run db:generate`.

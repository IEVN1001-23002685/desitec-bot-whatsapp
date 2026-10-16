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
| `followups`             | Plantillas, reglas y seguimientos programados; programación y procesamiento.    |

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
8. Si el mensaje se insertó (no era duplicado) y
   `WHATSAPP_PAUSAR_SEGUIMIENTOS_POR_RESPUESTA` está activo,
   `PausadorSeguimientosRespuesta` (adapter en `followups/infrastructure/adapters`
   que implementa el puerto `whatsapp/application/ports/pausador-seguimientos`)
   cancela los seguimientos `pendiente` de la conversación con motivo
   `respuesta_cliente`. Es best-effort: un fallo se registra y no rompe el webhook.
9. Los estados (`statuses`) actualizan el estado del mensaje existente si existe.
10. El servidor responde **200 solo después de persistir**: si algo falla se lanza
    el error (5xx) para que Meta reintente.

## Casos de uso

- `VerificarWebhookWhatsApp` — reto GET con comparación segura.
- `RecibirEventoWhatsApp` — orquesta el procesamiento de un webhook.
- `ResolverCuentaWhatsApp` — cuenta por `phone_number_id`.
- `RegistrarMensajeEntrante` — transacción contacto + conversación + mensaje.
- `BuscarOCrearContacto` / `BuscarOCrearConversacion` — búsqueda y creación idempotentes.
- `ProgramarSeguimientos` — crea seguimientos para las reglas activas de una conversación.
- `EnviarSeguimientoProgramado` — reverifica regla/estado comercial y envía por plantilla o texto.
- `ProcesarSeguimientosPendientes` — orquesta un lote de seguimientos vencidos.

## Flujo del worker (src/trabajador.ts)

Proceso separado del servidor HTTP (sin Fastify). En cada ciclo:

1. `ProcesarSeguimientosPendientes` pide a `RepositorioSeguimientoProgramado` los
   seguimientos `pendiente` con `programado_para <= ahora` (hasta el tamaño de
   lote configurado).
2. Cada seguimiento se marca `en_proceso` y se envía con `EnviarSeguimientoProgramado`:
   carga la regla activa, verifica `VerificadorEstadoComercial`, resuelve el
   destino (`RepositorioDestinoSeguimiento`: cuenta + contacto de la conversación)
   y envía con `ProveedorMensajes` (plantilla si `id_plantilla`, si no texto). Los
   `parametros` de la regla se interpolan con `interpolarVariables` (helper en
   `shared/texto`) usando nombre del contacto, `id_wa`, teléfono visible y nombre
   de la cuenta.
3. Éxito → `enviado`; fallo de envío → `fallido`; regla inactiva/conversación
   inexistente/estado comercial no vigente → `cancelado`. El saliente se persiste
   vía `TransaccionMensajeEntrante` (`insertarSaliente` + `actualizarUltimoMensaje`).
4. El ciclo se repite cada `WHATSAPP_SEGUIMIENTOS_INTERVALO_MS`, sin solaparse, y
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
  número visible, activa).
- `contactos` — contactos únicos por `id_wa`.
- `conversaciones` — una por cuenta+contacto (índice único compuesto).
- `mensajes` — mensajes con `id_mensaje_meta` único (dedupe) y `carga_util` jsonb.
- `eventos_webhook` — auditoría/idempotencia con `clave_evento` único y estado.
- `plantillas_whatsapp` — plantillas aprobadas de Meta (`nombre_meta`, `idioma`, `componentes`).
- `reglas_seguimiento` — reglas por cuenta (demora, plantilla o cuerpo,
  `parametros` jsonb con los valores de la plantilla, `activa`).
- `seguimientos_programados` — seguimientos por conversación+regla (único) con
  `programado_para`, `estado`, `intentos`, `id_mensaje_meta`, `error`,
  `motivo_cancelacion` y `enviado_en`.

Las fechas usan `timestamptz`. Las migraciones se generan con `npm run db:generate`.
El método `ProcesarSeguimientosPendientes` de los repositorios Drizzle filtra por
`estado`+`programado_para` (índice) para no cargar toda la tabla.

# ADR-0002 — Inbox asíncrono y token por cuenta para el webhook de 360dialog

- Estado: aceptado
- Fecha: 2026-10-19
- Decisión: `Fase 5`

## Contexto

360dialog entrega los webhooks de Coexistence con un tiempo de espera de ~5 s.
El procesamiento completo (resolver cuenta, transacción contacto+conversación,
pausa de seguimientos, máquina de pasos del bot con envíos salientes) puede
superar ese límite y provocar reintentos y duplicados. Además, 360dialog no usa
la firma HMAC de Meta: cada número tiene su propio token de webhook, y el
payload no siempre indica la cuenta por un `field` fijo (los eventos de
sincronización usan `{ id, event, data: { metadata } }`).

## Decisión

- **Inbox asíncrono**: `POST /webhooks/360dialog` solo autentica, valida la forma
  externa, persiste el evento (`fuente='360dialog'`, `estado='recibido'`,
  `carga_util_original`) y responde 200. El worker drena los pendientes con
  `ProcesarEventosWebhookPendientes`.
- **Misma lógica de negocio que Meta**: el normalizador compartido
  `ProcesarPayloadWhatsApp` procesa mensajes, estados, ecos, pausa de
  seguimientos y bot; no se duplican reglas por proveedor.
- **Token por cuenta**: se resuelve la cuenta por `metadata.phone_number_id` y se
  compara `X-Webhook-Token` en tiempo constante contra el secreto que indica
  `cuentas_whatsapp.webhook_secret_ref` (variable de entorno). Cuenta
  desconocida, token ausente o incorrecto → 401.
- **Idempotencia**: `clave_evento = SHA-256(cuerpo crudo)`; un duplicado responde
  200 sin crear otro evento. Un evento `fallido` se reintenta en el siguiente
  ciclo del worker.
- **Coexistence**: `smb_message_echoes` se registra como saliente humano
  (`insertarSalienteHumano`, dedupe por `id_mensaje_meta`) y pausa seguimientos
  con motivo `respuesta_asesor`; no dispara el bot. `smb_app_state_sync` y
  `history` se marcan `ignorado`.

## Consecuencias

- La ruta responde rápido y es segura ante reintentos de 360dialog.
- Los eventos quedan auditables y reintentables desde PostgreSQL (sin perder
  cargas que la normalización no reconozca: se marcan `ignorado`).
- El worker debe estar corriendo para que los mensajes de 360dialog se procesen;
  el servidor por sí solo no ejecuta acciones comerciales sobre estos eventos.
- Los secretos de webhook viven en el entorno, nunca en la base de datos.

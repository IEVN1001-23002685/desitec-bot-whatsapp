# Reglas de negocio — desitec-bot-whatsapp

## Cuentas empresariales (números)

- El sistema soporta **tres líneas numeradas independientes** y es escalable a más.
- Nunca se codifican los números dentro de los controladores: se resuelven desde
  la tabla `cuentas_whatsapp` por `id_numero_telefono` de Meta.
- Cada conversación conserva la cuenta que la originó (`id_cuenta_whatsapp`).
- Un mismo cliente (mismo `id_wa`) puede tener **conversaciones independientes** en
  distintas líneas; la unicidad de conversación es (cuenta, contacto).

## Recepción segura

- Todo `POST /webhooks/whatsapp` exige firma `X-Hub-Signature-256` válida
  (HMAC-SHA256 con `META_APP_SECRET` sobre el cuerpo original). Sin firma → 401.
- El reto GET requiere comparación en tiempo constante de `hub.verify_token`.
- Los eventos malformados se rechazan con 400 sin efectos secundarios.
- No se responde 200 si la persistencia requerida aún no está confirmada.

## Idempotencia y deduplicación

1. **Por evento**: `eventos_webhook.clave_evento` = SHA-256 del cuerpo crudo
   (único). Reenvíos idénticos de Meta se ignoran salvo que el evento previo
   quedara `fallido` o `recibido` (permite reintentos seguros).
2. **Por mensaje**: `mensajes.id_mensaje_meta` único (`ON CONFLICT DO NOTHING`),
   de modo que un mismo `wamid` jamás se inserta dos veces aunque se reprocese.

## Mensajes y tipos

- Tipos de mensaje no soportados (imagen, video, audio, location, etc.) se
   **registran** (`tipo` guardada, `cuerpo = null`, payload en `carga_util` jsonb)
   sin romper la solicitud.
- Los eventos de `statuses` (entregados/leídos) **no** crean mensajes entrantes;
   actualizan el estado del mensaje referenciado si existe.
- `id_wa` e `id_numero_telefono` se validan con patrones estrictos antes de usar.

## Envíos

- Fase 1 **no envía mensajes**. `META_ACCESS_TOKEN` queda preparado pero sin uso.
- `WHATSAPP_DRY_RUN=true` por defecto: sin envíos reales en desarrollo.
- Habilitar envíos reales requiere implementar plantillas aprobadas, ventana de
  24 h y respetar consentimiento — fuera del alcance de esta fase.

## Privacidad y logs

- No se registran tokens, firmas ni números telefónicos completos.
  `enmascararTelefono(() => '***####')` en logs de diagnóstico y Pino `redact` en
  Payload de serializadores.
- Los eventos se almacenan de forma controlada (`eventos_webhook.carga_util_original`);
  no se duplican datos personales innecesariamente.

## Pauta de cambios de esquema

Todo cambio de esquema genera migración no destructiva (`npm run db:generate` y
`npm run db:migrate` desde PowerShell).
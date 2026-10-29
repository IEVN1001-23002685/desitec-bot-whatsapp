# Meta WhatsApp Cloud API - Integración con desitec-bot-whatsapp

## Objetivo

Conectar el bot a Meta WhatsApp Cloud API usando el número virtual de prueba, reutilizando la arquitectura existente (sin duplicar lógica comercial).

## Requisitos previos

- App creada en [Meta for Developers](https://developers.facebook.com)
- Producto WhatsApp añadido
- Número de prueba de WhatsApp Cloud API
- Token permanente del número de prueba
- App Secret
- URL pública para webhook (Cloudflare Tunnel / ngrok)

## Configuración

### 1) Variables de entorno

Copia `.env.meta.test` a `.env` (o crea uno nuevo) y completa:

- `META_APP_SECRET`
- `META_VERIFY_TOKEN` (elige uno)
- `META_API_VERSION` (recomendado `v21.0`)
- `META_TOKEN_META_PRUEBA` (token permanente)
- `WHATSAPP_ACCOUNTS` con `proveedor: "meta"`, `idNumeroTelefono` = Phone Number ID, `credencialRef: "META_TOKEN_META_PRUEBA"`

Mantén:

```env
WHATSAPP_DRY_RUN=true
WHATSAPP_SEGUIMIENTOS_ACTIVOS=false
WHATSAPP_BOT_ACTIVO=false
```

### 2) Base de datos

```powershell
cd C:\Users\Saul\Documents\Proyectos\Desitec\desitec-bot-whatsapp
docker compose up -d --wait db
npm run db:migrate
```

Si quieres usar una BD separada para pruebas Meta: crea `desitec_bot_meta_test` en Postgres y ajusta `DATABASE_URL`.

### 3) Levantar servicios

```powershell
# Terminal 1
npm run dev

# Terminal 2
npm run worker

# Terminal 3
cloudflared tunnel --url http://localhost:3000
# o ngrok http 3000
```

## Configurar webhook en Meta

1. WhatsApp → Configuración → Webhook → Editar
2. URL de devolución de llamada: `https://<TU-TUNNEL>/webhooks/whatsapp`
3. Token de verificación: valor de `META_VERIFY_TOKEN`
4. Verificar y guardar
5. Suscribirse a `messages`

El servidor debe responder al GET de verificación con el `hub.challenge`.

## Verificación

### Recepción

Envía un mensaje desde un teléfono tester al número de prueba. Revisar logs:

- `POST /webhooks/whatsapp` → firma válida, evento persistido
- Worker procesa evento `recibido` → registrado como entrante
- Si `WHATSAPP_BOT_ACTIVO=true` y número permitido → bot responde

### Envío (DRY_RUN)

```powershell
curl -X POST http://localhost:3000/api/mensajes `
  -H "Content-Type: application/json" `
  -H "x-api-key-interna: <API_INTERNAL_KEY>" `
  -d '{"codigoCuenta":"meta-prueba","idWa":"<NUMERO_TESTER>","tipo":"text","cuerpo":"Hola"}'
}
```

En DRY_RUN se simula el envío, no se envía a Meta. El mensaje saliente se persiste si el envío simulado es exitoso según lógica actual.

### Idempotencia

Reenviar el mismo webhook (mismo cuerpo) debe ignorarse si ya está procesado/ignorado.

## Troubleshooting

- **Firma inválida**: Verificar `META_APP_SECRET` correcto. Firma debe verificarse sobre **cuerpo crudo**.
- **Challenge falla**: Verificar `META_VERIFY_TOKEN` coincide.
- **Cuenta no encontrada**: Verificar `idNumeroTelefono` (Phone Number ID) en `WHATSAPP_ACCOUNTS`.
- **Token inválido**: Verificar token permanente del número de prueba.
- **Bot no responde**: Verificar `WHATSAPP_BOT_ACTIVO=true`, número en allowlist o vacío, evento procesado por worker.

## Seguridad

- No enviar mensajes reales sin autorización.
- Mantener `WHATSAPP_DRY_RUN=true` para pruebas.
- Secretos solo en `.env`, nunca en Git.
- No registrar migrar número comercial.

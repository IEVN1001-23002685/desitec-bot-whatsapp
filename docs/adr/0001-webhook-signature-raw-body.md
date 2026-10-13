# ADR-0001 — Cuerpo original y firma HMAC en el webhook de WhatsApp

- Estado: aceptado
- Fecha: 2026-10-12
- Decisión: `Fase 1`

## Contexto

Meta firma cada webhook con `X-Hub-Signature-256` calculado sobre el **cuerpo
HTTP original**. Fastify, por defecto, lee el body como JSON y no expone los
bytes crudos, por lo que la comparación con el payload re-serializado fallaría.

## Decisión

- Registrar un content-type parser propio para `application/json` con
  `parseAs: 'buffer'` (`src/shared/http/cuerpo-crudo.ts`) que:
  - preserva los bytes exactos en `solicitud.cuerpoCrudo`;
  - parsea JSON para el flujo normal.
- Verificar la firma con HMAC-SHA256 (`node:crypto`) y `timingSafeEqual` sobre
  `solicitud.cuerpoCrudo`.
- Límite de cuerpo (`bodyLimit`, configurable vía `WEBHOOK_BODY_LIMIT`) para
  prevenir cuerpos desmedidos.

## Consecuencias

- La firma siempre se valida contra el payload tal como llegó.
- Firma inválida → `401 INVALID_SIGNATURE` sin efectos secundarios.
- Durabilidad: solo se responde `200` después de persistir el evento y mensajes.

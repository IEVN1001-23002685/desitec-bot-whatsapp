import { describe, it, expect } from 'vitest'
import { crearAppPrueba } from './helpers/en-memoria.js'

describe('GET /webhooks/whatsapp (verificacion de Meta)', () => {
  const tokenVerificacion = 'verify-token-123'
  const { app } = crearAppPrueba({ cuentas: [], tokenVerificacion })

  it('responde el challenge cuando el token es correcto', async () => {
    const resp = await app.inject({
      method: 'GET',
      url: `/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${tokenVerificacion}&hub.challenge=challenge-abc`,
    })

    expect(resp.statusCode).toBe(200)
    expect(resp.headers['content-type']).toContain('text/plain')
    expect(resp.body).toBe('challenge-abc')
  })

  it('rechaza con 403 cuando el token es incorrecto', async () => {
    const resp = await app.inject({
      method: 'GET',
      url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=challenge-abc',
    })

    expect(resp.statusCode).toBe(403)
    expect(resp.json()).toEqual({ error: 'WEBHOOK_VERIFICATION_FAILED' })
  })

  it('rechaza con 403 cuando faltan parametros', async () => {
    const resp = await app.inject({
      method: 'GET',
      url: '/webhooks/whatsapp?hub.mode=subscribe',
    })

    expect(resp.statusCode).toBe(403)
    expect(resp.json()).toEqual({ error: 'WEBHOOK_VERIFICATION_FAILED' })
  })

  it('rechaza con 403 cuando hub.mode no es subscribe', async () => {
    const resp = await app.inject({
      method: 'GET',
      url: `/webhooks/whatsapp?hub.mode=unsubscribe&hub.verify_token=${tokenVerificacion}&hub.challenge=challenge-abc`,
    })

    expect(resp.statusCode).toBe(403)
  })
})
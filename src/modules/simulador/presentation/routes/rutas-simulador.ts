import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { eq, and } from 'drizzle-orm'
import type { BaseDeDatos } from '../../../../shared/db/tipos.js'
import {
  contactos,
  conversaciones,
  cuentasWhatsApp,
  leads,
  mensajes,
} from '../../../../shared/db/schema/index.js'
import type { RecibirEventoWhatsApp } from '../../../whatsapp/application/use-cases/recibir-evento-whatsapp.js'
import type { PayloadWebhookMeta } from '../../../whatsapp/domain/types/payload-webhook.js'

export type OpcionesRutasSimulador = {
  baseDeDatos: BaseDeDatos
  recibirEvento: RecibirEventoWhatsApp
  codigoCuenta: string
  idNumeroTelefono: string
  telefonoVisible: string
  idWaSimulado: string
  nombreContacto: string
}

const esquemaMensaje = z.object({
  texto: z.string().min(1).max(4096),
})

export function rutasSimulador(opciones: OpcionesRutasSimulador): FastifyPluginAsync {
  const {
    baseDeDatos,
    recibirEvento,
    codigoCuenta,
    idNumeroTelefono,
    telefonoVisible,
    idWaSimulado,
    nombreContacto,
  } = opciones

  async function obtenerEstado() {
    const [cuenta] = await baseDeDatos
      .select()
      .from(cuentasWhatsApp)
      .where(eq(cuentasWhatsApp.codigo, codigoCuenta))
      .limit(1)

    if (!cuenta) {
      return { cuenta: null, conversacionId: null, mensajes: [], lead: null }
    }

    const [contacto] = await baseDeDatos
      .select()
      .from(contactos)
      .where(eq(contactos.idWa, idWaSimulado))
      .limit(1)

    if (!contacto) {
      return {
        cuenta: { codigo: cuenta.codigo, nombreComercial: cuenta.nombreComercial },
        conversacionId: null,
        mensajes: [],
        lead: null,
      }
    }

    const [conversacion] = await baseDeDatos
      .select()
      .from(conversaciones)
      .where(
        and(
          eq(conversaciones.idCuentaWhatsApp, cuenta.id),
          eq(conversaciones.idContacto, contacto.id),
        ),
      )
      .limit(1)

    if (!conversacion) {
      return {
        cuenta: { codigo: cuenta.codigo, nombreComercial: cuenta.nombreComercial },
        conversacionId: null,
        mensajes: [],
        lead: null,
      }
    }

    const filasMensajes = await baseDeDatos
      .select()
      .from(mensajes)
      .where(eq(mensajes.idConversacion, conversacion.id))
      .orderBy(mensajes.creadoEn)

    const [lead] = await baseDeDatos
      .select()
      .from(leads)
      .where(eq(leads.idConversacion, conversacion.id))
      .limit(1)

    return {
      cuenta: { codigo: cuenta.codigo, nombreComercial: cuenta.nombreComercial },
      conversacionId: conversacion.id,
      mensajes: filasMensajes.map((m) => ({
        id: m.id,
        direccion: m.direccion,
        cuerpo: m.cuerpo,
        creadoEn: m.creadoEn,
        estado: m.estado,
      })),
      lead: lead
        ? {
            nombre: lead.nombre,
            correo: lead.correo,
            modelos: lead.modelos,
            cantidad: lead.cantidad,
            ciudad: lead.ciudad,
            pasoActual: lead.pasoActual,
            estado: lead.estado,
            completadoEn: lead.completadoEn,
          }
        : null,
    }
  }

  async function reiniciar() {
    const [cuenta] = await baseDeDatos
      .select()
      .from(cuentasWhatsApp)
      .where(eq(cuentasWhatsApp.codigo, codigoCuenta))
      .limit(1)

    if (!cuenta) {
      return
    }

    const [contacto] = await baseDeDatos
      .select()
      .from(contactos)
      .where(eq(contactos.idWa, idWaSimulado))
      .limit(1)

    if (!contacto) {
      return
    }

    const conversacionesSim = await baseDeDatos
      .select()
      .from(conversaciones)
      .where(
        and(
          eq(conversaciones.idCuentaWhatsApp, cuenta.id),
          eq(conversaciones.idContacto, contacto.id),
        ),
      )

    for (const conv of conversacionesSim) {
      await baseDeDatos.delete(mensajes).where(eq(mensajes.idConversacion, conv.id))
      await baseDeDatos.delete(leads).where(eq(leads.idConversacion, conv.id))
      await baseDeDatos.delete(conversaciones).where(eq(conversaciones.id, conv.id))
    }
  }

  return async (aplicacion) => {
    aplicacion.get('/simulador', async (_solicitud, respuesta) => {
      return respuesta.type('text/html; charset=utf-8').send(renderHtml())
    })

    aplicacion.get('/api/simulador/estado', async () => {
      return obtenerEstado()
    })

    aplicacion.post('/api/simulador/iniciar', async () => {
      await reiniciar()
      return obtenerEstado()
    })

    aplicacion.post('/api/simulador/reiniciar', async () => {
      await reiniciar()
      return { reiniciado: true }
    })

    aplicacion.post('/api/simulador/mensaje', async (solicitud, respuesta) => {
      const parseado = esquemaMensaje.safeParse(solicitud.body)
      if (!parseado.success) {
        return respuesta.status(400).send({ error: 'texto invalido' })
      }

      const payload: PayloadWebhookMeta = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'simulador',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: telefonoVisible,
                    phone_number_id: idNumeroTelefono,
                  },
                  contacts: [{ profile: { name: nombreContacto }, wa_id: idWaSimulado }],
                  messages: [
                    {
                      id: `sim-${randomUUID()}`,
                      from: idWaSimulado,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      type: 'text',
                      text: { body: parseado.data.texto },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }

      const cuerpoCrudo = Buffer.from(JSON.stringify(payload))
      await recibirEvento.ejecutar({ cuerpoCrudo, payload })
      return obtenerEstado()
    })
  }

  function renderHtml(): string {
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Simulador de conversaciones WhatsApp</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #f3f4f6; }
  .contenedor { max-width: 900px; margin: 0 auto; display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; padding: 1rem; }
  .chat { background: white; border-radius: 12px; display: flex; flex-direction: column; height: 80vh; }
  .mensajes { flex: 1; overflow: auto; padding: 1rem; }
  .burbuja { margin: .5rem 0; padding: .6rem .8rem; border-radius: 10px; max-width: 80%; white-space: pre-wrap; }
  .entrante { background: #e5e7eb; align-self: flex-start; }
  .saliente { background: #dcfce7; align-self: flex-end; margin-left: auto; }
  .fila { display: flex; gap: .5rem; padding: 1rem; border-top: 1px solid #e5e7eb; }
  input { flex: 1; padding: .6rem; }
  button { padding: .6rem 1rem; }
  .panel { background: white; border-radius: 12px; padding: 1rem; height: 80vh; overflow: auto; }
  .msg-meta { font-size: .75rem; color: #6b7280; }
</style>
</head>
<body>
<div class="contenedor">
  <div class="chat">
    <div class="mensajes" id="mensajes"></div>
    <div class="fila">
      <input id="texto" placeholder="Escribe un mensaje..." />
      <button id="enviar">Enviar</button>
      <button id="reiniciar">Reiniciar</button>
    </div>
  </div>
  <div class="panel">
    <h3>Estado</h3>
    <div id="cuenta"></div>
    <div id="conversacion"></div>
    <h4>Lead</h4>
    <pre id="lead"></pre>
  </div>
</div>
<script>
const mensajes = document.getElementById('mensajes');
const texto = document.getElementById('texto');
const lead = document.getElementById('lead');
const cuenta = document.getElementById('cuenta');
const conversacion = document.getElementById('conversacion');

function burbuja(m) {
  const div = document.createElement('div');
  div.className = 'burbuja ' + (m.direccion === 'entrante' ? 'entrante' : 'saliente');
  div.textContent = m.cuerpo || ('[' + m.direccion + ']');
  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.textContent = new Date(m.creadoEn).toLocaleTimeString();
  div.appendChild(meta);
  mensajes.appendChild(div);
}

async function refrescar() {
  const r = await fetch('/api/simulador/estado');
  const data = await r.json();
  mensajes.innerHTML = '';
  (data.mensajes || []).forEach(burbuja);
  mensajes.scrollTop = mensajes.scrollHeight;
  cuenta.textContent = data.cuenta ? (data.cuenta.codigo + ' - ' + data.cuenta.nombreComercial) : 'sin cuenta';
  conversacion.textContent = data.conversacionId ? ('Conversacion: ' + data.conversacionId) : 'sin conversacion';
  lead.textContent = data.lead ? JSON.stringify(data.lead, null, 2) : 'sin lead';
}

async function enviar() {
  const valor = texto.value.trim();
  if (!valor) return;
  texto.value = '';
  await fetch('/api/simulador/mensaje', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto: valor }),
  });
  await refrescar();
}

async function reiniciar() {
  await fetch('/api/simulador/reiniciar', { method: 'POST' });
  await refrescar();
}

document.getElementById('enviar').addEventListener('click', enviar);
document.getElementById('reiniciar').addEventListener('click', reiniciar);
texto.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(); });
refrescar();
</script>
</body>
</html>`
  }
}

# Interpretación conversacional determinista

El intérprete analiza todo el mensaje antes de actualizar el lead. Extrae nombre,
correo, productos, cantidad y ubicación de forma independiente. Los saludos,
la orientación, las aclaraciones y las referencias a opciones tienen tratamiento
propio. No requiere servicios de IA ni añade dependencias.

## Relevancia y confianza

La puntuación del catálogo ordena sugerencias; no representa una probabilidad.
El nombre completo y el código exacto tienen confianza alta. Las coincidencias
parciales de 45 puntos o más son medias; el resto son bajas. Solo las altas
pueden incorporarse automáticamente como productos del catálogo. Las parciales,
incluso si hay una sola opción o un empate, se presentan para elegir o confirmar.
Los modelos no se confirman por ser subcadenas de otro modelo.

Una solicitud suficientemente descriptiva puede guardarse como texto no verificado
sin referencia de catálogo. Reconocer una marca no autoriza a inventar un SKU.
Una solicitud libre sin corrección explícita no sustituye productos ya confirmados.

## Referencias y persistencia

`contexto_producto` conserva consulta, hasta tres sugerencias, IDs rechazados,
marca y contadores de recuperación en PostgreSQL (migración 0008). El repositorio
reconstruye este contexto después de reiniciar la app o el worker.

“El primero” y “el segundo” seleccionan únicamente posiciones existentes. “Ese”
solo selecciona cuando existe una única opción. Si la referencia no es inequívoca,
el bot pide precisión y conserva la lista y los rechazos. “Otro” busca alternativas
excluyendo las opciones ya ofrecidas/rechazadas. Una única sugerencia se anuncia
como “Encontré esta opción” y requiere confirmación.

## Criterio de finalización

Para `listo_pipedrive` se requiere nombre válido (o rechazo de nombre admitido por
la política existente), correo válido, cantidad positiva, ubicación mexicana
completa y producto suficientemente documentado, sin errores ni aclaraciones
pendientes. El producto puede ser una referencia de catálogo o una solicitud
libre validada por `esSolicitudProductoSuficiente`, excluyendo categorías amplias.
El texto arbitrario y “equipo contra incendio” no satisfacen ese criterio.

Una solicitud como “rociadores Tyco modelo TY658” puede quedar lista para que un
asesor la revise aunque el catálogo no confirme el modelo. `listo_pipedrive`
significa datos listos para revisión comercial, no disponibilidad o SKU verificado.
`productosCatalogo` y `solicitudProductoTexto` conservan esa distinción.

## Ejemplos

- “Hola mucho gusto, quisiera cotizar equipo contra incendio”: pide tipo de equipo;
  nombre y modelo siguen vacíos. “90” conserva cantidad preliminar.
- “Quiero paneles”: presenta opciones relevantes. “Ese” ante varias opciones pide
  precisión; “el segundo” solo elige si existe; “otro” conserva contexto y exclusiones.
- El mensaje de Pedro con 100 rociadores TY658 conserva nombre, solicitud y cantidad,
  entrega “todo santos” al resolutor existente y pide datos pendientes. La ubicación
  solo se guarda si el resolutor la valida; puede corregirse después.

## Instalación y verificación (PowerShell)

`npm run db:seed` agrega las claves nuevas `producto_opcion` y
`producto_referencia_aclarar` sin sobrescribir los textos editados existentes.
No se necesita una migración adicional de esquema para estos cambios.

```powershell
npm run db:seed
npm run typecheck
npm test
npm run lint
npm run format:check
npm run build
# Requiere la instancia local de PostgreSQL para la BD dedicada de pruebas:
npm run test:integracion
```

## Riesgos y límites

Las consultas parciales requieren más confirmaciones. Las expresiones no cubiertas
por reglas pueden requerir aclaración u orientación humana. No se infieren requisitos
técnicos, compatibilidad, inventario ni equivalencias entre modelos. Las puntuaciones
no están calibradas estadísticamente. Los catálogos, normalización, reglas y respuestas
del validador geográfico no se modifican; la capa conversacional recorta únicamente
el marco “me encuentro en la ciudad” para entregar el candidato al resolutor.

La batería incluye regresiones de geografía, selección ambigua, cantidades,
captura múltiple, confianza y recuperación del contexto desde PostgreSQL después
de reconstruir la app. Se usan proveedores falsos y una BD exclusiva de pruebas.

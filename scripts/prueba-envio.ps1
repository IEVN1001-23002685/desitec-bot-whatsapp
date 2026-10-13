# Prueba manual del endpoint interno POST /api/mensajes.
#
# Requiere un servidor corriendo (npm run dev) y API_INTERNAL_KEY configurada
# (parametro -Clave o variable de entorno API_INTERNAL_KEY).
#
# Uso:
#   .\scripts\prueba-envio.ps1 -IdWa 5215512345678
#   .\scripts\prueba-envio.ps1 -IdWa 5215512345678 -CodigoCuenta linea-soporte -Cuerpo 'Hola'
param(
  [Parameter(Mandatory = $true)][string] $IdWa,
  [string] $CodigoCuenta = 'linea-comercial',
  [string] $Cuerpo = 'Prueba desitec',
  [string] $Url = 'http://localhost:3000/api/mensajes',
  [string] $Clave = $env:API_INTERNAL_KEY
)

if ([string]::IsNullOrWhiteSpace($Clave)) {
  Write-Error 'Falta la clave interna: usa -Clave o define API_INTERNAL_KEY en el entorno.'
  exit 1
}

if ($IdWa -notmatch '^\d{5,20}$') {
  Write-Error "idWa invalido: '$IdWa'. Solo digitos, entre 5 y 20."
  exit 1
}

$cuerpoJson = @{
  codigoCuenta = $CodigoCuenta
  idWa         = $IdWa
  cuerpo       = $Cuerpo
} | ConvertTo-Json -Compress

try {
  $respuesta = Invoke-RestMethod -Method Post -Uri $Url -ContentType 'application/json' `
    -Headers @{ 'x-api-key-interna' = $Clave } -Body $cuerpoJson
  Write-Host 'Envio aceptado por el servidor.'
  Write-Host "  idMensajeMeta: $($respuesta.idMensajeMeta)"
  Write-Host "  idConversacion: $($respuesta.idConversacion)"
} catch {
  $codigo = $_.Exception.Response.StatusCode.value__
  $detalle = $_.ErrorDetails.Message
  Write-Error "Fallo la solicitud (HTTP $codigo): $detalle"
  exit 1
}

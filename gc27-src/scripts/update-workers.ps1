param()
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$WranglerVersion = '4.119.0'
$Workers = @(
  [pscustomobject]@{ Name='mfe-viajes-precios'; File='CLOUDFLARE_WORKER_v2_2_54.js'; Url='https://mfe-viajes-precios.mikelferech.workers.dev'; Expected='2.2.54' },
  [pscustomobject]@{ Name='mfe-viajes-vueling'; File='CLOUDFLARE_WORKER_VUELING_v1_0_23.js'; Url='https://mfe-viajes-vueling.mikelferech.workers.dev'; Expected='1.0.23' }
)

function Write-Step([string]$Text){ Write-Host "`n==> $Text" -ForegroundColor Cyan }
function Get-WranglerToken {
  function Read-Token {
    $raw = (& npx.cmd --yes "wrangler@$WranglerVersion" auth token --json 2>&1 | Out-String).Trim()
    if($LASTEXITCODE -ne 0){ return '' }
    try {
      $obj = $raw | ConvertFrom-Json
      foreach($key in @('token','api_token','oauth_token')){
        $value = [string]$obj.$key
        if($value){ return $value.Trim() }
      }
    } catch {}
    $m = [regex]::Match($raw,'(?i)(?:token|oauth_token)\s*[=:]\s*["'']?([A-Za-z0-9._~+\-/=]{20,})')
    if($m.Success){ return $m.Groups[1].Value }
    return ''
  }
  $token = Read-Token
  if($token){ return $token }
  Write-Host 'No hay una sesión Cloudflare utilizable. Se abrirá el login por dispositivo.' -ForegroundColor Yellow
  & npx.cmd --yes "wrangler@$WranglerVersion" login --device --no-use-keyring
  if($LASTEXITCODE -ne 0){ throw 'No se pudo completar el login de Cloudflare.' }
  $token = Read-Token
  if(-not $token){ throw 'Cloudflare ha iniciado sesión, pero no se pudo obtener el token OAuth para publicar los Workers.' }
  return $token
}

function Invoke-Cf([string]$Method,[string]$Url,[string]$Token,$Body=$null){
  $headers = @{ Authorization = "Bearer $Token" }
  try {
    if($null -ne $Body){
      $json = $Body | ConvertTo-Json -Depth 10 -Compress
      return Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers -ContentType 'application/json' -Body $json -TimeoutSec 45
    }
    return Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers -TimeoutSec 45
  } catch {
    $msg = $_.Exception.Message
    if($_.ErrorDetails.Message){ $msg += "`n" + $_.ErrorDetails.Message }
    throw "Cloudflare API: $msg"
  }
}

function Find-AccountId([string]$Token){
  Write-Step 'Localizando la cuenta de Cloudflare que contiene los Workers'
  $accounts = Invoke-Cf 'GET' 'https://api.cloudflare.com/client/v4/accounts?per_page=50' $Token
  foreach($account in @($accounts.result)){
    $accountId = [string]$account.id
    if(-not $accountId){ continue }
    $allFound = $true
    foreach($w in $Workers){
      try {
        $null = Invoke-Cf 'GET' "https://api.cloudflare.com/client/v4/accounts/$accountId/workers/scripts/$($w.Name)/settings" $Token
      } catch { $allFound = $false; break }
    }
    if($allFound){
      Write-Host "Cuenta encontrada: $($account.name) ($accountId)" -ForegroundColor Green
      return $accountId
    }
  }
  throw 'No se encontró una cuenta con los Workers de MFE Viajes.'
}

function Get-BindingSignature($Settings){
  $rows = @($Settings.result.bindings | ForEach-Object {
    $type = [string]$_.type
    $name = [string]$_.name
    if($type -or $name){ "$type|$name" }
  } | Where-Object { $_ } | Sort-Object)
  return @($rows)
}

function Update-Worker($Worker,[string]$AccountId,[string]$Token){
  $filePath = Join-Path $Root $Worker.File
  if(-not (Test-Path $filePath)){ throw "No existe $($Worker.File)." }

  # Snapshot remoto antes de publicar. El endpoint /content no modifica
  # configuración ni bindings, pero verificamos igualmente que sigan iguales.
  Write-Step "Leyendo bindings actuales de $($Worker.Name)"
  $settingsUrl = "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/scripts/$($Worker.Name)/settings"
  $beforeSettings = Invoke-Cf 'GET' $settingsUrl $Token
  $beforeBindings = Get-BindingSignature $beforeSettings
  $bindingTypes = @($beforeSettings.result.bindings | ForEach-Object { [string]$_.type } | Where-Object { $_ } | Sort-Object -Unique)
  if($bindingTypes.Count){ Write-Host ('Bindings que se conservarán: ' + ($bindingTypes -join ', ')) }
  else { Write-Host 'El Worker no informa bindings remotos.' }

  $tempDir = Join-Path $env:TEMP ('mfe-worker-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tempDir | Out-Null
  try {
    # Cloudflare relaciona metadata.main_module con el NOMBRE DE ARCHIVO del módulo
    # multipart, no únicamente con el nombre del campo. Por eso hacemos una copia
    # temporal cuyo filename sea exactamente worker.js.
    $modulePath = Join-Path $tempDir 'worker.js'
    Copy-Item -LiteralPath $filePath -Destination $modulePath -Force
    $metadataPath = Join-Path $tempDir 'metadata.json'
    $metadataJson = (@{ main_module = 'worker.js' } | ConvertTo-Json -Compress)
    [System.IO.File]::WriteAllText($metadataPath,$metadataJson,(New-Object System.Text.UTF8Encoding($false)))

    Write-Step "Publicando SOLO el código de $($Worker.Name) · versión $($Worker.Expected)"
    # API oficial Put Script Content: reemplaza contenido sin tocar config/metadata.
    # CF-WORKER-MAIN-MODULE-PART y filename=worker.js fuerzan el mismo entrypoint
    # que ya tiene el Worker remoto, evitando el error 10021 No such module.
    $uploadUrl = "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/scripts/$($Worker.Name)/content"
    $responseFile = Join-Path $tempDir 'response.json'
    $status = & curl.exe --silent --show-error -o $responseFile -w "%{http_code}" -X PUT $uploadUrl `
      -H "Authorization: Bearer $Token" `
      -H "CF-WORKER-MAIN-MODULE-PART: worker.js" `
      -F "metadata=@$metadataPath;type=application/json" `
      -F "worker.js=@$modulePath;filename=worker.js;type=application/javascript+module" 2>&1 | Out-String
    $status = $status.Trim()
    $output = if(Test-Path $responseFile){ Get-Content -LiteralPath $responseFile -Raw -ErrorAction SilentlyContinue } else { '' }
    if($LASTEXITCODE -ne 0){ throw "Falló la conexión al publicar $($Worker.Name):`n$output" }
    if($status -notmatch '^2\d\d$'){
      $detail = $output
      try {
        $obj = $output | ConvertFrom-Json
        $messages = @($obj.errors | ForEach-Object { "[$($_.code)] $($_.message)" }) -join '; '
        if($messages){ $detail = $messages }
      } catch {}
      throw "Cloudflare rechazó $($Worker.Name) con HTTP $status.`n$detail"
    }
    try { $result = $output | ConvertFrom-Json } catch { throw "Cloudflare devolvió una respuesta no válida al publicar $($Worker.Name):`n$output" }
    if($result.success -ne $true){ throw "Cloudflare rechazó $($Worker.Name): $output" }

    # Comprobación extra: nombres/tipos de bindings antes y después deben coincidir.
    $afterSettings = Invoke-Cf 'GET' $settingsUrl $Token
    $afterBindings = Get-BindingSignature $afterSettings
    if(($beforeBindings -join "`n") -ne ($afterBindings -join "`n")){
      throw "Los bindings remotos de $($Worker.Name) no coinciden después de publicar. Se detiene la actualización para revisión."
    }
    Write-Host "Código publicado. Bindings, KV, variables y secretos remotos permanecen intactos." -ForegroundColor Green
  } finally {
    Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Get-LatestDeployableVersion($Worker,[string]$AccountId,[string]$Token){
  $versionsUrl = "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/scripts/$($Worker.Name)/versions?deployable=true&per_page=10"
  for($attempt=1;$attempt -le 6;$attempt++){
    $versions = Invoke-Cf 'GET' $versionsUrl $Token
    # La API actual devuelve un objeto paginado: result.items[].
    # Conservamos fallbacks para respuestas antiguas/alternativas.
    $items = @()
    if($null -ne $versions.result.items){ $items = @($versions.result.items) }
    elseif($versions.result -is [System.Array]){ $items = @($versions.result) }
    elseif($null -ne $versions.items){ $items = @($versions.items) }
    $latest = @($items | Where-Object { [string]$_.id })[0]
    if($latest){ return $latest }
    if($attempt -lt 6){ Start-Sleep -Seconds 2 }
  }
  throw "Cloudflare no devolvió ninguna versión desplegable para $($Worker.Name) después de varios intentos."
}

function Deploy-LatestWorkerVersion($Worker,[string]$AccountId,[string]$Token){
  Write-Step "Activando la última versión de $($Worker.Name) al 100%"
  $latest = Get-LatestDeployableVersion $Worker $AccountId $Token
  $versionId = [string]$latest.id
  $versionNumber = [string]$latest.number
  if(-not $versionId){ throw "Cloudflare no devolvió un ID de versión para $($Worker.Name)." }
  if($versionNumber){ Write-Host "Versión Cloudflare localizada: #$versionNumber · $versionId" -ForegroundColor DarkGray }
  else { Write-Host "Versión Cloudflare localizada: $versionId" -ForegroundColor DarkGray }

  # A partir de v2.2.137 la promoción a producción la hace Wrangler, no una
  # petición REST construida a mano. Es el comando oficial de Cloudflare para
  # desplegar una versión ya creada y evita depender del formato interno de
  # POST /deployments, que ha cambiado varias veces.
  $previousAccountId = $env:CLOUDFLARE_ACCOUNT_ID
  try {
    $env:CLOUDFLARE_ACCOUNT_ID = $AccountId
    $versionSpec = "${versionId}@100%"
    $message = "MFE Viajes · $($Worker.Name) v$($Worker.Expected)"
    $deployOutput = (& npx.cmd --yes "wrangler@$WranglerVersion" versions deploy $versionSpec --name $Worker.Name --message $message 2>&1 | Out-String).Trim()
    if($LASTEXITCODE -ne 0){
      throw "Wrangler no pudo activar $($Worker.Name) al 100%.`n$deployOutput"
    }
    if($deployOutput){
      $deployOutput -split "`r?`n" | ForEach-Object { if($_.Trim()){ Write-Host $_ -ForegroundColor DarkGray } }
    }
  } finally {
    if($null -eq $previousAccountId){ Remove-Item Env:CLOUDFLARE_ACCOUNT_ID -ErrorAction SilentlyContinue }
    else { $env:CLOUDFLARE_ACCOUNT_ID = $previousAccountId }
  }
  Write-Host "Versión enviada a producción al 100% mediante Wrangler · $versionId" -ForegroundColor Green
}

function Verify-Worker($Worker){
  Write-Step "Verificando $($Worker.Name) en workers.dev"
  $sep = if($Worker.Url.Contains('?')){'&'}else{'?'}
  $lastError = ''
  for($attempt=1;$attempt -le 10;$attempt++){
    $uri = "$($Worker.Url)$sep`_mfe_check=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())-$attempt"
    try {
      $health = Invoke-RestMethod -Method GET -Uri $uri -Headers @{ 'Cache-Control'='no-cache'; 'Pragma'='no-cache' } -TimeoutSec 30
      $version = [string]$health.version
      if($version -eq $Worker.Expected){
        Write-Host "$($Worker.Name) OK · v$version" -ForegroundColor Green
        return
      }
      $lastError = "$($Worker.Name) responde versión '$version' y se esperaba '$($Worker.Expected)'."
    } catch {
      $lastError = "No se pudo comprobar $($Worker.Name): $($_.Exception.Message)"
    }
    if($attempt -lt 10){
      Write-Host "Aún no sirve la versión esperada · reintento $attempt/10..." -ForegroundColor DarkGray
      Start-Sleep -Seconds 3
    }
  }
  throw $lastError
}

try {
  Set-Location $Root
  if(-not (Get-Command npx.cmd -ErrorAction SilentlyContinue)){ throw 'No se encuentra npx. Instala Node.js.' }
  if(-not (Get-Command curl.exe -ErrorAction SilentlyContinue)){ throw 'No se encuentra curl.exe. Windows 11 debería incluirlo.' }
  Write-Step 'Obteniendo autorización de Cloudflare'
  $token = Get-WranglerToken
  $accountId = Find-AccountId $token
  foreach($worker in $Workers){
    Update-Worker $worker $accountId $token
    Deploy-LatestWorkerVersion $worker $accountId $token
    Verify-Worker $worker
  }
  Write-Host "`nOK · El Worker modificado se ha actualizado y verificado." -ForegroundColor Green
  exit 0
} catch {
  Write-Host "`nERROR · $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

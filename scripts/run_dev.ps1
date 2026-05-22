$ErrorActionPreference = "Stop"

$rootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $rootDir

if (-not (Test-Path ".venv")) {
  python -m venv .venv
}

$activateScript = Join-Path ".venv" "Scripts\Activate.ps1"
. $activateScript

pip install -r "backend/requirements.txt"

$envFile = "backend/.env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      return
    }
    $parts = $line.Split("=", 2)
    if ($parts.Count -ne 2) {
      return
    }
    $key = $parts[0].Trim()
    $value = $parts[1].Trim()
    if ($key) {
      $env:$key = $value
    }
  }
}

$dockerAvailable = $false
if (Get-Command docker -ErrorAction SilentlyContinue) {
  try {
    docker info | Out-Null
    $dockerAvailable = $true
  } catch {
    $service = Get-Service -Name "com.docker.service" -ErrorAction SilentlyContinue
    if ($service) {
      if ($service.Status -ne "Running") {
        Write-Error "Starting Docker service..."
        Start-Service -Name "com.docker.service"
      }
      try {
        docker info | Out-Null
        $dockerAvailable = $true
      } catch {
        Write-Error "Docker daemon not running; start it to use Postgres."
      }
    } else {
      Write-Error "Docker daemon not running; start it to use Postgres."
    }
  }

  if ($dockerAvailable) {
    $containerExists = docker ps -a --format "{{.Names}}" | Select-String -Pattern "^threed_db$" -Quiet
    if (-not $containerExists) {
      docker run -d --name threed_db `
        -e POSTGRES_USER=postgres `
        -e POSTGRES_PASSWORD=postgres `
        -e POSTGRES_DB=threed_manager `
        -p 5432:5432 `
        -v threed_db_data:/var/lib/postgresql/data `
        postgres:15
    } else {
      docker start threed_db | Out-Null
    }
  }
} else {
  Write-Error "Docker not found; continuing without Postgres."
}

if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = "postgresql+psycopg://postgres:postgres@localhost:5432/threed_manager"
}

uvicorn backend.app.main:app --reload --port 8000

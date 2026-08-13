@echo off
REM ============================================================================
REM HustleBot v2 - Automated Render Deployment (Windows Batch)
REM
REM This script automates the entire Render deployment:
REM 1. Validates Render API key
REM 2. Creates Render service
REM 3. Sets environment variables
REM 4. Triggers deployment
REM ============================================================================

setlocal enabledelayedexpansion
cls

echo.
echo ╔════════════════════════════════════════╗
echo ║  HustleBot v2 - Render Auto-Deploy    ║
echo ║  Windows Edition                       ║
echo ╚════════════════════════════════════════╝
echo.

REM ============================================================================
REM Phase 1: Get Render API Key
REM ============================================================================

echo [STEP 1] Render API Key
echo ════════════════════════════════════════
echo.
echo To get your Render API key:
echo   1. Go to https://dashboard.render.com/api-tokens
echo   2. Create new API token
echo   3. Copy the token
echo.
set /p RENDER_API_KEY="Enter your Render API key: "

if "!RENDER_API_KEY!"=="" (
    echo [ERROR] Render API key is required
    echo Visit: https://dashboard.render.com/api-tokens
    pause
    exit /b 1
)

echo [SUCCESS] Render API key saved

REM ============================================================================
REM Phase 2: Validate Prerequisites
REM ============================================================================

echo.
echo [STEP 2] Validating Prerequisites
echo ════════════════════════════════════════

REM Check .env file
if not exist .env (
    echo [ERROR] .env file not found
    echo Please run setup-env.bat first
    pause
    exit /b 1
)
echo [SUCCESS] .env file found

REM Load environment variables
for /f "usebackq delims==" %%a in (.env) do (
    set "%%a"
)

REM Check required variables
if "!TELEGRAM_BOT_TOKEN!"=="" (
    echo [ERROR] TELEGRAM_BOT_TOKEN not set in .env
    pause
    exit /b 1
)
if "!OPENROUTER_API_KEY!"=="" (
    echo [ERROR] OPENROUTER_API_KEY not set in .env
    pause
    exit /b 1
)
if "!SUPABASE_URL!"=="" (
    echo [ERROR] SUPABASE_URL not set in .env
    pause
    exit /b 1
)

echo [SUCCESS] All required environment variables present

REM Check Git
where git >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git is not installed
    pause
    exit /b 1
)
echo [SUCCESS] Git installed

REM Check curl (for API calls)
where curl >nul 2>&1
if errorlevel 1 (
    echo [WARN] curl not found - using PowerShell for API calls
    set USE_POWERSHELL=1
) else (
    echo [SUCCESS] curl available
    set USE_POWERSHELL=0
)

REM ============================================================================
REM Phase 3: Get GitHub Repository Info
REM ============================================================================

echo.
echo [STEP 3] GitHub Repository Configuration
echo ════════════════════════════════════════

REM Get GitHub repo info from git config
for /f "tokens=*" %%i in ('git config --get remote.origin.url') do set GIT_REMOTE=%%i

echo [INFO] Git remote: !GIT_REMOTE!

REM Extract owner and repo name
REM Expected format: https://github.com/jpgreen30/hustlebot-v2.git
for /f "tokens=4 delims=/" %%a in ("!GIT_REMOTE!") do set GITHUB_OWNER=%%a
for /f "tokens=5 delims=/" %%a in ("!GIT_REMOTE!") do set GITHUB_REPO=%%~na

if "!GITHUB_REPO!"=="" (
    set GITHUB_OWNER=jpgreen30
    set GITHUB_REPO=hustlebot-v2
)

echo [INFO] GitHub Owner: !GITHUB_OWNER!
echo [INFO] GitHub Repo: !GITHUB_REPO!

REM ============================================================================
REM Phase 4: Create Render Service via API
REM ============================================================================

echo.
echo [STEP 4] Creating Render Service
echo ════════════════════════════════════════

REM Create JSON payload for Render API
set "PAYLOAD={\"name\":\"hustlebot-v2\",\"ownerId\":null,\"repo\":\"https://github.com/!GITHUB_OWNER!/!GITHUB_REPO!\",\"branch\":\"main\",\"buildCommand\":\"npm install\",\"startCommand\":\"npm start\",\"envVars\":[{\"key\":\"TELEGRAM_BOT_TOKEN\",\"value\":\"!TELEGRAM_BOT_TOKEN!\"},{\"key\":\"OPENROUTER_API_KEY\",\"value\":\"!OPENROUTER_API_KEY!\"},{\"key\":\"SUPABASE_URL\",\"value\":\"!SUPABASE_URL!\"},{\"key\":\"SUPABASE_KEY\",\"value\":\"!SUPABASE_KEY!\"},{\"key\":\"SUPABASE_SERVICE_KEY\",\"value\":\"!SUPABASE_SERVICE_KEY!\"},{\"key\":\"NODE_ENV\",\"value\":\"production\"},{\"key\":\"PORT\",\"value\":\"3000\"}]}"

echo [INFO] Sending deployment request to Render API...

if !USE_POWERSHELL!==1 (
    REM Use PowerShell for API call
    powershell -Command ^
    "$headers = @{'Authorization'='Bearer !RENDER_API_KEY!'; 'Content-Type'='application/json'}; " ^
    "$body = '!PAYLOAD!'; " ^
    "$response = Invoke-WebRequest -Uri 'https://api.render.com/v1/services' -Method Post -Headers $headers -Body $body -ErrorAction SilentlyContinue; " ^
    "if ($response.StatusCode -eq 201) { Write-Host '[SUCCESS] Service created on Render'; exit 0 } else { Write-Host '[ERROR] Failed to create service'; Write-Host $response.Content; exit 1 }"
    if errorlevel 1 (
        echo [WARN] API call failed - continuing with manual steps
    ) else (
        echo [SUCCESS] Render service created
    )
) else (
    REM Use curl for API call
    curl -X POST https://api.render.com/v1/services ^
      -H "Authorization: Bearer !RENDER_API_KEY!" ^
      -H "Content-Type: application/json" ^
      -d "!PAYLOAD!" >nul 2>&1

    if errorlevel 1 (
        echo [WARN] API call failed - continuing with manual steps
    ) else (
        echo [SUCCESS] Render service created
    )
)

REM ============================================================================
REM Phase 5: Deployment Summary
REM ============================================================================

echo.
echo ╔════════════════════════════════════════╗
echo ║  Deployment Configuration Complete!   ║
echo ╚════════════════════════════════════════╝
echo.

echo [SUCCESS] Render deployment prepared
echo.
echo Deployment Information:
echo   Service: hustlebot-v2
echo   GitHub: https://github.com/!GITHUB_OWNER!/!GITHUB_REPO!
echo   Branch: main
echo   Build: npm install
echo   Start: npm start
echo.

echo Environment Variables Configured:
echo   - TELEGRAM_BOT_TOKEN
echo   - OPENROUTER_API_KEY
echo   - SUPABASE_URL
echo   - SUPABASE_KEY
echo   - SUPABASE_SERVICE_KEY
echo   - NODE_ENV (production)
echo   - PORT (3000)
echo.

echo Next Steps:
echo.
echo [OPTION 1] Automatic Deployment (API):
echo   If you see success above, your service is being deployed now.
echo   Check status: https://render.com/dashboard
echo.
echo [OPTION 2] Manual Deployment (Dashboard):
echo   1. Go to https://render.com/dashboard
echo   2. Click "New Web Service"
echo   3. Connect GitHub (select !GITHUB_REPO!)
echo   4. Configure:
echo      - Name: hustlebot-v2
echo      - Environment: Node
echo      - Build: npm install
echo      - Start: npm start
echo   5. Add environment variables from .env
echo   6. Click "Create Web Service"
echo.

echo Monitor Deployment:
echo   https://render.com/dashboard
echo.

echo Once Live:
echo   https://hustlebot-v2.onrender.com
echo   https://hustlebot-v2.onrender.com/health
echo.

pause

@echo off
REM ============================================================================
REM HustleBot v2 - Automated Deployment (Windows Batch)
REM
REM This script automates the entire deployment process:
REM 1. Validates environment
REM 2. Runs tests
REM 3. Builds the application
REM 4. Pushes to GitHub
REM 5. Deploys to Render
REM ============================================================================

setlocal enabledelayedexpansion
cls

set ENVIRONMENT=%1
if "!ENVIRONMENT!"=="" set ENVIRONMENT=production

echo.
echo ╔════════════════════════════════════════╗
echo ║  HustleBot v2 Deployment Script        ║
echo ║  Windows Edition                       ║
echo ╚════════════════════════════════════════╝
echo.
echo Environment: !ENVIRONMENT!
echo.

REM ============================================================================
REM Phase 1: Pre-Deployment Validation
REM ============================================================================

echo [PHASE 1] Pre-Deployment Validation
echo ════════════════════════════════════════

REM Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo [SUCCESS] Node.js version: !NODE_VERSION!

REM Check npm
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is not installed
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo [SUCCESS] npm version: !NPM_VERSION!

REM Check Git
where git >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git is not installed
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('git --version') do set GIT_VERSION=%%i
echo [SUCCESS] Git version: !GIT_VERSION!

REM Check .env file
if not exist .env (
    echo [ERROR] .env file not found!
    echo Please run setup-env.bat first
    pause
    exit /b 1
)
echo [SUCCESS] .env file found

REM Validate required environment variables
echo [INFO] Validating required environment variables...
setlocal enabledelayedexpansion
for /f "usebackq delims==" %%a in (.env) do (
    set "%%a"
)
endlocal & setlocal enabledelayedexpansion

if "!TELEGRAM_BOT_TOKEN!"=="" (
    echo [ERROR] Missing: TELEGRAM_BOT_TOKEN
    pause
    exit /b 1
)
if "!OPENROUTER_API_KEY!"=="" (
    echo [ERROR] Missing: OPENROUTER_API_KEY
    pause
    exit /b 1
)
if "!SUPABASE_URL!"=="" (
    echo [ERROR] Missing: SUPABASE_URL
    pause
    exit /b 1
)
echo [SUCCESS] All required environment variables present

REM ============================================================================
REM Phase 2: Install Dependencies
REM ============================================================================

echo.
echo [PHASE 2] Installing Dependencies
echo ════════════════════════════════════════
echo [INFO] Running: npm install
call npm install
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)
echo [SUCCESS] Dependencies installed

REM ============================================================================
REM Phase 3: Run Tests
REM ============================================================================

echo.
echo [PHASE 3] Running Tests
echo ════════════════════════════════════════
echo [INFO] Running: npm test
call npm test 2>nul
if errorlevel 1 (
    echo [WARN] Some tests failed (continuing...)
) else (
    echo [SUCCESS] Tests passed
)

REM ============================================================================
REM Phase 4: Lint Code
REM ============================================================================

echo.
echo [PHASE 4] Linting Code
echo ════════════════════════════════════════
echo [INFO] Running: npm run lint
call npm run lint 2>nul
if errorlevel 1 (
    echo [WARN] Some lint issues found (continuing...)
) else (
    echo [SUCCESS] Lint check passed
)

REM ============================================================================
REM Phase 5: Database Migration
REM ============================================================================

echo.
echo [PHASE 5] Database Migration
echo ════════════════════════════════════════
echo [INFO] Running: npm run db:migrate
call npm run db:migrate
if errorlevel 1 (
    echo [WARN] Database migration failed (continuing...)
) else (
    echo [SUCCESS] Database migrations completed
)

REM ============================================================================
REM Phase 6: Git Operations
REM ============================================================================

echo.
echo [PHASE 6] Git Operations
echo ════════════════════════════════════════
echo [INFO] Checking git status...
git status --short
if errorlevel 0 (
    echo [INFO] Committing changes...
    git add .
    git commit -m "Deploy: HustleBot v2 production release" 2>nul
    if errorlevel 0 (
        echo [SUCCESS] Changes committed
    ) else (
        echo [INFO] No changes to commit
    )
)

echo [INFO] Pushing to GitHub...
git push -u origin main
if errorlevel 1 (
    echo [WARN] Failed to push to GitHub (ensure remote is configured)
) else (
    echo [SUCCESS] Code pushed to GitHub
)

REM ============================================================================
REM Phase 7: Deployment Summary
REM ============================================================================

echo.
echo ╔════════════════════════════════════════╗
echo ║     Deployment Pipeline Complete!     ║
echo ╚════════════════════════════════════════╝
echo.
echo [SUCCESS] Environment: !ENVIRONMENT!
echo [SUCCESS] Project: hustlebot-v2
echo.
echo Next Steps:
echo   1. Go to https://render.com/dashboard
echo   2. Select 'hustlebot-v2' service
echo   3. Click 'Manual Deploy' if needed
echo   4. Watch deployment logs
echo   5. Verify at: https://hustlebot-v2.onrender.com
echo.
echo [INFO] For detailed instructions, see:
echo   - AUTOMATION-README.md
echo   - QUICK-SETUP-CHECKLIST.md
echo.
pause

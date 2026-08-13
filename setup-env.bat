@echo off
REM ============================================================================
REM HustleBot v2 - Environment Setup Wizard (Windows Batch)
REM
REM This script guides you through setting up all required credentials
REM and creates a complete .env file for deployment.
REM ============================================================================

setlocal enabledelayedexpansion
cls

REM Colors and formatting
for /F %%a in ('copy /Z "%~f0" nul') do set "BS=%%a"
set "TAB=	"

echo.
echo ╔════════════════════════════════════════╗
echo ║  HustleBot v2 - Environment Setup      ║
echo ║        Windows Edition                 ║
echo ╚════════════════════════════════════════╝
echo.
echo This script will guide you through setting up your HustleBot v2 deployment.
echo You'll need credentials from: Telegram, Supabase, and OpenRouter.
echo.
echo Estimated setup time: 10-15 minutes
echo.

REM Check if .env exists
if exist .env (
    echo [INFO] .env file already exists
    set /p OVERWRITE="Overwrite existing .env? (yes/no): "
    if /i not "!OVERWRITE!"=="yes" (
        echo Using existing .env file
        goto :EOF
    )
)

REM ============================================================================
REM Telegram Bot Setup
REM ============================================================================

echo.
echo [STEP 1] Telegram Bot Configuration
echo ══════════════════════════════════════
echo Get your bot token from BotFather on Telegram:
echo   1. Open Telegram and search for @BotFather
echo   2. Send /newbot and follow the instructions
echo   3. Choose bot name: HustleBot v2
echo   4. Choose username: hustlebot_v2_bot
echo   5. Copy the API token
echo.
set /p TELEGRAM_BOT_TOKEN="Enter Telegram Bot Token (or press Enter to skip): "
if "!TELEGRAM_BOT_TOKEN!"=="" (
    echo [SKIP] Telegram skipped (you can add this later)
    set TELEGRAM_BOT_TOKEN=your_telegram_bot_token_from_botfather
) else (
    echo [SUCCESS] Telegram Bot Token saved
)

REM ============================================================================
REM Supabase Setup
REM ============================================================================

echo.
echo [STEP 2] Supabase Database Configuration
echo ══════════════════════════════════════
echo Setup instructions:
echo   1. Go to https://supabase.com/dashboard
echo   2. Create a new project
echo   3. Go to Settings ^> API to find your credentials
echo.
set /p SUPABASE_URL="Enter Supabase Project URL: "
if "!SUPABASE_URL!"=="" set SUPABASE_URL=your_supabase_project_url

set /p SUPABASE_KEY="Enter Supabase Anon Key: "
if "!SUPABASE_KEY!"=="" set SUPABASE_KEY=your_supabase_anon_key

set /p SUPABASE_SERVICE_KEY="Enter Supabase Service Role Key: "
if "!SUPABASE_SERVICE_KEY!"=="" set SUPABASE_SERVICE_KEY=your_supabase_service_role_key

if not "!SUPABASE_URL!"=="your_supabase_project_url" (
    echo [SUCCESS] Supabase credentials saved
)

REM ============================================================================
REM OpenRouter Setup
REM ============================================================================

echo.
echo [STEP 3] OpenRouter LLM Configuration
echo ══════════════════════════════════════
echo Setup instructions:
echo   1. Go to https://openrouter.ai
echo   2. Sign up and create an API key
echo   3. Add credits/payment method
echo.
set /p OPENROUTER_API_KEY="Enter OpenRouter API Key: "
if "!OPENROUTER_API_KEY!"=="" (
    set OPENROUTER_API_KEY=your_openrouter_api_key
) else (
    echo [SUCCESS] OpenRouter API Key saved
)

set OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

REM ============================================================================
REM Optional Services
REM ============================================================================

echo.
echo [STEP 4] Optional Services (Press Enter to skip)
echo ══════════════════════════════════════
set /p DEEPGRAM_API_KEY="Deepgram API Key (optional): "
if "!DEEPGRAM_API_KEY!"=="" set DEEPGRAM_API_KEY=your_deepgram_api_key

REM ============================================================================
REM Server Configuration
REM ============================================================================

echo.
echo [STEP 5] Server Configuration
echo ══════════════════════════════════════
set /p NODE_ENV="Node Environment (default: production): "
if "!NODE_ENV!"=="" set NODE_ENV=production

set /p PORT="Port (default: 3000): "
if "!PORT!"=="" set PORT=3000

set /p LOG_LEVEL="Log Level (debug/info/warn/error, default: info): "
if "!LOG_LEVEL!"=="" set LOG_LEVEL=info

REM ============================================================================
REM Feature Flags
REM ============================================================================

echo.
echo [STEP 6] Feature Flags (Enter y/n)
echo ══════════════════════════════════════

set /p VOICE="Enable voice input? (y/n, default: y): "
if /i "!VOICE!"=="n" (
    set ENABLE_VOICE_INPUT=false
) else (
    set ENABLE_VOICE_INPUT=true
)

set /p IMAGE="Enable image generation? (y/n, default: y): "
if /i "!IMAGE!"=="n" (
    set ENABLE_IMAGE_GENERATION=false
) else (
    set ENABLE_IMAGE_GENERATION=true
)

set /p LEAD="Enable lead generation? (y/n, default: y): "
if /i "!LEAD!"=="n" (
    set ENABLE_LEAD_GENERATION=false
) else (
    set ENABLE_LEAD_GENERATION=true
)

set /p LANDING="Enable landing page builder? (y/n, default: y): "
if /i "!LANDING!"=="n" (
    set ENABLE_LANDING_PAGE_BUILDER=false
) else (
    set ENABLE_LANDING_PAGE_BUILDER=true
)

set /p EMAIL="Enable email automation? (y/n, default: y): "
if /i "!EMAIL!"=="n" (
    set ENABLE_EMAIL_AUTOMATION=false
) else (
    set ENABLE_EMAIL_AUTOMATION=true
)

REM ============================================================================
REM Budget Configuration
REM ============================================================================

echo.
echo [STEP 7] Budget & Cost Tracking
echo ══════════════════════════════════════

set /p MONTHLY_BUDGET="Monthly Budget USD (default: 100): "
if "!MONTHLY_BUDGET!"=="" set MONTHLY_BUDGET=100

set BUDGET_CURRENCY=USD

set /p TRACK="Track spending? (y/n, default: y): "
if /i "!TRACK!"=="n" (
    set TRACK_SPEND=false
) else (
    set TRACK_SPEND=true
)

REM ============================================================================
REM Generate .env File
REM ============================================================================

echo.
echo [INFO] Generating .env file...
echo.

(
echo # ============================================================
echo # HUSTLEBOT v2 - Environment Configuration
echo # Generated: %DATE% %TIME%
echo # ============================================================
echo.
echo # TELEGRAM BOT
echo TELEGRAM_BOT_TOKEN=!TELEGRAM_BOT_TOKEN!
echo.
echo # OPENROUTER (LLM Routing)
echo OPENROUTER_API_KEY=!OPENROUTER_API_KEY!
echo OPENROUTER_BASE_URL=!OPENROUTER_BASE_URL!
echo.
echo # SUPABASE (Database)
echo SUPABASE_URL=!SUPABASE_URL!
echo SUPABASE_KEY=!SUPABASE_KEY!
echo SUPABASE_SERVICE_KEY=!SUPABASE_SERVICE_KEY!
echo.
echo # DEEPGRAM (Speech-to-Text)
echo DEEPGRAM_API_KEY=!DEEPGRAM_API_KEY!
echo.
echo # ELEVENLABS (Text-to-Speech) - Optional
echo ELEVENLABS_API_KEY=your_elevenlabs_api_key
echo ELEVENLABS_VOICE_ID=default_voice_id
echo.
echo # STRIPE (Payments) - Optional
echo STRIPE_SECRET_KEY=sk_test_your_stripe_key
echo STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_key
echo STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
echo.
echo # BREVO (Email Marketing) - Optional
echo BREVO_API_KEY=your_brevo_api_key
echo.
echo # POSTIZ (Social Media Scheduling) - Optional
echo POSTIZ_API_KEY=your_postiz_api_key
echo.
echo # REPLICATE (Image Generation) - Optional
echo REPLICATE_API_TOKEN=your_replicate_api_token
echo.
echo # MIDJOURNEY (Premium Image Generation) - Optional
echo MIDJOURNEY_API_KEY=your_midjourney_api_key
echo.
echo # FIRECRAWL (Web Scraping) - Optional
echo FIRECRAWL_API_KEY=your_firecrawl_api_key
echo.
echo # CLEARBIT (Lead Enrichment) - Optional
echo CLEARBIT_API_KEY=your_clearbit_api_key
echo.
echo # MEM0 (Memory Storage) - Optional
echo MEM0_API_KEY=your_mem0_api_key
echo.
echo # AWS S3 (Image & File Storage) - Optional
echo AWS_ACCESS_KEY_ID=your_aws_access_key
echo AWS_SECRET_ACCESS_KEY=your_aws_secret_key
echo AWS_REGION=us-east-1
echo AWS_S3_BUCKET=hustlebot-assets
echo.
echo # REDIS (Caching) - Optional
echo REDIS_URL=redis://localhost:6379
echo.
echo # SERVER CONFIG
echo NODE_ENV=!NODE_ENV!
echo PORT=!PORT!
echo LOG_LEVEL=!LOG_LEVEL!
echo.
echo # BUDGET & TRACKING
echo MONTHLY_BUDGET=!MONTHLY_BUDGET!
echo BUDGET_CURRENCY=!BUDGET_CURRENCY!
echo TRACK_SPEND=!TRACK_SPEND!
echo.
echo # FEATURE FLAGS
echo ENABLE_VOICE_INPUT=!ENABLE_VOICE_INPUT!
echo ENABLE_IMAGE_GENERATION=!ENABLE_IMAGE_GENERATION!
echo ENABLE_LEAD_GENERATION=!ENABLE_LEAD_GENERATION!
echo ENABLE_LANDING_PAGE_BUILDER=!ENABLE_LANDING_PAGE_BUILDER!
echo ENABLE_EMAIL_AUTOMATION=!ENABLE_EMAIL_AUTOMATION!
) > .env

REM ============================================================================
REM Summary
REM ============================================================================

echo.
echo ╔════════════════════════════════════════╗
echo ║      Setup Complete!                  ║
echo ╚════════════════════════════════════════╝
echo.
echo [SUCCESS] .env file created successfully!
echo.
echo Next steps:
echo   1. Verify .env file: type .env
echo   2. Install dependencies: npm install
echo   3. Test locally: npm run dev
echo   4. Deploy: deploy.bat
echo.
echo For detailed instructions, see:
echo   - QUICK-SETUP-CHECKLIST.md
echo   - AUTOMATION-SETUP-GUIDE.md
echo.
pause

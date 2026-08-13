#!/bin/bash

###############################################################################
# HustleBot v2 - Environment Setup Wizard
#
# This script guides you through setting up all required credentials
# and creates a complete .env file for deployment.
#
# Usage: ./setup-env.sh
###############################################################################

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Output file
ENV_FILE=".env"

# Helper functions
print_header() { echo -e "\n${BLUE}╔════════════════════════════════════════╗${NC}"; echo -e "${BLUE}║ $1${NC}"; echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"; }
print_section() { echo -e "\n${YELLOW}▶ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }

# Prompt function
prompt_value() {
    local prompt_text=$1
    local default_value=${2:-}
    local sensitive=${3:-false}
    local input_value

    if [ "$sensitive" = true ]; then
        read -sp "$(echo -e $prompt_text): " input_value
        echo ""
    else
        read -p "$(echo -e $prompt_text): " input_value
    fi

    if [ -z "$input_value" ] && [ -n "$default_value" ]; then
        echo "$default_value"
    else
        echo "$input_value"
    fi
}

###############################################################################
# Welcome
###############################################################################

clear
print_header "HustleBot v2 - Environment Setup Wizard"
echo ""
print_info "This script will guide you through setting up your HustleBot v2 deployment."
print_info "You'll need credentials from: GitHub, Supabase, OpenRouter, and Telegram."
echo ""
print_info "Estimated setup time: 10-15 minutes"
echo ""
read -p "Ready to begin? (yes/no): " START
if [ "$START" != "yes" ]; then
    echo "Aborting setup."
    exit 1
fi

# Check if .env already exists
if [ -f "$ENV_FILE" ]; then
    print_info ".env file already exists"
    read -p "Overwrite existing .env? (yes/no): " OVERWRITE
    if [ "$OVERWRITE" != "yes" ]; then
        echo "Using existing .env file"
        exit 0
    fi
fi

###############################################################################
# Telegram Bot Setup
###############################################################################

print_section "Telegram Bot Configuration"
print_info "Get your bot token from BotFather on Telegram"
print_info "1. Open Telegram and search for @BotFather"
print_info "2. Send /newbot and follow the instructions"
print_info "3. Copy the API token"
echo ""

TELEGRAM_BOT_TOKEN=$(prompt_value "Enter Telegram Bot Token" "" true)
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    print_info "Skipping Telegram (you can add this later)"
    TELEGRAM_BOT_TOKEN="your_telegram_bot_token_from_botfather"
else
    print_success "Telegram Bot Token saved"
fi

###############################################################################
# Supabase Setup
###############################################################################

print_section "Supabase Database Configuration"
print_info "1. Go to https://supabase.com/dashboard"
print_info "2. Create a new project"
print_info "3. Go to Settings → API to find your credentials"
echo ""

SUPABASE_URL=$(prompt_value "Enter Supabase Project URL")
if [ -z "$SUPABASE_URL" ]; then
    SUPABASE_URL="your_supabase_project_url"
fi

SUPABASE_KEY=$(prompt_value "Enter Supabase Anon Key" "" true)
if [ -z "$SUPABASE_KEY" ]; then
    SUPABASE_KEY="your_supabase_anon_key"
fi

SUPABASE_SERVICE_KEY=$(prompt_value "Enter Supabase Service Role Key" "" true)
if [ -z "$SUPABASE_SERVICE_KEY" ]; then
    SUPABASE_SERVICE_KEY="your_supabase_service_role_key"
fi

if [ "$SUPABASE_URL" != "your_supabase_project_url" ]; then
    print_success "Supabase credentials saved"
fi

###############################################################################
# OpenRouter Setup
###############################################################################

print_section "OpenRouter LLM Configuration"
print_info "1. Go to https://openrouter.ai"
print_info "2. Sign up and create an API key"
print_info "3. Add credits/payment method"
echo ""

OPENROUTER_API_KEY=$(prompt_value "Enter OpenRouter API Key" "" true)
if [ -z "$OPENROUTER_API_KEY" ]; then
    OPENROUTER_API_KEY="your_openrouter_api_key"
else
    print_success "OpenRouter API Key saved"
fi

OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"

###############################################################################
# Optional: Deepgram Setup
###############################################################################

print_section "Optional Services (leave blank to skip)"

read -p "Add Deepgram API Key? (yes/no): " ADD_DEEPGRAM
if [ "$ADD_DEEPGRAM" = "yes" ]; then
    DEEPGRAM_API_KEY=$(prompt_value "Enter Deepgram API Key" "" true)
    if [ -z "$DEEPGRAM_API_KEY" ]; then
        DEEPGRAM_API_KEY="your_deepgram_api_key"
    fi
else
    DEEPGRAM_API_KEY="your_deepgram_api_key"
fi

###############################################################################
# Server Configuration
###############################################################################

print_section "Server Configuration"

NODE_ENV=$(prompt_value "Node Environment" "production")
PORT=$(prompt_value "Port" "3000")
LOG_LEVEL=$(prompt_value "Log Level (debug/info/warn/error)" "info")

###############################################################################
# Feature Flags
###############################################################################

print_section "Feature Flags"

read -p "Enable voice input? (yes/no): " VOICE
ENABLE_VOICE_INPUT=$([ "$VOICE" = "yes" ] && echo "true" || echo "false")

read -p "Enable image generation? (yes/no): " IMAGE
ENABLE_IMAGE_GENERATION=$([ "$IMAGE" = "yes" ] && echo "true" || echo "false")

read -p "Enable lead generation? (yes/no): " LEAD
ENABLE_LEAD_GENERATION=$([ "$LEAD" = "yes" ] && echo "true" || echo "false")

read -p "Enable landing page builder? (yes/no): " LANDING
ENABLE_LANDING_PAGE_BUILDER=$([ "$LANDING" = "yes" ] && echo "true" || echo "false")

read -p "Enable email automation? (yes/no): " EMAIL
ENABLE_EMAIL_AUTOMATION=$([ "$EMAIL" = "yes" ] && echo "true" || echo "false")

###############################################################################
# Budget Configuration
###############################################################################

print_section "Budget & Cost Tracking"

MONTHLY_BUDGET=$(prompt_value "Monthly Budget (USD)" "100")
BUDGET_CURRENCY=$(prompt_value "Currency" "USD")

read -p "Track spending? (yes/no): " TRACK
TRACK_SPEND=$([ "$TRACK" = "yes" ] && echo "true" || echo "false")

###############################################################################
# Generate .env File
###############################################################################

print_section "Generating .env file..."

cat > "$ENV_FILE" << EOF
# ============================================================
# HUSTLEBOT v2 - Environment Configuration
# Generated: $(date)
# ============================================================

# TELEGRAM BOT
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN

# OPENROUTER (LLM Routing)
OPENROUTER_API_KEY=$OPENROUTER_API_KEY
OPENROUTER_BASE_URL=$OPENROUTER_BASE_URL

# SUPABASE (Database)
SUPABASE_URL=$SUPABASE_URL
SUPABASE_KEY=$SUPABASE_KEY
SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY

# DEEPGRAM (Speech-to-Text)
DEEPGRAM_API_KEY=$DEEPGRAM_API_KEY

# ELEVENLABS (Text-to-Speech) - Optional
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=default_voice_id

# STRIPE (Payments) - Optional
STRIPE_SECRET_KEY=sk_test_your_stripe_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# BREVO (Email Marketing) - Optional
BREVO_API_KEY=your_brevo_api_key

# POSTIZ (Social Media Scheduling) - Optional
POSTIZ_API_KEY=your_postiz_api_key

# REPLICATE (Image Generation) - Optional
REPLICATE_API_TOKEN=your_replicate_api_token

# MIDJOURNEY (Premium Image Generation) - Optional
MIDJOURNEY_API_KEY=your_midjourney_api_key

# FIRECRAWL (Web Scraping) - Optional
FIRECRAWL_API_KEY=your_firecrawl_api_key

# CLEARBIT (Lead Enrichment) - Optional
CLEARBIT_API_KEY=your_clearbit_api_key

# MEM0 (Memory Storage) - Optional
MEM0_API_KEY=your_mem0_api_key

# AWS S3 (Image & File Storage) - Optional
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=hustlebot-assets

# REDIS (Caching) - Optional
REDIS_URL=redis://localhost:6379

# SERVER CONFIG
NODE_ENV=$NODE_ENV
PORT=$PORT
LOG_LEVEL=$LOG_LEVEL

# BUDGET & TRACKING
MONTHLY_BUDGET=$MONTHLY_BUDGET
BUDGET_CURRENCY=$BUDGET_CURRENCY
TRACK_SPEND=$TRACK_SPEND

# FEATURE FLAGS
ENABLE_VOICE_INPUT=$ENABLE_VOICE_INPUT
ENABLE_IMAGE_GENERATION=$ENABLE_IMAGE_GENERATION
ENABLE_LEAD_GENERATION=$ENABLE_LEAD_GENERATION
ENABLE_LANDING_PAGE_BUILDER=$ENABLE_LANDING_PAGE_BUILDER
ENABLE_EMAIL_AUTOMATION=$ENABLE_EMAIL_AUTOMATION
EOF

print_success ".env file created successfully!"

###############################################################################
# Summary and Next Steps
###############################################################################

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║      Setup Complete!                  ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
print_info ".env file location: $(pwd)/$ENV_FILE"
echo ""
print_info "Next steps:"
echo "  1. Verify .env file contents: cat $ENV_FILE"
echo "  2. Install dependencies: npm install"
echo "  3. Create GitHub repository: https://github.com/new"
echo "  4. Deploy to Render: https://render.com"
echo "  5. Run deployment: ./deploy.sh production"
echo ""
print_info "For detailed setup instructions, see: AUTOMATION-SETUP-GUIDE.md"
echo ""

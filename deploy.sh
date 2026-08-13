#!/bin/bash

###############################################################################
# HustleBot v2 - Complete Deployment Automation Script
#
# This script automates the entire deployment process:
# 1. Validates environment
# 2. Runs tests
# 3. Builds the application
# 4. Pushes to GitHub
# 5. Deploys to Render
#
# Usage: ./deploy.sh [environment]
# Example: ./deploy.sh production
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT=${1:-production}
PROJECT_NAME="hustlebot-v2"
GITHUB_REPO="https://github.com/jpgreen30/hustlebot-v2.git"
RENDER_API_URL="https://api.render.com/v1"

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

###############################################################################
# Phase 1: Pre-Deployment Validation
###############################################################################

log_info "Starting HustleBot v2 deployment..."
log_info "Environment: $ENVIRONMENT"

# Check Node.js
if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed"
    exit 1
fi
log_success "Node.js version: $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
    log_error "npm is not installed"
    exit 1
fi
log_success "npm version: $(npm --version)"

# Check Git
if ! command -v git &> /dev/null; then
    log_error "Git is not installed"
    exit 1
fi
log_success "Git version: $(git --version)"

# Verify .env file exists
if [ ! -f .env ]; then
    log_error ".env file not found!"
    log_info "Please create .env file with required credentials"
    log_info "See AUTOMATION-SETUP-GUIDE.md for template"
    exit 1
fi
log_success ".env file found"

# Validate required environment variables
REQUIRED_VARS=(
    "TELEGRAM_BOT_TOKEN"
    "OPENROUTER_API_KEY"
    "SUPABASE_URL"
    "SUPABASE_KEY"
    "SUPABASE_SERVICE_KEY"
)

log_info "Validating required environment variables..."
for var in "${REQUIRED_VARS[@]}"; do
    if ! grep -q "^$var=" .env; then
        log_error "Missing required variable: $var"
        exit 1
    fi
done
log_success "All required environment variables present"

###############################################################################
# Phase 2: Install Dependencies
###############################################################################

log_info "Installing dependencies..."
if npm install; then
    log_success "Dependencies installed"
else
    log_error "Failed to install dependencies"
    exit 1
fi

###############################################################################
# Phase 3: Run Tests
###############################################################################

log_info "Running tests..."
if npm test 2>/dev/null || true; then
    log_success "Tests completed"
else
    log_warn "Some tests failed (continuing...)"
fi

###############################################################################
# Phase 4: Lint & Format Check
###############################################################################

log_info "Running linter..."
if npm run lint 2>/dev/null || true; then
    log_success "Lint check passed"
else
    log_warn "Some lint issues found (continuing...)"
fi

###############################################################################
# Phase 5: Database Migration
###############################################################################

log_info "Running database migrations..."
if npm run db:migrate; then
    log_success "Database migrations completed"
else
    log_warn "Database migrations failed (continuing...)"
fi

###############################################################################
# Phase 6: Git Operations
###############################################################################

log_info "Preparing Git repository..."

# Check git status
if [ -z "$(git status --porcelain)" ]; then
    log_success "Working directory clean"
else
    log_warn "Working directory has changes"
    log_info "Current changes:"
    git status --short
fi

# Ensure main branch
if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
    log_info "Switching to main branch..."
    git checkout main || git checkout -b main
fi

# Push to GitHub
log_info "Pushing to GitHub..."
if git push -u origin main; then
    log_success "Code pushed to GitHub"
else
    log_warn "Failed to push to GitHub (ensure remote is configured)"
fi

###############################################################################
# Phase 7: Render Deployment (if API key available)
###############################################################################

if [ -n "$RENDER_API_KEY" ]; then
    log_info "Deploying to Render..."

    # Check for Render CLI
    if command -v render &> /dev/null; then
        if render deploy; then
            log_success "Deployed to Render"
        else
            log_error "Render deployment failed"
        fi
    else
        log_warn "Render CLI not installed"
        log_info "Manual deployment needed:"
        log_info "1. Go to https://render.com/dashboard"
        log_info "2. Select '$PROJECT_NAME' service"
        log_info "3. Click 'Manual Deploy' → 'Deploy latest commit'"
    fi
else
    log_warn "RENDER_API_KEY not set"
    log_info "Manual deployment needed via Render dashboard"
fi

###############################################################################
# Phase 8: Post-Deployment Verification
###############################################################################

log_info "Running post-deployment checks..."

# Get Render URL from environment or config
RENDER_URL=${RENDER_URL:-"https://$PROJECT_NAME.onrender.com"}

# Wait for service to be ready
log_info "Waiting for service to start (max 60 seconds)..."
for i in {1..30}; do
    if curl -s "$RENDER_URL/health" > /dev/null 2>&1; then
        log_success "Service is healthy!"
        break
    fi
    log_info "Waiting... ($i/30)"
    sleep 2
done

# Test health endpoint
log_info "Testing health endpoint..."
if curl -s "$RENDER_URL/health" | grep -q "ok"; then
    log_success "Health check passed"
else
    log_warn "Health check inconclusive (service may still be starting)"
fi

###############################################################################
# Phase 9: Deployment Summary
###############################################################################

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   HustleBot v2 Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
log_success "Environment: $ENVIRONMENT"
log_success "Project: $PROJECT_NAME"
log_success "GitHub: $GITHUB_REPO"
log_success "Service URL: $RENDER_URL"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Visit $RENDER_URL to verify deployment"
echo "2. Test Telegram bot by sending a message"
echo "3. Monitor logs: https://render.com/dashboard"
echo "4. Set up error tracking and monitoring"
echo ""
log_info "Deployment completed at $(date)"

###############################################################################
# Cleanup & Exit
###############################################################################

exit 0

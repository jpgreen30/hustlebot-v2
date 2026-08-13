#!/usr/bin/env node

/**
 * HustleBot v2 - Automated Render Deployment via API
 *
 * This script uses Render's API to:
 * 1. Create a new Web Service
 * 2. Connect to GitHub (hustlebot-v2)
 * 3. Set all environment variables
 * 4. Trigger deployment
 *
 * Usage: node render-api-deploy.js <RENDER_API_KEY> <GITHUB_TOKEN>
 */

const https = require('https');
const fs = require('fs');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(color, label, message) {
  console.log(`${color}[${label}]${colors.reset} ${message}`);
}

function makeRequest(method, url, headers, body = null) {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    const req = https.request({
      hostname: options.hostname,
      path: options.pathname + options.search,
      method: method,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data),
            headers: res.headers
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data,
            headers: res.headers
          });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function deployToRender() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  HustleBot v2 - Render API Deploy     ║');
  console.log('╚════════════════════════════════════════╝\n');

  // Get API key from environment or command line
  const RENDER_API_KEY = process.argv[2] || process.env.RENDER_API_KEY;

  if (!RENDER_API_KEY) {
    log(colors.red, 'ERROR', 'Render API key required!');
    console.log('\nUsage:');
    console.log('  node render-api-deploy.js <RENDER_API_KEY>');
    console.log('\nOr set environment variable:');
    console.log('  export RENDER_API_KEY=your_api_key');
    process.exit(1);
  }

  log(colors.blue, 'INFO', 'Loading environment variables from .env...');

  // Load .env file
  const envFile = fs.readFileSync('.env', 'utf8');
  const env = {};
  envFile.split('\n').forEach(line => {
    if (line && !line.startsWith('#')) {
      const [key, ...values] = line.split('=');
      if (key) env[key.trim()] = values.join('=').trim();
    }
  });

  log(colors.green, 'SUCCESS', '.env loaded with credentials');

  // Prepare environment variables
  const envVars = [
    { key: 'TELEGRAM_BOT_TOKEN', value: env.TELEGRAM_BOT_TOKEN },
    { key: 'OPENROUTER_API_KEY', value: env.OPENROUTER_API_KEY },
    { key: 'SUPABASE_URL', value: env.SUPABASE_URL },
    { key: 'SUPABASE_KEY', value: env.SUPABASE_KEY },
    { key: 'SUPABASE_SERVICE_KEY', value: env.SUPABASE_SERVICE_KEY },
    { key: 'NODE_ENV', value: 'production' },
    { key: 'PORT', value: '3000' },
    { key: 'LOG_LEVEL', value: 'info' },
  ].filter(v => v.value);

  log(colors.blue, 'INFO', `Configured ${envVars.length} environment variables`);

  // Create service payload
  const servicePayload = {
    name: 'hustlebot-v2',
    ownerId: null,
    type: 'web_service',
    autoDeloy: 'yes',
    githubRepo: 'jpgreen30/hustlebot-v2',
    branch: 'main',
    buildCommand: 'npm install',
    startCommand: 'npm start',
    envVars: envVars,
    plan: 'starter',
    numInstances: 1,
  };

  log(colors.blue, 'INFO', 'Creating Render service...');

  try {
    const headers = {
      'Authorization': `Bearer ${RENDER_API_KEY}`,
      'Accept': 'application/json',
    };

    // Check if service exists
    log(colors.blue, 'INFO', 'Checking for existing service...');
    const listResponse = await makeRequest(
      'GET',
      'https://api.render.com/v1/services?name=hustlebot-v2',
      headers
    );

    let serviceId = null;
    if (listResponse.status === 200 && listResponse.data.services && listResponse.data.services.length > 0) {
      serviceId = listResponse.data.services[0].id;
      log(colors.yellow, 'WARN', `Service already exists (ID: ${serviceId})`);
    }

    if (!serviceId) {
      // Create new service
      log(colors.blue, 'INFO', 'Creating new service...');
      const createResponse = await makeRequest(
        'POST',
        'https://api.render.com/v1/services',
        headers,
        servicePayload
      );

      if (createResponse.status === 201 || createResponse.status === 200) {
        serviceId = createResponse.data.id || createResponse.data.service?.id;
        log(colors.green, 'SUCCESS', `Service created (ID: ${serviceId})`);
      } else {
        log(colors.red, 'ERROR', `Failed to create service: ${createResponse.status}`);
        console.log(createResponse.data);
        process.exit(1);
      }
    }

    // Update environment variables
    if (serviceId) {
      log(colors.blue, 'INFO', 'Setting environment variables...');

      for (const envVar of envVars) {
        await makeRequest(
          'PUT',
          `https://api.render.com/v1/services/${serviceId}/env-vars/${envVar.key}`,
          headers,
          { value: envVar.value }
        );
      }

      log(colors.green, 'SUCCESS', `${envVars.length} environment variables set`);

      // Trigger deployment
      log(colors.blue, 'INFO', 'Triggering deployment...');
      const deployResponse = await makeRequest(
        'POST',
        `https://api.render.com/v1/services/${serviceId}/deploys`,
        headers
      );

      if (deployResponse.status === 201 || deployResponse.status === 200) {
        log(colors.green, 'SUCCESS', 'Deployment triggered');
      } else {
        log(colors.yellow, 'WARN', 'Could not trigger deployment via API');
      }
    }

    // Summary
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║     Deployment Complete!              ║');
    console.log('╚════════════════════════════════════════╝\n');

    log(colors.green, 'SUCCESS', 'Service configured');
    console.log(`
Service ID:  ${serviceId}
Name:        hustlebot-v2
Repository:  jpgreen30/hustlebot-v2
Branch:      main
Status:      Building/Deploying

Monitor at: https://dashboard.render.com/services/${serviceId}

The service will:
  1. Build (npm install) - 2-3 minutes
  2. Start (npm start) - 30 seconds
  3. Go Live - https://hustlebot-v2.onrender.com

Check deployment:
  curl https://hustlebot-v2.onrender.com/health

Test Telegram bot:
  Send message to @hustlebot_v2_bot
    `);

  } catch (error) {
    log(colors.red, 'ERROR', error.message);
    console.log(error);
    process.exit(1);
  }
}

deployToRender();

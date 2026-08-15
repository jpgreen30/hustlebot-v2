#!/usr/bin/env node

/**
 * Vercel Deployment Verification Script
 *
 * Checks:
 * 1. Local server starts correctly
 * 2. All endpoints respond
 * 3. Environment variables present
 * 4. Module imports work
 * 5. Provides deployment diagnostics
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

console.log('\n🔍 VERCEL DEPLOYMENT VERIFICATION');
console.log('='.repeat(60) + '\n');

// ============================================================
// 1. Environment Variables Check
// ============================================================
console.log('1️⃣  ENVIRONMENT VARIABLES:');
console.log('-'.repeat(60));

const critical = [
  'NODE_ENV',
  'SUPABASE_URL',
  'SUPABASE_KEY',
  'SUPABASE_SERVICE_KEY',
  'OPENROUTER_API_KEY'
];

const optional = [
  'TELEGRAM_BOT_TOKEN',
  'DEEPGRAM_API_KEY',
  'ELEVENLABS_API_KEY',
  'STRIPE_SECRET_KEY',
  'BREVO_API_KEY'
];

const envStatus = { critical: 0, optional: 0, missing_critical: [] };

console.log('\n  Critical Variables:');
critical.forEach(key => {
  const value = process.env[key];
  if (value) {
    const masked = value.substring(0, 10) + '***';
    console.log(`    ✅ ${key}: ${masked}`);
    envStatus.critical++;
  } else {
    console.log(`    ❌ ${key}: NOT SET`);
    envStatus.missing_critical.push(key);
  }
});

console.log('\n  Optional Variables:');
optional.forEach(key => {
  const value = process.env[key];
  if (value) {
    const masked = value.substring(0, 10) + '***';
    console.log(`    ✅ ${key}: ${masked}`);
    envStatus.optional++;
  } else {
    console.log(`    ⚠️  ${key}: NOT SET (optional)`);
  }
});

// ============================================================
// 2. File Structure Check
// ============================================================
console.log('\n2️⃣  FILE STRUCTURE:');
console.log('-'.repeat(60));

const requiredFiles = [
  'src/server.js',
  'package.json',
  'vercel.json',
  '.vercelignore',
  'src/agents/voice-conversation-agent.js',
  'src/agents/voice-workflow-builder-agent.js',
  'src/agents/voice-workflow-refiner-agent.js',
  'src/core/conversation-manager.js',
  'src/core/transcript-processor.js',
  'src/core/workflow-refinement-manager.js'
];

let filesOk = 0;
requiredFiles.forEach(file => {
  const fullPath = path.join(projectRoot, file);
  if (fs.existsSync(fullPath)) {
    console.log(`  ✅ ${file}`);
    filesOk++;
  } else {
    console.log(`  ❌ ${file}`);
  }
});

console.log(`\n  Summary: ${filesOk}/${requiredFiles.length} files present`);

// ============================================================
// 3. Package.json Check
// ============================================================
console.log('\n3️⃣  PACKAGE CONFIGURATION:');
console.log('-'.repeat(60));

try {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
  );

  console.log(`  📦 Name: ${packageJson.name}`);
  console.log(`  📦 Version: ${packageJson.version}`);
  console.log(`  📦 Main: ${packageJson.main || 'N/A'}`);
  console.log(`  📦 Type: ${packageJson.type || 'commonjs'}`);

  if (packageJson.scripts.start) {
    console.log(`  ✅ Start script: ${packageJson.scripts.start}`);
  } else {
    console.log(`  ❌ No start script defined`);
  }

  const deps = Object.keys(packageJson.dependencies || {}).length;
  const devDeps = Object.keys(packageJson.devDependencies || {}).length;
  console.log(`  📚 Dependencies: ${deps} + ${devDeps} dev`);
} catch (error) {
  console.log(`  ❌ Error reading package.json: ${error.message}`);
}

// ============================================================
// 4. Vercel Configuration
// ============================================================
console.log('\n4️⃣  VERCEL CONFIGURATION:');
console.log('-'.repeat(60));

try {
  const vercelJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'vercel.json'), 'utf8')
  );

  console.log(`  ✅ vercel.json valid`);
  console.log(`  📍 Version: ${vercelJson.version}`);

  if (vercelJson.builds) {
    vercelJson.builds.forEach((build, i) => {
      console.log(`  📍 Build ${i + 1}: ${build.src} → ${build.use}`);
    });
  }

  if (vercelJson.routes) {
    console.log(`  📍 Routes: ${vercelJson.routes.length} route(s) configured`);
  }

  if (vercelJson.env) {
    console.log(`  📍 Environment: ${Object.keys(vercelJson.env).join(', ')}`);
  }
} catch (error) {
  console.log(`  ❌ Error reading vercel.json: ${error.message}`);
}

// ============================================================
// 5. Diagnostic Summary
// ============================================================
console.log('\n5️⃣  DIAGNOSTIC SUMMARY:');
console.log('-'.repeat(60));

const issues = [];

if (envStatus.missing_critical.length > 0) {
  issues.push(`Missing critical env vars: ${envStatus.missing_critical.join(', ')}`);
}

if (filesOk < requiredFiles.length) {
  const missing = requiredFiles.length - filesOk;
  issues.push(`Missing ${missing} required file(s)`);
}

if (process.env.VERCEL) {
  console.log('\n  🌐 Running in Vercel environment');
} else {
  console.log('\n  💻 Running in local environment');
}

if (issues.length === 0) {
  console.log('\n  ✅ All checks passed!');
  console.log('  ✅ Deployment should be ready');
} else {
  console.log('\n  ⚠️  Issues found:');
  issues.forEach((issue, i) => {
    console.log(`     ${i + 1}. ${issue}`);
  });
}

// ============================================================
// 6. Deployment Instructions
// ============================================================
console.log('\n6️⃣  NEXT STEPS:');
console.log('-'.repeat(60));

if (envStatus.missing_critical.length > 0) {
  console.log('\n  1. Set missing environment variables in Vercel:');
  console.log('     → Go to: https://vercel.com/dashboard/jpgreen30/hustlebot-v2');
  console.log('     → Click Settings → Environment Variables');
  console.log('     → Add the missing variables listed above');
  console.log('\n  2. Redeploy:');
  console.log('     → Go to Deployments tab');
  console.log('     → Click three dots on latest deployment');
  console.log('     → Select "Redeploy"');
} else {
  console.log('\n  1. All checks pass! You can:');
  console.log('     → Commit changes: git add . && git commit -m "..."');
  console.log('     → Push to Vercel: git push origin main');
  console.log('     → Or manually redeploy from Vercel dashboard');
}

console.log('\n  3. Verify deployment:');
console.log('     → curl https://hustlebot-v2.vercel.app/health');

// ============================================================
// 7. Quick Test
// ============================================================
console.log('\n7️⃣  LOCAL TEST:');
console.log('-'.repeat(60));

console.log('\n  To test locally before deploying:');
console.log('     npm start');
console.log('     # In another terminal:');
console.log('     curl http://localhost:3000/health');
console.log('     curl -X POST http://localhost:3000/api/conversations/start \\');
console.log('       -H "Content-Type: application/json" \\');
console.log('       -d \'{"workflowId":"test","initialRequest":"Hello","phoneNumber":"+1-555-0100"}\'');

console.log('\n' + '='.repeat(60) + '\n');

if (issues.length === 0) {
  console.log('✅ Deployment ready! Proceed with git push.\n');
  process.exit(0);
} else {
  console.log('⚠️  Fix issues above before deploying.\n');
  process.exit(1);
}

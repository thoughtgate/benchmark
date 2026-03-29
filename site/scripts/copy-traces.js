#!/usr/bin/env node
/**
 * Prebuild script: copy processed trace files to public/ so they are
 * available as static assets in the Next.js export.
 *
 * Reads ../runs/manifest.json to find the latest run, then copies
 * traces/{model_id}/{scenario_id}.json into public/traces/{date}/.
 */

const fs = require('fs');
const path = require('path');

const RUNS_DIR = path.resolve(__dirname, '..', '..', 'runs');
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public', 'traces');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += copyDirRecursive(srcPath, destPath);
    } else if (entry.name.endsWith('.json')) {
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

function main() {
  const manifestPath = path.join(RUNS_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.log('No runs/manifest.json found, skipping trace copy');
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  // Copy traces for all runs (not just latest) so historical runs are accessible
  let totalCopied = 0;
  for (const run of manifest.runs) {
    const tracesDir = path.join(RUNS_DIR, run.date, 'traces');
    if (!fs.existsSync(tracesDir)) continue;
    const destDir = path.join(PUBLIC_DIR, run.date);
    const count = copyDirRecursive(tracesDir, destDir);
    totalCopied += count;
  }

  if (totalCopied > 0) {
    console.log(`Copied ${totalCopied} trace files to public/traces/`);
  } else {
    console.log('No trace files found to copy');
  }
}

main();

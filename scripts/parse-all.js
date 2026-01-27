#!/usr/bin/env node
/**
 * Parse all discovered lockfiles and build inventory
 *
 * Supports:
 * - package-lock.json (npm, v2 and v3)
 * - requirements.txt (pip)
 * - poetry.lock (Poetry)
 */

const fs = require('fs');
const path = require('path');

const LOCKFILES = process.env.LOCKFILES || '';
const PROJECT_ID = process.env.PROJECT_ID || 'unknown';
const INCLUDE_DEV = process.env.INCLUDE_DEV !== 'false';
const WORKING_DIR = process.env.WORKING_DIR || '.';

/**
 * Parse npm package-lock.json
 */
function parseNpmLockfile(filePath) {
  const dependencies = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lock = JSON.parse(content);

    // Handle lockfile v2/v3 format (packages object)
    if (lock.packages) {
      for (const [pkgPath, pkg] of Object.entries(lock.packages)) {
        // Skip root package
        if (pkgPath === '') continue;

        // Extract package name from path (node_modules/package-name)
        const name = pkgPath.replace(/^node_modules\//, '').split('node_modules/').pop();

        if (!name || !pkg.version) continue;

        // Skip dev dependencies if not included
        if (pkg.dev && !INCLUDE_DEV) continue;

        dependencies.push({
          ecosystem: 'npm',
          name,
          version: pkg.version,
          dev: pkg.dev || false,
          lockfile_source: filePath,
        });
      }
    }
    // Handle lockfile v1 format (dependencies object)
    else if (lock.dependencies) {
      const parseDepsV1 = (deps, isDev = false) => {
        for (const [name, info] of Object.entries(deps)) {
          if (!info.version) continue;

          // Skip dev if not included
          if (isDev && !INCLUDE_DEV) continue;

          dependencies.push({
            ecosystem: 'npm',
            name,
            version: info.version,
            dev: isDev,
            lockfile_source: filePath,
          });

          // Recurse into nested dependencies
          if (info.dependencies) {
            parseDepsV1(info.dependencies, isDev);
          }
        }
      };

      parseDepsV1(lock.dependencies, false);

      // Parse devDependencies if present
      if (lock.devDependencies) {
        parseDepsV1(lock.devDependencies, true);
      }
    }

    console.log(`Parsed ${dependencies.length} packages from ${filePath}`);
  } catch (err) {
    console.error(`Error parsing ${filePath}: ${err.message}`);
  }

  return dependencies;
}

/**
 * Parse requirements.txt
 */
function parseRequirements(filePath) {
  const dependencies = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      // Skip comments and empty lines
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;

      // Parse package==version, package>=version, etc.
      const match = trimmed.match(/^([a-zA-Z0-9_-]+(?:\[[^\]]+\])?)\s*([=<>!~]+)?\s*([^\s;#]+)?/);

      if (match) {
        const name = match[1].replace(/\[.*\]$/, ''); // Remove extras
        let version = match[3] || '*';

        // Clean up version
        version = version.replace(/[,;].*$/, '').trim();

        if (name) {
          dependencies.push({
            ecosystem: 'pypi',
            name: name.toLowerCase(),
            version,
            dev: filePath.includes('dev') || filePath.includes('test'),
            lockfile_source: filePath,
          });
        }
      }
    }

    console.log(`Parsed ${dependencies.length} packages from ${filePath}`);
  } catch (err) {
    console.error(`Error parsing ${filePath}: ${err.message}`);
  }

  return dependencies;
}

/**
 * Parse poetry.lock
 */
function parsePoetryLock(filePath) {
  const dependencies = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Simple TOML parsing for [[package]] sections
    const packageBlocks = content.split('[[package]]').slice(1);

    for (const block of packageBlocks) {
      const nameMatch = block.match(/^name\s*=\s*"([^"]+)"/m);
      const versionMatch = block.match(/^version\s*=\s*"([^"]+)"/m);
      const categoryMatch = block.match(/^category\s*=\s*"([^"]+)"/m);

      if (nameMatch && versionMatch) {
        const isDev = categoryMatch && categoryMatch[1] === 'dev';

        // Skip dev if not included
        if (isDev && !INCLUDE_DEV) continue;

        dependencies.push({
          ecosystem: 'pypi',
          name: nameMatch[1].toLowerCase(),
          version: versionMatch[1],
          dev: isDev,
          lockfile_source: filePath,
        });
      }
    }

    console.log(`Parsed ${dependencies.length} packages from ${filePath}`);
  } catch (err) {
    console.error(`Error parsing ${filePath}: ${err.message}`);
  }

  return dependencies;
}

/**
 * Main execution
 */
function main() {
  if (!LOCKFILES) {
    console.log('No lockfiles to parse');
    writeInventory([]);
    return;
  }

  const allDependencies = [];
  const lockfileList = LOCKFILES.split(',');

  for (const entry of lockfileList) {
    const [type, ...pathParts] = entry.split(':');
    const filePath = pathParts.join(':'); // Handle paths with colons

    if (!filePath) continue;

    let deps = [];

    switch (type) {
      case 'npm':
        deps = parseNpmLockfile(filePath);
        break;
      case 'requirements':
        deps = parseRequirements(filePath);
        break;
      case 'poetry':
        deps = parsePoetryLock(filePath);
        break;
      default:
        console.warn(`Unknown lockfile type: ${type}`);
    }

    allDependencies.push(...deps);
  }

  // Deduplicate by ecosystem:name:version
  const seen = new Set();
  const unique = allDependencies.filter((dep) => {
    const key = `${dep.ecosystem}:${dep.name}:${dep.version}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`Total unique packages: ${unique.length}`);

  writeInventory(unique);
}

/**
 * Write inventory to file
 */
function writeInventory(dependencies) {
  const inventory = {
    project_id: PROJECT_ID,
    generated_at: new Date().toISOString(),
    source: 'github-action',
    dependencies: dependencies.map(({ ecosystem, name, version, dev, lockfile_source }) => ({
      ecosystem,
      name,
      version,
      ...(dev !== undefined && { dev }),
      ...(lockfile_source && { lockfile_source }),
    })),
  };

  const outputPath = path.join(WORKING_DIR, '.canary-inventory.json');
  fs.writeFileSync(outputPath, JSON.stringify(inventory, null, 2));

  console.log(`Wrote inventory to ${outputPath}`);

  // Set output for GitHub Actions
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    fs.appendFileSync(outputFile, `packages_count=${dependencies.length}\n`);
    fs.appendFileSync(outputFile, `inventory_path=${outputPath}\n`);
  }
}

main();

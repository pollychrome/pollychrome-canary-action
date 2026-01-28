#!/usr/bin/env node
/**
 * Parse all discovered lockfiles and build inventory
 *
 * Supports:
 * - package-lock.json (npm, v1-v3)
 * - requirements.txt (pip)
 * - poetry.lock (Poetry)
 * - go.sum / go.mod (Go)
 * - Gemfile.lock (RubyGems)
 * - Cargo.lock (Cargo)
 * - composer.lock (Composer)
 * - packages.lock.json (NuGet)
 * - pom.xml (Maven)
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
 * Parse go.sum
 */
function parseGoSum(filePath) {
  const dependencies = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) continue;

      const name = parts[0];
      let version = parts[1];

      if (version.endsWith('/go.mod')) {
        version = version.replace('/go.mod', '');
      }

      if (!name || !version) continue;

      dependencies.push({
        ecosystem: 'go',
        name,
        version,
        dev: false,
        lockfile_source: filePath,
      });
    }

    console.log(`Parsed ${dependencies.length} packages from ${filePath}`);
  } catch (err) {
    console.error(`Error parsing ${filePath}: ${err.message}`);
  }

  return dependencies;
}

/**
 * Parse go.mod
 */
function parseGoMod(filePath) {
  const dependencies = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    let inRequireBlock = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;

      if (trimmed.startsWith('require (')) {
        inRequireBlock = true;
        continue;
      }

      if (inRequireBlock && trimmed.startsWith(')')) {
        inRequireBlock = false;
        continue;
      }

      let candidate = null;

      if (inRequireBlock) {
        candidate = trimmed;
      } else if (trimmed.startsWith('require ')) {
        candidate = trimmed.replace(/^require\s+/, '');
      }

      if (!candidate) continue;

      const cleaned = candidate.split('//')[0].trim();
      const parts = cleaned.split(/\s+/);
      if (parts.length < 2) continue;

      const name = parts[0];
      const version = parts[1];
      if (!name || !version) continue;

      dependencies.push({
        ecosystem: 'go',
        name,
        version,
        dev: false,
        lockfile_source: filePath,
      });
    }

    console.log(`Parsed ${dependencies.length} packages from ${filePath}`);
  } catch (err) {
    console.error(`Error parsing ${filePath}: ${err.message}`);
  }

  return dependencies;
}

/**
 * Parse Gemfile.lock
 */
function parseGemfileLock(filePath) {
  const dependencies = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    let inSpecs = false;

    for (const line of lines) {
      if (line.trim() === 'specs:') {
        inSpecs = true;
        continue;
      }

      if (inSpecs && line.trim() === '') {
        continue;
      }

      if (inSpecs && /^[A-Z]/.test(line.trim())) {
        inSpecs = false;
      }

      if (!inSpecs) continue;

      const match = line.match(/^\s{4}([A-Za-z0-9_.-]+)\s+\(([^)]+)\)/);
      if (!match) continue;

      const name = match[1];
      const version = match[2].split(',')[0].trim();
      if (!name || !version) continue;

      dependencies.push({
        ecosystem: 'rubygems',
        name,
        version,
        dev: false,
        lockfile_source: filePath,
      });
    }

    console.log(`Parsed ${dependencies.length} packages from ${filePath}`);
  } catch (err) {
    console.error(`Error parsing ${filePath}: ${err.message}`);
  }

  return dependencies;
}

/**
 * Parse Cargo.lock
 */
function parseCargoLock(filePath) {
  const dependencies = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const blocks = content.split('[[package]]').slice(1);

    for (const block of blocks) {
      const nameMatch = block.match(/^name\s*=\s*"([^"]+)"/m);
      const versionMatch = block.match(/^version\s*=\s*"([^"]+)"/m);

      if (nameMatch && versionMatch) {
        dependencies.push({
          ecosystem: 'cargo',
          name: nameMatch[1],
          version: versionMatch[1],
          dev: false,
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
 * Parse composer.lock
 */
function parseComposerLock(filePath) {
  const dependencies = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lock = JSON.parse(content);

    const packages = Array.isArray(lock.packages) ? lock.packages : [];
    const packagesDev = Array.isArray(lock['packages-dev']) ? lock['packages-dev'] : [];

    for (const pkg of packages) {
      if (!pkg.name || !pkg.version) continue;
      dependencies.push({
        ecosystem: 'composer',
        name: pkg.name,
        version: pkg.version,
        dev: false,
        lockfile_source: filePath,
      });
    }

    if (INCLUDE_DEV) {
      for (const pkg of packagesDev) {
        if (!pkg.name || !pkg.version) continue;
        dependencies.push({
          ecosystem: 'composer',
          name: pkg.name,
          version: pkg.version,
          dev: true,
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
 * Parse packages.lock.json (NuGet)
 */
function parseNugetLock(filePath) {
  const dependencies = [];

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lock = JSON.parse(content);
    const targets = lock.dependencies || {};

    for (const target of Object.values(targets)) {
      if (!target || typeof target !== 'object') continue;
      for (const [name, info] of Object.entries(target)) {
        if (!info || typeof info !== 'object') continue;
        const version = info.resolved || info.version || info.requested;
        if (!version) continue;

        dependencies.push({
          ecosystem: 'nuget',
          name,
          version,
          dev: false,
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
 * Parse pom.xml (Maven)
 */
function parseMavenPom(filePath) {
  const dependencies = [];

  try {
    let content = fs.readFileSync(filePath, 'utf-8');

    // Remove dependencyManagement blocks to avoid BOM-only entries
    content = content.replace(/<dependencyManagement>[\s\S]*?<\/dependencyManagement>/g, '');

    const blocks = content.match(/<dependency>[\s\S]*?<\/dependency>/g) || [];

    for (const block of blocks) {
      const groupMatch = block.match(/<groupId>([^<]+)<\/groupId>/);
      const artifactMatch = block.match(/<artifactId>([^<]+)<\/artifactId>/);
      const versionMatch = block.match(/<version>([^<]+)<\/version>/);
      const scopeMatch = block.match(/<scope>([^<]+)<\/scope>/);

      if (!groupMatch || !artifactMatch || !versionMatch) continue;

      const groupId = groupMatch[1].trim();
      const artifactId = artifactMatch[1].trim();
      const version = versionMatch[1].trim();
      const scope = scopeMatch ? scopeMatch[1].trim() : '';

      if (!groupId || !artifactId || !version) continue;
      if (version.includes('${')) continue;

      const isDev = scope === 'test';
      if (isDev && !INCLUDE_DEV) continue;

      dependencies.push({
        ecosystem: 'maven',
        name: `${groupId}:${artifactId}`,
        version,
        dev: isDev,
        lockfile_source: filePath,
      });
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
      case 'go':
        if (filePath.endsWith('go.sum')) {
          deps = parseGoSum(filePath);
        } else {
          deps = parseGoMod(filePath);
        }
        break;
      case 'rubygems':
        deps = parseGemfileLock(filePath);
        break;
      case 'cargo':
        deps = parseCargoLock(filePath);
        break;
      case 'composer':
        deps = parseComposerLock(filePath);
        break;
      case 'nuget':
        deps = parseNugetLock(filePath);
        break;
      case 'maven':
        deps = parseMavenPom(filePath);
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

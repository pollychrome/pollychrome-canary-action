#!/usr/bin/env node
/**
 * Tests for lockfile parsers
 *
 * Run with: node test-parsers.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Test fixtures
const FIXTURES = {
  'package-lock-v3': {
    name: 'test-project',
    lockfileVersion: 3,
    packages: {
      '': { name: 'test-project', version: '1.0.0' },
      'node_modules/lodash': { version: '4.17.21' },
      'node_modules/typescript': { version: '5.0.0', dev: true },
      'node_modules/jest': { version: '29.0.0', dev: true },
    },
  },

  'package-lock-v2': {
    name: 'test-project',
    lockfileVersion: 2,
    packages: {
      '': { name: 'test-project', version: '1.0.0' },
      'node_modules/express': { version: '4.18.0' },
    },
    dependencies: {
      express: { version: '4.18.0' },
    },
  },

  requirements: `
# Production dependencies
flask==2.0.0
requests>=2.28.0
sqlalchemy~=1.4.0

# Comment line
-r other-requirements.txt

# Dev dependencies in main file
pytest==7.0.0  # inline comment
`,

  poetry: `
[[package]]
name = "requests"
version = "2.28.0"
description = "HTTP library"

[[package]]
name = "pytest"
version = "7.0.0"
description = "Testing framework"
category = "dev"

[[package]]
name = "flask"
version = "2.0.0"
description = "Web framework"
`,

  goSum: `
github.com/pkg/errors v0.9.1 h1:abcdef
golang.org/x/net v0.7.0 h1:ghijkl
golang.org/x/sys v0.6.0/go.mod h1:mnopqr
`,

  goMod: `
module example.com/test

go 1.21

require (
  github.com/pkg/errors v0.9.1
  golang.org/x/net v0.7.0 // indirect
)
`,

  gemfile: `
GEM
  remote: https://rubygems.org/
  specs:
    rack (2.2.7)
    rake (13.0.6)

PLATFORMS
  ruby

DEPENDENCIES
  rack
  rake
`,

  cargo: `
[[package]]
name = "serde"
version = "1.0.188"

[[package]]
name = "tokio"
version = "1.32.0"
`,

  composer: {
    packages: [
      { name: "laravel/framework", version: "v10.0.0" },
    ],
    "packages-dev": [
      { name: "phpunit/phpunit", version: "v10.1.0" },
    ],
  },

  nuget: {
    version: 1,
    dependencies: {
      "net7.0": {
        "Newtonsoft.Json": { resolved: "13.0.1", type: "Direct" },
        "Serilog": { resolved: "2.12.0", type: "Transitive" },
      },
    },
  },

  pom: `
<project>
  <modelVersion>4.0.0</modelVersion>
  <dependencies>
    <dependency>
      <groupId>org.apache.commons</groupId>
      <artifactId>commons-lang3</artifactId>
      <version>3.12.0</version>
    </dependency>
    <dependency>
      <groupId>junit</groupId>
      <artifactId>junit</artifactId>
      <version>4.13.2</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>
`,
};

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`✓ ${message}`);
  } else {
    failed++;
    console.log(`✗ ${message}`);
  }
}

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'canary-test-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

// Test npm parser (v3)
console.log('\n=== Testing npm package-lock.json v3 ===');
{
  const tempDir = createTempDir();
  const lockPath = path.join(tempDir, 'package-lock.json');
  fs.writeFileSync(lockPath, JSON.stringify(FIXTURES['package-lock-v3'], null, 2));

  // Set env and run parser
  process.env.LOCKFILES = `npm:${lockPath}`;
  process.env.PROJECT_ID = 'test-npm-v3';
  process.env.INCLUDE_DEV = 'true';
  process.env.WORKING_DIR = tempDir;
  process.env.GITHUB_OUTPUT = path.join(tempDir, 'output');
  fs.writeFileSync(process.env.GITHUB_OUTPUT, '');

  // Run parser
  require('./parse-all.js');

  // Reset module cache for next test
  delete require.cache[require.resolve('./parse-all.js')];

  // Check output
  const inventory = JSON.parse(fs.readFileSync(path.join(tempDir, '.canary-inventory.json')));

  assert(inventory.project_id === 'test-npm-v3', 'Project ID set correctly');
  assert(inventory.dependencies.length === 3, `Found 3 packages (got ${inventory.dependencies.length})`);
  assert(
    inventory.dependencies.some((d) => d.name === 'lodash' && d.version === '4.17.21'),
    'Found lodash dependency'
  );
  assert(
    inventory.dependencies.some((d) => d.name === 'typescript' && d.dev === true),
    'TypeScript marked as dev'
  );

  cleanup(tempDir);
}

// Test requirements.txt parser
console.log('\n=== Testing requirements.txt ===');
{
  const tempDir = createTempDir();
  const reqPath = path.join(tempDir, 'requirements.txt');
  fs.writeFileSync(reqPath, FIXTURES.requirements);

  process.env.LOCKFILES = `requirements:${reqPath}`;
  process.env.PROJECT_ID = 'test-requirements';
  process.env.INCLUDE_DEV = 'true';
  process.env.WORKING_DIR = tempDir;
  process.env.GITHUB_OUTPUT = path.join(tempDir, 'output');
  fs.writeFileSync(process.env.GITHUB_OUTPUT, '');

  require('./parse-all.js');
  delete require.cache[require.resolve('./parse-all.js')];

  const inventory = JSON.parse(fs.readFileSync(path.join(tempDir, '.canary-inventory.json')));

  assert(inventory.dependencies.length >= 4, `Found 4+ packages (got ${inventory.dependencies.length})`);
  assert(
    inventory.dependencies.some((d) => d.name === 'flask' && d.version === '2.0.0'),
    'Found flask with exact version'
  );
  assert(
    inventory.dependencies.some((d) => d.name === 'requests'),
    'Found requests dependency'
  );
  assert(inventory.dependencies.every((d) => d.ecosystem === 'pypi'), 'All marked as pypi ecosystem');

  cleanup(tempDir);
}

// Test poetry.lock parser
console.log('\n=== Testing poetry.lock ===');
{
  const tempDir = createTempDir();
  const poetryPath = path.join(tempDir, 'poetry.lock');
  fs.writeFileSync(poetryPath, FIXTURES.poetry);

  process.env.LOCKFILES = `poetry:${poetryPath}`;
  process.env.PROJECT_ID = 'test-poetry';
  process.env.INCLUDE_DEV = 'true';
  process.env.WORKING_DIR = tempDir;
  process.env.GITHUB_OUTPUT = path.join(tempDir, 'output');
  fs.writeFileSync(process.env.GITHUB_OUTPUT, '');

  require('./parse-all.js');
  delete require.cache[require.resolve('./parse-all.js')];

  const inventory = JSON.parse(fs.readFileSync(path.join(tempDir, '.canary-inventory.json')));

  assert(inventory.dependencies.length === 3, `Found 3 packages (got ${inventory.dependencies.length})`);
  assert(
    inventory.dependencies.some((d) => d.name === 'pytest' && d.dev === true),
    'pytest marked as dev'
  );
  assert(
    inventory.dependencies.some((d) => d.name === 'flask' && !d.dev),
    'flask marked as prod'
  );

  cleanup(tempDir);
}

// Test excluding dev dependencies
console.log('\n=== Testing INCLUDE_DEV=false ===');
{
  const tempDir = createTempDir();
  const lockPath = path.join(tempDir, 'package-lock.json');
  fs.writeFileSync(lockPath, JSON.stringify(FIXTURES['package-lock-v3'], null, 2));

  process.env.LOCKFILES = `npm:${lockPath}`;
  process.env.PROJECT_ID = 'test-no-dev';
  process.env.INCLUDE_DEV = 'false';
  process.env.WORKING_DIR = tempDir;
  process.env.GITHUB_OUTPUT = path.join(tempDir, 'output');
  fs.writeFileSync(process.env.GITHUB_OUTPUT, '');

  require('./parse-all.js');
  delete require.cache[require.resolve('./parse-all.js')];

  const inventory = JSON.parse(fs.readFileSync(path.join(tempDir, '.canary-inventory.json')));

  assert(inventory.dependencies.length === 1, `Found only 1 prod package (got ${inventory.dependencies.length})`);
  assert(inventory.dependencies[0].name === 'lodash', 'Only lodash (prod) included');

  cleanup(tempDir);
}

// Test go.sum parser
console.log('\n=== Testing go.sum ===');
{
  const tempDir = createTempDir();
  const goSumPath = path.join(tempDir, 'go.sum');
  fs.writeFileSync(goSumPath, FIXTURES.goSum);

  process.env.LOCKFILES = `go:${goSumPath}`;
  process.env.PROJECT_ID = 'test-go-sum';
  process.env.INCLUDE_DEV = 'true';
  process.env.WORKING_DIR = tempDir;
  process.env.GITHUB_OUTPUT = path.join(tempDir, 'output');
  fs.writeFileSync(process.env.GITHUB_OUTPUT, '');

  require('./parse-all.js');
  delete require.cache[require.resolve('./parse-all.js')];

  const inventory = JSON.parse(fs.readFileSync(path.join(tempDir, '.canary-inventory.json')));
  assert(inventory.dependencies.length >= 2, 'Parsed go.sum dependencies');
  assert(inventory.dependencies.some((d) => d.ecosystem === 'go'), 'Go ecosystem set');

  cleanup(tempDir);
}

// Test go.mod parser
console.log('\n=== Testing go.mod ===');
{
  const tempDir = createTempDir();
  const goModPath = path.join(tempDir, 'go.mod');
  fs.writeFileSync(goModPath, FIXTURES.goMod);

  process.env.LOCKFILES = `go:${goModPath}`;
  process.env.PROJECT_ID = 'test-go-mod';
  process.env.INCLUDE_DEV = 'true';
  process.env.WORKING_DIR = tempDir;
  process.env.GITHUB_OUTPUT = path.join(tempDir, 'output');
  fs.writeFileSync(process.env.GITHUB_OUTPUT, '');

  require('./parse-all.js');
  delete require.cache[require.resolve('./parse-all.js')];

  const inventory = JSON.parse(fs.readFileSync(path.join(tempDir, '.canary-inventory.json')));
  assert(inventory.dependencies.length >= 2, 'Parsed go.mod dependencies');

  cleanup(tempDir);
}

// Test Gemfile.lock parser
console.log('\n=== Testing Gemfile.lock ===');
{
  const tempDir = createTempDir();
  const gemPath = path.join(tempDir, 'Gemfile.lock');
  fs.writeFileSync(gemPath, FIXTURES.gemfile);

  process.env.LOCKFILES = `rubygems:${gemPath}`;
  process.env.PROJECT_ID = 'test-gemfile';
  process.env.INCLUDE_DEV = 'true';
  process.env.WORKING_DIR = tempDir;
  process.env.GITHUB_OUTPUT = path.join(tempDir, 'output');
  fs.writeFileSync(process.env.GITHUB_OUTPUT, '');

  require('./parse-all.js');
  delete require.cache[require.resolve('./parse-all.js')];

  const inventory = JSON.parse(fs.readFileSync(path.join(tempDir, '.canary-inventory.json')));
  assert(inventory.dependencies.length === 2, 'Parsed Gemfile.lock dependencies');
  assert(inventory.dependencies[0].ecosystem === 'rubygems', 'RubyGems ecosystem set');

  cleanup(tempDir);
}

// Test Cargo.lock parser
console.log('\n=== Testing Cargo.lock ===');
{
  const tempDir = createTempDir();
  const cargoPath = path.join(tempDir, 'Cargo.lock');
  fs.writeFileSync(cargoPath, FIXTURES.cargo);

  process.env.LOCKFILES = `cargo:${cargoPath}`;
  process.env.PROJECT_ID = 'test-cargo';
  process.env.INCLUDE_DEV = 'true';
  process.env.WORKING_DIR = tempDir;
  process.env.GITHUB_OUTPUT = path.join(tempDir, 'output');
  fs.writeFileSync(process.env.GITHUB_OUTPUT, '');

  require('./parse-all.js');
  delete require.cache[require.resolve('./parse-all.js')];

  const inventory = JSON.parse(fs.readFileSync(path.join(tempDir, '.canary-inventory.json')));
  assert(inventory.dependencies.length === 2, 'Parsed Cargo.lock dependencies');
  assert(inventory.dependencies[0].ecosystem === 'cargo', 'Cargo ecosystem set');

  cleanup(tempDir);
}

// Test composer.lock parser
console.log('\n=== Testing composer.lock ===');
{
  const tempDir = createTempDir();
  const composerPath = path.join(tempDir, 'composer.lock');
  fs.writeFileSync(composerPath, JSON.stringify(FIXTURES.composer, null, 2));

  process.env.LOCKFILES = `composer:${composerPath}`;
  process.env.PROJECT_ID = 'test-composer';
  process.env.INCLUDE_DEV = 'true';
  process.env.WORKING_DIR = tempDir;
  process.env.GITHUB_OUTPUT = path.join(tempDir, 'output');
  fs.writeFileSync(process.env.GITHUB_OUTPUT, '');

  require('./parse-all.js');
  delete require.cache[require.resolve('./parse-all.js')];

  const inventory = JSON.parse(fs.readFileSync(path.join(tempDir, '.canary-inventory.json')));
  assert(inventory.dependencies.length === 2, 'Parsed composer.lock dependencies');
  assert(inventory.dependencies.some((d) => d.dev), 'Composer dev dependency marked');

  cleanup(tempDir);
}

// Test packages.lock.json parser
console.log('\n=== Testing packages.lock.json ===');
{
  const tempDir = createTempDir();
  const nugetPath = path.join(tempDir, 'packages.lock.json');
  fs.writeFileSync(nugetPath, JSON.stringify(FIXTURES.nuget, null, 2));

  process.env.LOCKFILES = `nuget:${nugetPath}`;
  process.env.PROJECT_ID = 'test-nuget';
  process.env.INCLUDE_DEV = 'true';
  process.env.WORKING_DIR = tempDir;
  process.env.GITHUB_OUTPUT = path.join(tempDir, 'output');
  fs.writeFileSync(process.env.GITHUB_OUTPUT, '');

  require('./parse-all.js');
  delete require.cache[require.resolve('./parse-all.js')];

  const inventory = JSON.parse(fs.readFileSync(path.join(tempDir, '.canary-inventory.json')));
  assert(inventory.dependencies.length === 2, 'Parsed NuGet lock dependencies');
  assert(inventory.dependencies[0].ecosystem === 'nuget', 'NuGet ecosystem set');

  cleanup(tempDir);
}

// Test pom.xml parser
console.log('\n=== Testing pom.xml ===');
{
  const tempDir = createTempDir();
  const pomPath = path.join(tempDir, 'pom.xml');
  fs.writeFileSync(pomPath, FIXTURES.pom);

  process.env.LOCKFILES = `maven:${pomPath}`;
  process.env.PROJECT_ID = 'test-maven';
  process.env.INCLUDE_DEV = 'false';
  process.env.WORKING_DIR = tempDir;
  process.env.GITHUB_OUTPUT = path.join(tempDir, 'output');
  fs.writeFileSync(process.env.GITHUB_OUTPUT, '');

  require('./parse-all.js');
  delete require.cache[require.resolve('./parse-all.js')];

  const inventory = JSON.parse(fs.readFileSync(path.join(tempDir, '.canary-inventory.json')));
  assert(inventory.dependencies.length === 1, 'Parsed Maven dependencies (excluding test scope)');
  assert(inventory.dependencies[0].name === 'org.apache.commons:commons-lang3', 'Maven coordinate parsed');

  cleanup(tempDir);
}

// Summary
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);

# Canary Dependency Scan Action

A GitHub Action that parses dependency lockfiles and submits inventory to a [Canary Worker](https://github.com/pollychrome/canary) for vulnerability scanning.

## Supported Lockfiles

| Ecosystem | File |
|-----------|------|
| npm | `package-lock.json` (v1, v2, v3) |
| PyPI | `requirements.txt`, `poetry.lock` |
| Go | `go.sum`, `go.mod` |
| RubyGems | `Gemfile.lock` |
| Cargo | `Cargo.lock` |
| Composer | `composer.lock` |
| NuGet | `packages.lock.json` |
| Maven | `pom.xml` |

## Quick Start

```yaml
name: Canary Scan

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 6 * * *'

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Canary Vulnerability Scan
        uses: pollychrome/canary-action@v1
        with:
          auth_token: ${{ secrets.CANARY_AUTH_TOKEN }}
          worker_url: ${{ secrets.CANARY_WORKER_URL }}
          project_id: 'your-project-id'
```

## Setup

The easiest way to set up Canary scanning is with the CLI:

```bash
npx canary-cli
```

This will register your project, write the workflow file, and set GitHub secrets automatically.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `auth_token` | Yes | — | Authentication token for the Canary Worker API |
| `worker_url` | Yes | — | Canary Worker URL (e.g., `https://canary.your-domain.workers.dev`) |
| `project_id` | Yes | — | Project identifier for grouping scans |
| `include_dev` | No | `true` | Include development dependencies in scan |
| `working_directory` | No | `.` | Directory to scan for lockfiles |
| `fail_on_error` | No | `true` | Fail the job if submission to the Worker fails |

## Outputs

| Output | Description |
|--------|-------------|
| `packages_count` | Number of packages discovered |
| `status` | Submission status (`success` or `failed`) |
| `lockfiles_found` | Comma-separated list of lockfiles discovered |

## How It Works

1. **Discover** — Searches the repository for supported lockfiles
2. **Parse** — Extracts dependency names and versions from each lockfile
3. **Submit** — POSTs the dependency inventory to your Canary Worker for vulnerability analysis

The Worker compares your dependencies against known vulnerability databases and can notify you via Slack when issues are found.

## Examples

### Scan a subdirectory

```yaml
- uses: pollychrome/canary-action@v1
  with:
    auth_token: ${{ secrets.CANARY_AUTH_TOKEN }}
    worker_url: ${{ secrets.CANARY_WORKER_URL }}
    project_id: 'my-project'
    working_directory: './packages/api'
```

### Exclude dev dependencies

```yaml
- uses: pollychrome/canary-action@v1
  with:
    auth_token: ${{ secrets.CANARY_AUTH_TOKEN }}
    worker_url: ${{ secrets.CANARY_WORKER_URL }}
    project_id: 'my-project'
    include_dev: 'false'
```

### Continue on failure

```yaml
- uses: pollychrome/canary-action@v1
  with:
    auth_token: ${{ secrets.CANARY_AUTH_TOKEN }}
    worker_url: ${{ secrets.CANARY_WORKER_URL }}
    project_id: 'my-project'
    fail_on_error: 'false'
```

## License

MIT

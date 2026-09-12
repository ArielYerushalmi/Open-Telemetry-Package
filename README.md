# @panther/OpenTelemetry

Shared OpenTelemetry wiring for Panther Node services. Exports traces, metrics, and logs via OTLP to a Grafana Alloy collector, which fans out to Tempo (traces), Loki (logs), and Mimir (metrics).

## Install

This package is not published to a registry — install it directly from GitHub:

```bash
npm install github:ArielYerushalmi/Open-Telemetry-Package
```

Or pin to a specific commit/tag:

```bash
npm install github:ArielYerushalmi/Open-Telemetry-Package#<commit-or-tag>
```

`npm install` runs the package's `prepare` script automatically, which compiles TypeScript to `dist/`.

## Usage

Call `initOpenTelemetry` as the very first thing your service does, before any other imports that should be instrumented (e.g. in a `tracing.ts` imported first in `main.ts`):

```ts
import { initOpenTelemetry } from '@panther/OpenTelemetry';

initOpenTelemetry({
  serviceName: 'AuthService',
  environment: 'development',
  alloyUrl: 'http://localhost:4318',
  version: '1.0.0',
  traceSampleRatio: 1.0,
});
```

### Config

| Field | Required | Description |
|---|---|---|
| `serviceName` | yes | Reported as the `service.name` resource attribute. |
| `environment` | yes | `development` \| `staging` \| `production`. |
| `alloyUrl` | yes | Base URL of the Alloy OTLP HTTP receiver (e.g. `http://localhost:4318`). |
| `version` | no | Reported as `service.version`. Defaults to `1.0.0`. |
| `traceSampleRatio` | no | Fraction of root spans to sample, `0.0`-`1.0`. Defaults to `1.0`. |

Traces, metrics, and logs are always shipped via OTLP to Alloy — spans are never printed to the terminal. Host metrics (CPU, memory, network) are collected automatically. The SDK shuts down gracefully on `SIGTERM`/`SIGINT`.

## Backend stack

`stack/` contains a Docker Compose setup for the observability backend (Alloy, Loki, Mimir, Tempo, Grafana):

```bash
cd stack
docker compose up -d
```

- Grafana: http://localhost:3030 (default admin/admin - change in production)
- Alloy UI: http://localhost:12345
- Alloy OTLP HTTP receiver: http://localhost:4318

# @panther/OpenTelemetry

Shared OpenTelemetry setup for Panther Node.js / TypeScript services. Wires up traces, metrics, and logs, and ships them via OTLP to a Grafana Alloy collector (→ Tempo / Loki / Mimir).

## Install

```bash
npm install @panther/OpenTelemetry
```

## Usage

```ts
import { initOpenTelemetry, shutdownOpenTelemetry } from '@panther/OpenTelemetry';

initOpenTelemetry({
  serviceName: 'my-service',
  environment: 'production', // 'development' | 'staging' | 'production'
  alloyUrl: 'http://localhost:4318',
});

// on shutdown (or let the built-in SIGTERM/SIGINT handlers do it for you)
await shutdownOpenTelemetry();
```

> Call `initOpenTelemetry()` as early as possible (before importing the modules you want traced), and only once per process.

### Config options

| Option              | Required | Description                                     |
|---------------------|----------|--------------------------------------------------|
| `serviceName`        | yes      | Used as `service.name`.                          |
| `environment`         | yes      | `development` \| `staging` \| `production`.      |
| `alloyUrl`            | yes      | Base URL of the Alloy OTLP/HTTP receiver.        |
| `version`             | no       | Used as `service.version`.                        |
| `traceSampleRatio`    | no       | Fraction of root spans sampled, `0.0`–`1.0`.      |

## Local testing

The `stack/` folder has a Docker Compose setup (Alloy + Tempo + Mimir + Loki + Grafana) for testing end-to-end without a real backend. `src/test.ts` is a smoke test that generates sample traces, metrics, and logs against it.

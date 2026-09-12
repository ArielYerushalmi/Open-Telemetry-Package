# @panther/OpenTelemetry

Shared OpenTelemetry setup for Panther Node.js / TypeScript services. Wires up traces, metrics, and logs, and ships them via OTLP/HTTP to a Grafana Alloy collector (→ Tempo / Loki / Mimir), using the same resource-attribute conventions (`service.name`, `service.version`, `deployment.environment.name`) as the [.NET counterpart](https://github.com/ArielYerushalmi/Panther.OpenTelemetry.DotNet).

## Install

```bash
npm install @panther/OpenTelemetry
```

Internal builds are published to the Panther Nexus npm registry (`https://nexus.pituah.iaf/repository/npm/`) via `publish-to-nexus.bat`, which requires `NEXUS_USERNAME` and `NEXUS_PASSWORD` to be set in the environment.

## What it sets up

`initOpenTelemetry()` configures a `NodeSDK` with:

- **Traces** — OTLP HTTP export to `{alloyUrl}/v1/traces`, batched via `BatchSpanProcessor`, sampled with a `ParentBasedSampler` / `TraceIdRatioBasedSampler`.
- **Metrics** — OTLP HTTP export to `{alloyUrl}/v1/metrics` on a `PeriodicExportingMetricReader`, cumulative temporality.
- **Logs** — OTLP HTTP export to `{alloyUrl}/v1/logs` via `BatchLogRecordProcessor`. Logs emitted inside an active span are automatically stamped with that span's trace/span IDs.
- **Auto-instrumentation** — `getNodeAutoInstrumentations()` (filesystem instrumentation disabled).
- **Host metrics** — CPU, memory, and network via `HostMetrics`, reusing the same meter provider/exporter pipeline.
- **Graceful shutdown** — flushes on `SIGTERM`/`SIGINT`, with a 5s timeout before forcing exit.

Nothing is ever printed to the console for telemetry data — everything ships via OTLP to Alloy.

## Usage

```ts
import { initOpenTelemetry, shutdownOpenTelemetry } from '@panther/OpenTelemetry';

initOpenTelemetry({
  serviceName: 'my-service',
  environment: 'production', // 'development' | 'staging' | 'production'
  alloyUrl: 'http://localhost:4318',
  version: '1.2.0',          // optional, defaults to '1.0.0'
  traceSampleRatio: 1.0,     // optional, defaults to 1.0 (sample everything)
});

// on shutdown (or let the built-in SIGTERM/SIGINT handlers do it for you)
await shutdownOpenTelemetry();
```

> **Important:** call `initOpenTelemetry()` before importing anything you want auto-instrumented (e.g. at the very top of your entrypoint, or via `--require`), otherwise those modules will already be loaded uninstrumented. It also throws if called a second time in the same process.

### Config options (`OtelConfig`)

| Option              | Type                                            | Required | Description                                        |
|---------------------|--------------------------------------------------|----------|----------------------------------------------------|
| `serviceName`        | `string`                                         | yes      | Used as `service.name`.                             |
| `environment`         | `'development' \| 'staging' \| 'production'`     | yes      | Used as `deployment.environment.name`.              |
| `alloyUrl`            | `string`                                         | yes      | Base URL of the Alloy OTLP/HTTP receiver.           |
| `version`             | `string`                                         | no       | Used as `service.version`. Defaults to `'1.0.0'`.   |
| `traceSampleRatio`    | `number`                                         | no       | Fraction of root spans sampled, `0.0`–`1.0`. Defaults to `1.0`.|

### API

- `initOpenTelemetry(config: OtelConfig): NodeSDK` — starts the SDK, registers shutdown handlers, returns the `NodeSDK` instance.
- `getOpenTelemetryInstance(): NodeSDK | null` — returns the running SDK instance, if any.
- `shutdownOpenTelemetry(): Promise<void>` — flushes and shuts down the SDK.

## Local dev stack

The `stack/` directory has a Docker Compose setup (Alloy + Tempo + Mimir + Loki + Grafana provisioning) for exercising this package end-to-end without a real backend:

```bash
docker compose -f stack/docker-compose.yml up
```

Point `alloyUrl` at the Alloy endpoint it exposes, then run the smoke test in `src/test.ts` to generate sample traces, metrics, and logs:

```bash
npx tsc && node dist/test.js
```

## Development

```bash
npm install
npm run build   # compiles src/ -> dist/ via tsc
```

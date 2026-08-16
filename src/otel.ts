import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { AggregationTemporalityPreference, OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION, ATTR_DEPLOYMENT_ENVIRONMENT_NAME } from '@opentelemetry/semantic-conventions';
import { OtelConfig } from './config'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { BatchSpanProcessor, ConsoleSpanExporter, ParentBasedSampler, SimpleSpanProcessor, SpanProcessor, TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { diag, DiagConsoleLogger, DiagLogLevel, metrics } from '@opentelemetry/api';
import { HostMetrics } from '@opentelemetry/host-metrics';

const EXPORT_TIMEOUT_MS = 5_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;

let sdkInstance: NodeSDK | null = null;

export function initOpenTelemetry(config: OtelConfig): NodeSDK {
    if (sdkInstance) {
        // Fail loudly instead of silently registering a second SDK / signal handlers.
        throw new Error('OpenTelemetry has already been initialized.');
    }

    // Validate required configuration
    if (!config.serviceName) {
        throw new Error('serviceName is required in OpenTelemetry configuration');
    }

    if (!config.alloyUrl) {
        throw new Error('alloyUrl is required in OpenTelemetry configuration');
    }

    // Without this, failed exports/dropped spans are swallowed with no visibility.
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

    const appResource = resourceFromAttributes({
        [ATTR_SERVICE_NAME]: config.serviceName,
        [ATTR_SERVICE_VERSION]: config.version || '1.0.0',
        [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: config.environment,
    });

    const traceExporter = new OTLPTraceExporter({
        url: `${config.alloyUrl}/v1/traces`,
        timeoutMillis: EXPORT_TIMEOUT_MS,
    });

    // Batch is the only processor on the hot path; Simple/Console is dev-only
    // and never touches the network exporter.
    const spanProcessors: SpanProcessor[] = [new BatchSpanProcessor(traceExporter)];

    // Add console exporter only in development mode
    if (config.environment === 'development') {
        spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
    }

    const sdk = new NodeSDK({
        resource: appResource,

        //  ---------- Traces ----------
        // NOTE: NodeSDK silently drops `traceExporter` whenever `spanProcessors` is
        // also set, so only spanProcessors is passed here.
        spanProcessors: spanProcessors,
        sampler: new ParentBasedSampler({
            root: new TraceIdRatioBasedSampler(config.traceSampleRatio ?? 1.0),
        }),

        //  ---------- Metrics ----------
        metricReaders: [
            new PeriodicExportingMetricReader({
                exporter: new OTLPMetricExporter({
                    url: `${config.alloyUrl}/v1/metrics`,
                    timeoutMillis: EXPORT_TIMEOUT_MS,
                    temporalityPreference: AggregationTemporalityPreference.CUMULATIVE,
                }),
            })
        ],

        //  ---------- Logs ----------
        logRecordProcessors: [
            new BatchLogRecordProcessor({
                exporter: new OTLPLogExporter({
                    url: `${config.alloyUrl}/v1/logs`,
                    timeoutMillis: EXPORT_TIMEOUT_MS,
                }),
            }),
        ],
        instrumentations: [
            getNodeAutoInstrumentations({
                '@opentelemetry/instrumentation-fs': { enabled: false },
            }),
        ],
    });

    // Store instance for shutdown
    sdkInstance = sdk;

    // ---------- Startup ----------
    try {
        sdk.start();
        console.log(`[OTEL] Telemetry active for [${config.environment}]`);
    } catch (error) {
        console.error('[OTEL] Error starting SDK', error)
        sdkInstance = null;
        throw error;
    }

    // ---------- Process-level metrics (CPU, memory, network) ----------
    // Reuses the meter provider NodeSDK just registered globally, so these
    // ride the same OTLP metric exporter/pipeline configured above.
    new HostMetrics({
        meterProvider: metrics.getMeterProvider(),
        name: config.serviceName,
    }).start();

    // ---------- Shutdown ----------
    const handleShutdown = () => {
        const timeout = new Promise<void>((resolve) =>
            setTimeout(() => {
                console.error('[OTEL] Shutdown timed out, forcing exit');
                resolve();
            }, SHUTDOWN_TIMEOUT_MS),
        );
        Promise.race([
            sdk.shutdown().then(() => console.log('[OTEL] SDK shut down')),
            timeout,
        ])
            .catch((err) => console.error('[OTEL] Error shutting down SDK', err))
            .finally(() => process.exit(0));
    };

    process.on('SIGTERM', handleShutdown);
    process.on('SIGINT', handleShutdown);

    return sdk;
}

export function getOpenTelemetryInstance(): NodeSDK | null {
    return sdkInstance;
}

export function shutdownOpenTelemetry(): Promise<void> {
    if (sdkInstance) {
        return sdkInstance.shutdown()
            .then(() => console.log('[OTEL] SDK shut down'))
            .catch(err => console.error('[OTEL] Error shutting down SDK', err));
    }
    return Promise.resolve();
}
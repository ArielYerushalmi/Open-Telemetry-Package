import { metrics, SpanStatusCode, trace } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { initOpenTelemetry, shutdownOpenTelemetry } from './otel';

const SERVICE_NAME = 'smoke-test-service';
const TEST_DURATION_MS = 12_000;
const REQUEST_INTERVAL_MS = 500;
const SLOW_REQUEST_THRESHOLD_S = 0.08;

initOpenTelemetry({
    serviceName: SERVICE_NAME,
    environment: 'development',
    alloyUrl: 'http://localhost:4318',
});

const tracer = trace.getTracer('smoke-test-tracer');
const meter = metrics.getMeter('smoke-test-meter');
const logger = logs.getLogger('smoke-test-logger');

const requestCounter = meter.createCounter('http_requests_total', {
    description: 'Total number of simulated HTTP requests',
});
const requestDuration = meter.createHistogram('http_request_duration_seconds', {
    description: 'Duration of simulated HTTP requests',
    unit: 's',
});

function emitLog(
    severityText: 'INFO' | 'WARN' | 'ERROR',
    severityNumber: SeverityNumber,
    body: string,
    attributes: Record<string, string | number> = {},
) {
    // No explicit `context` is passed, so the Logger defaults to `context.active()` -
    // if a span is active here, its trace/span IDs are stamped onto the record for free.
    logger.emit({ severityText, severityNumber, body, attributes });
}

async function simulateDbQuery(shouldFail: boolean): Promise<void> {
    return tracer.startActiveSpan('db-query', async (span) => {
        try {
            span.setAttribute('db.system', 'postgresql');
            span.setAttribute('db.statement', 'SELECT * FROM users WHERE id = $1');
            await new Promise((resolve) => setTimeout(resolve, 30 + Math.random() * 40));

            if (shouldFail) {
                throw new Error('connection terminated unexpectedly');
            }
            span.setStatus({ code: SpanStatusCode.OK });
        } catch (err) {
            const error = err as Error;
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
            throw error;
        } finally {
            span.end();
        }
    });
}

async function simulateBackgroundNotification(): Promise<void> {
    // Deliberately kicked off without being awaited by the caller before it moves on to
    // the DB query, to model fire-and-forget async work (e.g. a queue publish) that still
    // nests under the parent span's context so it shows up as a child in Tempo.
    return tracer.startActiveSpan('background-event-notification', async (span) => {
        try {
            span.setAttribute('messaging.system', 'internal-queue');
            span.setAttribute('messaging.destination', 'user.notifications');
            await new Promise((resolve) => setImmediate(resolve));
            await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 15));
            span.setStatus({ code: SpanStatusCode.OK });
        } finally {
            span.end();
        }
    });
}

async function handleRequest(requestId: number, shouldFail: boolean): Promise<void> {
    await tracer.startActiveSpan('http-request', async (span) => {
        const start = process.hrtime.bigint();
        span.setAttribute('http.method', 'GET');
        span.setAttribute('http.route', '/api/users/:id');
        span.setAttribute('request.id', requestId);

        emitLog('INFO', SeverityNumber.INFO, `Handling request ${requestId}`, { 'request.id': requestId });

        const backgroundWork = simulateBackgroundNotification();

        let statusCode = 200;
        try {
            await simulateDbQuery(shouldFail);
        } catch (err) {
            statusCode = 500;
            const error = err as Error;
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
            emitLog('ERROR', SeverityNumber.ERROR, `Request ${requestId} failed: ${error.message}`, {
                'request.id': requestId,
                'error.type': error.name,
            });
        }

        await backgroundWork;

        if (statusCode === 200) {
            span.setStatus({ code: SpanStatusCode.OK });
        }

        const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
        span.setAttribute('http.status_code', statusCode);

        const metricAttributes = {
            'http.method': 'GET',
            'http.route': '/api/users/:id',
            'http.status_code': statusCode,
        };
        requestCounter.add(1, metricAttributes);
        requestDuration.record(durationSeconds, metricAttributes);

        if (durationSeconds > SLOW_REQUEST_THRESHOLD_S) {
            emitLog('WARN', SeverityNumber.WARN, `Request ${requestId} took ${durationSeconds.toFixed(3)}s`, {
                'request.id': requestId,
            });
        }

        span.end();
    });
}

async function runSmokeTest(): Promise<void> {
    console.log(`[SMOKE TEST] Generating traffic for ~${TEST_DURATION_MS / 1000}s...`);
    const start = Date.now();
    let requestId = 0;

    while (Date.now() - start < TEST_DURATION_MS) {
        requestId += 1;
        const shouldFail = requestId % 4 === 0; // every 4th request intentionally fails
        await handleRequest(requestId, shouldFail);
        await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS));
    }

    console.log(`[SMOKE TEST] Sent ${requestId} requests. Flushing and shutting down...`);
    await shutdownOpenTelemetry();
    console.log('[SMOKE TEST] Done.');
}

runSmokeTest().catch((err) => {
    console.error('[SMOKE TEST] Unhandled error', err);
    process.exit(1);
});

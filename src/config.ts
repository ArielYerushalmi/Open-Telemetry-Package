type Environment = 'development' | 'staging' | 'production';

interface OtelConfig {
    serviceName: string;
    environment: Environment;
    alloyUrl: string;
    version?: string;
    /** Fraction of root spans to sample, 0.0-1.0. Defaults to 1.0 (sample everything). */
    traceSampleRatio?: number;
}

export { OtelConfig, Environment };

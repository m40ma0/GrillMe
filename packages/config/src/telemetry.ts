import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

let sdk: NodeSDK | null = null;

/**
 * Starts tracing when OTEL_EXPORTER_OTLP_ENDPOINT is set (any OTLP/HTTP collector, e.g. Jaeger or Honeycomb).
 * Model calls are traced by @stage-ready/ai with prompt version, model ID, latency, tokens and cost.
 */
export async function startTelemetry(serviceName: string): Promise<boolean> {
  if (sdk || !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return false;
  process.env.OTEL_SERVICE_NAME ??= serviceName;
  sdk = new NodeSDK({ traceExporter: new OTLPTraceExporter() });
  sdk.start();
  process.once("beforeExit", () => void sdk?.shutdown());
  return true;
}

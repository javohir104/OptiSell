import type {
  ApiError,
  ApiResponse,
  BatchForecastRequest,
  BatchForecastResult,
  ForecastRequest,
  ForecastResult,
} from "./types";

const API_BASE = (import.meta.env.VITE_AI_API_BASE as string | undefined) ?? "";
const PREFIX = "/api/v1/ai";

export class AiServiceError extends Error {
  readonly code: string;
  readonly details: ApiError["details"];
  readonly requestId: string | null;

  constructor(error: ApiError, requestId: string | null) {
    super(error.message);
    this.name = "AiServiceError";
    this.code = error.code;
    this.details = error.details;
    this.requestId = requestId;
  }
}

const post = async <T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${PREFIX}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new AiServiceError(
      { code: "NETWORK_ERROR", message: "AI xizmatiga ulanib bo'lmadi.", details: null },
      null,
    );
  }

  let envelope: ApiResponse<T>;
  try {
    envelope = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new AiServiceError(
      { code: "BAD_RESPONSE", message: `Kutilmagan javob (HTTP ${res.status}).`, details: null },
      null,
    );
  }

  if (!envelope.success) throw new AiServiceError(envelope.error, envelope.meta?.request_id ?? null);
  return envelope.data;
};

export const forecastProduct = (req: ForecastRequest, signal?: AbortSignal) =>
  post<ForecastResult>("/forecast", req, signal);

export const forecastBatch = (req: BatchForecastRequest, signal?: AbortSignal) =>
  post<BatchForecastResult>("/forecast/batch", req, signal);

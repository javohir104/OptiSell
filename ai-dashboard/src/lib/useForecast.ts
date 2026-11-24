import { useCallback, useEffect, useRef, useState } from "react";
import { AiServiceError, forecastProduct } from "../api/client";
import type { ForecastRequest, ForecastResult } from "../api/types";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; result: ForecastResult }
  | { kind: "error"; error: AiServiceError };

export const useForecast = () => {
  const [state, setState] = useState<State>({ kind: "idle" });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const run = useCallback(async (req: ForecastRequest) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ kind: "loading" });
    try {
      const result = await forecastProduct(req, controller.signal);
      setState({ kind: "success", result });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const error =
        err instanceof AiServiceError
          ? err
          : new AiServiceError({ code: "UNKNOWN", message: String(err), details: null }, null);
      setState({ kind: "error", error });
    }
  }, []);

  return { state, run };
};

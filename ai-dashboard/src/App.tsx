import { ForecastCard } from "./components/ForecastCard";
import { ForecastForm } from "./components/ForecastForm";
import { useForecast } from "./lib/useForecast";

export const App = () => {
  const { state, run } = useForecast();

  return (
    <main className="layout">
      <header className="page-header">
        <h1>OptiSell AI — Sotuv prognozi</h1>
        <p className="muted">Prognoz faqat siz kiritgan haqiqiy sotuv tarixi asosida hisoblanadi.</p>
      </header>

      <ForecastForm loading={state.kind === "loading"} onSubmit={run} />

      {state.kind === "error" && (
        <section className="panel error-panel" role="alert">
          <strong>{state.error.code}</strong>: {state.error.message}
          {Array.isArray(state.error.details) && (
            <ul>
              {state.error.details.map((d, i) => (
                <li key={i}>{typeof d === "object" && d && "field" in d ? `${d.field}: ${d.message}` : String(d)}</li>
              ))}
            </ul>
          )}
          {state.error.requestId && <p className="muted">request_id: {state.error.requestId}</p>}
        </section>
      )}

      {state.kind === "success" && <ForecastCard result={state.result} />}
    </main>
  );
};

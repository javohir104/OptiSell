import { useState, type ChangeEvent, type FormEvent } from "react";
import type { ForecastRequest } from "../api/types";
import { parseSalesCsv, todayIso } from "../lib/csv";

type Props = { loading: boolean; onSubmit: (req: ForecastRequest) => void };

export const ForecastForm = ({ loading, onSubmit }: Props) => {
  const [productId, setProductId] = useState("");
  const [productName, setProductName] = useState("");
  const [horizon, setHorizon] = useState(7);
  const [asOf, setAsOf] = useState(todayIso());
  const [csv, setCsv] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setCsv(await file.text());
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const { records, errors: parseErrors } = parseSalesCsv(csv);
    if (parseErrors.length > 0) {
      setErrors(parseErrors.slice(0, 5));
      return;
    }
    setErrors([]);
    onSubmit({
      product_id: productId.trim(),
      product_name: productName.trim(),
      horizon_days: horizon,
      as_of_date: asOf || undefined,
      sales_history: records,
    });
  };

  return (
    <form className="panel form" onSubmit={handleSubmit}>
      <h2>Mahsulot ma'lumotlari</h2>
      <div className="row">
        <label>
          Mahsulot ID
          <input required maxLength={64} value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="sku-001" />
        </label>
        <label>
          Nomi
          <input required maxLength={255} value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Coca-Cola 1L" />
        </label>
      </div>
      <div className="row">
        <label>
          Prognoz muddati (kun)
          <input type="number" min={1} max={90} value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} />
        </label>
        <label>
          Hisoblash sanasi
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </label>
      </div>
      <label>
        Sotuv tarixi (CSV: <code>date,quantity</code>)
        <textarea
          rows={8}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={"date,quantity\n2026-10-01,14\n2026-10-02,17"}
        />
      </label>
      <label className="file">
        yoki fayl yuklang
        <input type="file" accept=".csv,.txt" onChange={handleFile} />
      </label>
      {errors.length > 0 && (
        <ul className="errors">
          {errors.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      <button type="submit" disabled={loading}>
        {loading ? "Hisoblanmoqda…" : "Prognoz qilish"}
      </button>
    </form>
  );
};

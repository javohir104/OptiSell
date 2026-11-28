import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileUp, History, UploadCloud, X, XCircle } from 'lucide-react';
import { ACCEPTED_EXT, IMPORT_TYPES, MAX_IMPORT_BYTES, importApi } from '../api/import.api';
import { getErrorMessage } from '../api/axios';
import { useApi } from '../hooks/useApi';
import { useI18n } from '../i18n';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, TableSkeleton } from '../components/common/ui';
import { downloadText, toCsv } from '../utils/csv';
import { parseSpreadsheet } from '../utils/xlsx';
import { formatDateTime, formatNumber } from '../utils/format';
import { cn } from '../utils/cn';

const STATUS = {
  completed: { label: 'imp.completed', tone: 'success', icon: CheckCircle2 },
  partial: { label: 'imp.partial', tone: 'warning', icon: AlertTriangle },
  failed: { label: 'imp.failed', tone: 'danger', icon: XCircle },
};
const ext = (name) => (name.match(/\.[^.]+$/)?.[0] || '').toLowerCase();
const formatBytes = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);

function downloadTemplate(type) {
  const ty = IMPORT_TYPES[type];
  const headers = [...ty.required, ...ty.optional];
  downloadText(`optisell-${type}-template.csv`, toCsv(headers, [ty.sample]));
}

function downloadErrorReport(result) {
  downloadText(`import-${result.id}-errors.csv`, toCsv(['row', 'field', 'message'], result.errors || []));
}

function ResultPanel({ result, onClose }) {
  const { t } = useI18n();
  const meta = STATUS[result.status] || STATUS.failed;
  const errors = result.errors || [];
  const typeLabel = IMPORT_TYPES[result.type] ? t(IMPORT_TYPES[result.type].label) : result.type;
  return (
    <Card className="mb-6 overflow-hidden" role="status">
      <CardHeader title={<span className="flex items-center gap-2">{t('imp.result')} <Badge tone={meta.tone} icon={meta.icon}>{t(meta.label)}</Badge></span>}
        subtitle={`${result.fileName} · ${typeLabel} · ${formatDateTime(result.createdAt)}`}
        action={<Button variant="ghost" size="icon" onClick={onClose} aria-label={t('imp.dismiss')}><X className="h-4 w-4" /></Button>} />
      <div className="grid grid-cols-3 gap-3 p-5">
        {[['imp.rowsInFile', result.totalRows, ''], ['imp.imported', result.imported, 'text-emerald-600 dark:text-emerald-400'], ['imp.rowsWithErrors', result.failed, result.failed ? 'text-red-600 dark:text-red-400' : '']].map(([l, v, cls]) => (
          <div key={l} className="rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
            <p className={cn('num text-xl font-semibold', cls)}>{formatNumber(v ?? 0)}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{t(l)}</p>
          </div>
        ))}
      </div>
      {errors.length > 0 && (
        <div className="border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center justify-between px-5 py-3">
            <p className="text-sm font-medium">{t('imp.validationErrors')} <span className="text-zinc-400">({errors.length})</span></p>
            <Button variant="secondary" size="sm" icon={Download} onClick={() => downloadErrorReport(result)}>{t('imp.downloadReport')}</Button>
          </div>
          <div className="table-wrap max-h-72 overflow-y-auto">
            <table className="table">
              <thead className="sticky top-0"><tr><th className="w-20">{t('th.row')}</th><th className="w-36">{t('th.field')}</th><th>{t('th.problem')}</th></tr></thead>
              <tbody>
                {errors.slice(0, 200).map((e, i) => (
                  <tr key={i}><td className="num">{e.row ?? '—'}</td><td className="font-mono text-xs">{e.field || '—'}</td><td className="whitespace-normal">{e.message}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {errors.length > 200 && <p className="px-5 py-2 text-xs text-zinc-500">{t('imp.first200')}</p>}
        </div>
      )}
    </Card>
  );
}

export default function ImportPage() {
  const { t } = useI18n();
  const [type, setType] = useState('products');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [fileError, setFileError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);
  const history = useApi(() => importApi.history({ limit: 20 }), []);
  const spec = IMPORT_TYPES[type];

  const reset = () => { setFile(null); setPreview(null); setFileError(''); setProgress(null); if (inputRef.current) inputRef.current.value = ''; };

  const pick = async (f) => {
    reset();
    if (!f) return;
    if (!ACCEPTED_EXT.includes(ext(f.name))) return setFileError(t('imp.notSupported', { name: f.name, ext: ACCEPTED_EXT.join(', ') }));
    if (f.size > MAX_IMPORT_BYTES) return setFileError(t('imp.tooLarge', { size: formatBytes(f.size), limit: formatBytes(MAX_IMPORT_BYTES) }));
    if (f.size === 0) return setFileError(t('imp.empty'));
    setFile(f);
    try {
      setPreview(await parseSpreadsheet(f));
    } catch (e) {
      setPreview(null);
      setFile(null);
      setFileError(e.message || t('imp.uploadFailed'));
    }
  };

  const missing = preview ? spec.required.filter((h) => !preview.headers.includes(h)) : [];
  const unknown = preview ? preview.headers.filter((h) => h && ![...spec.required, ...spec.optional].includes(h)) : [];

  const upload = async () => {
    if (!file) return;
    setProgress(0); setResult(null);
    try {
      const res = await importApi.upload(type, file, setProgress);
      setResult(res);
      history.setData((h) => [res, ...(h || []).filter((x) => x.id !== res.id)]);
      if (res.status === 'completed') toast.success(t('imp.toastImported', { n: res.imported }));
      else if (res.status === 'partial') toast(t('imp.toastPartial', { n: res.imported, total: res.totalRows }), { icon: '⚠️' });
      else toast.error(t('imp.toastFailed'));
      reset();
    } catch (e) {
      setProgress(null);
      toast.error(getErrorMessage(e, t('imp.uploadFailed')));
      setFileError(getErrorMessage(e, t('imp.uploadFailed')));
    }
  };

  const uploading = progress != null;

  return (
    <>
      <PageHeader title={t('imp.title')} description={t('imp.desc')} />

      {result && <ResultPanel result={result} onClose={() => setResult(null)} />}

      <div className="mb-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t('imp.upload')} subtitle={t('imp.steps')} />
          <div className="space-y-4 p-5">
            <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-900" role="group" aria-label={t('imp.typeA11y')}>
              {Object.entries(IMPORT_TYPES).map(([k, ty]) => (
                <button key={k} type="button" disabled={uploading} aria-pressed={type === k} onClick={() => { setType(k); }}
                  className={cn('h-8 rounded-md px-4 text-sm font-medium transition-colors', type === k ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400')}>
                  {t(ty.label)}
                </button>
              ))}
            </div>

            <label
              htmlFor="import-file"
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); if (!uploading) pick(e.dataTransfer.files?.[0]); }}
              className={cn('flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
                dragging ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-500/10' : 'border-zinc-200 hover:border-brand-400 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/40',
                uploading && 'pointer-events-none opacity-60')}
            >
              <span className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400"><UploadCloud className="h-6 w-6" /></span>
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t('imp.drop')} <span className="text-brand-600 dark:text-brand-400">{t('imp.browse')}</span></span>
              <span className="mt-1 text-xs text-zinc-500">{t('imp.formats', { size: formatBytes(MAX_IMPORT_BYTES) })}</span>
              <input ref={inputRef} id="import-file" type="file" className="sr-only" accept={`${ACCEPTED_EXT.join(',')},text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel`}
                onChange={(e) => pick(e.target.files?.[0])} disabled={uploading} />
            </label>

            {fileError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400" role="alert">{fileError}</p>}

            {file && (
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-3 p-4">
                  <FileSpreadsheet className="h-8 w-8 shrink-0 text-brand-600 dark:text-brand-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-zinc-500">{formatBytes(file.size)} · {preview ? t('imp.rowsCols', { rows: formatNumber(preview.rows.length), cols: preview.headers.length }) : t('imp.excelServer')}</p>
                  </div>
                  {!uploading && <Button variant="ghost" size="icon" onClick={reset} aria-label={t('imp.removeFile')}><X className="h-4 w-4" /></Button>}
                </div>
                {uploading && (
                  <div className="px-4 pb-4">
                    <div className="mb-1 flex justify-between text-xs text-zinc-500"><span>{progress < 100 ? t('imp.uploading') : t('imp.processing')}</span><span className="num">{progress}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-brand-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                )}
                {preview && (missing.length > 0 || unknown.length > 0) && (
                  <div className="space-y-1 border-t border-zinc-100 px-4 py-3 text-sm dark:border-zinc-800">
                    {missing.length > 0 && <p className="text-red-600 dark:text-red-400"><XCircle className="mr-1 inline h-4 w-4" />{t('imp.missing')} <b>{missing.join(', ')}</b></p>}
                    {unknown.length > 0 && <p className="text-amber-700 dark:text-amber-400"><AlertTriangle className="mr-1 inline h-4 w-4" />{t('imp.ignored')} {unknown.join(', ')}</p>}
                  </div>
                )}
                {preview && preview.rows.length > 0 && (
                  <div className="table-wrap border-t border-zinc-100 dark:border-zinc-800">
                    <p className="px-4 pt-3 text-xs font-medium text-zinc-500">{t('imp.preview')}</p>
                    <table className="table mt-2">
                      <thead><tr>{preview.headers.map((h) => <th key={h} className={cn(missing.length === 0 && spec.required.includes(h) && '!text-brand-700 dark:!text-brand-400')}>{h}</th>)}</tr></thead>
                      <tbody>{preview.rows.slice(0, 5).map((r, i) => <tr key={i}>{preview.headers.map((h) => <td key={h} className="max-w-[180px] truncate">{r[h]}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                )}
                <div className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
                  <Button variant="secondary" onClick={reset} disabled={uploading}>{t('common.cancel')}</Button>
                  <Button icon={FileUp} onClick={upload} loading={uploading} disabled={missing.length > 0 || (preview && !preview.rows.length)}>
                    {t('imp.importBtn')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title={t('imp.formatTitle', { type: t(spec.label) })} subtitle={t('imp.formatSub')} />
          <div className="space-y-4 p-5 text-sm">
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">{t('imp.required')}</p>
              <div className="flex flex-wrap gap-1.5">{spec.required.map((c) => <Badge key={c} tone="success" className="font-mono">{c}</Badge>)}</div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">{t('imp.optional')}</p>
              <div className="flex flex-wrap gap-1.5">{spec.optional.map((c) => <Badge key={c} className="font-mono">{c}</Badge>)}</div>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400">{t(spec.help)}</p>
            <p className="text-xs text-zinc-500">{t('imp.moneyNote')}</p>
            <Button variant="secondary" icon={Download} className="w-full" onClick={() => downloadTemplate(type)}>{t('imp.template')}</Button>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title={t('imp.history')} subtitle={t('imp.historySub')} />
        <div className="mt-3">
          {history.loading ? <TableSkeleton rows={4} /> : history.error ? <ErrorState message={history.error} onRetry={history.reload} />
            : !history.data?.length ? <EmptyState icon={History} title={t('imp.noImports')} message={t('imp.noImportsMsg')} /> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{t('th.date')}</th><th>{t('th.file')}</th><th>{t('th.type')}</th><th>{t('th.status')}</th><th className="text-right">{t('imp.imported')}</th><th className="text-right">{t('th.errors')}</th><th /></tr></thead>
                  <tbody>
                    {history.data.map((h) => {
                      const m = STATUS[h.status] || STATUS.failed;
                      return (
                        <tr key={h.id} className="row-click" onClick={() => setResult(h)}>
                          <td className="text-zinc-500">{formatDateTime(h.createdAt)}</td>
                          <td className="max-w-[240px] truncate font-medium text-zinc-900 dark:text-zinc-100">{h.fileName}</td>
                          <td>{IMPORT_TYPES[h.type] ? t(IMPORT_TYPES[h.type].label) : h.type}</td>
                          <td><Badge tone={m.tone} icon={m.icon}>{t(m.label)}</Badge></td>
                          <td className="num text-right">{formatNumber(h.imported)} / {formatNumber(h.totalRows)}</td>
                          <td className="num text-right">{h.errors?.length || 0}</td>
                          <td className="text-right text-xs font-medium text-brand-600 dark:text-brand-400">{t('common.view')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </Card>
    </>
  );
}

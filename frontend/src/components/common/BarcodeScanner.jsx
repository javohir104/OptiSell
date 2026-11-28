import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff } from 'lucide-react';
import Modal from './Modal';
import { Button, Input } from './ui';
import { useI18n } from '../../i18n';
import { haptic } from '../../telegram';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code'];

/** Can this browser read barcodes from the camera? (Chrome / Edge / Android, Telegram on Android.) */
export const cameraScanSupported = () =>
  typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

/**
 * Camera barcode scanner. Calls onDetected(code) once and closes.
 * USB / Bluetooth scanners don't need this: they "type" the code + Enter into any focused input.
 */
export default function BarcodeScanner({ open, onClose, onDetected }) {
  const { t } = useI18n();
  const videoRef = useRef(null);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  const doneRef = useRef(onDetected);
  doneRef.current = onDetected;

  useEffect(() => {
    if (!open) return undefined;
    setError('');
    setManual('');
    if (!cameraScanSupported()) { setError(t('scan.unsupported')); return undefined; }

    let stream;
    let timer;
    let stopped = false;
    (async () => {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats?.().catch(() => FORMATS);
        const detector = new window.BarcodeDetector({ formats: FORMATS.filter((f) => !supported || supported.includes(f)) });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (stopped) return;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(video);
            const value = codes.find((c) => c.rawValue)?.rawValue;
            if (value) {
              stopped = true;
              haptic('success');
              doneRef.current(value.trim());
              return;
            }
          } catch { /* frame not ready */ }
          timer = setTimeout(tick, 180);
        };
        tick();
      } catch (err) {
        setError(err?.name === 'NotAllowedError' ? t('scan.denied') : t('scan.unsupported'));
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [open, t]);

  const submitManual = (e) => {
    e.preventDefault();
    if (manual.trim()) onDetected(manual.trim());
  };

  return (
    <Modal open={open} onClose={onClose} title={t('scan.title')} description={error ? '' : t('scan.hint')} size="sm">
      {error ? (
        <div className="mb-4 flex items-start gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <CameraOff className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      ) : (
        <div className="relative mb-4 overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 animate-pulse bg-red-500/80" />
          <Camera className="pointer-events-none absolute right-3 top-3 h-5 w-5 text-white/70" />
        </div>
      )}
      <form onSubmit={submitManual} className="flex items-end gap-2">
        <Input className="flex-1" label={t('scan.manual')} value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric" autoFocus={!!error} />
        <Button type="submit" disabled={!manual.trim()}>OK</Button>
      </form>
    </Modal>
  );
}

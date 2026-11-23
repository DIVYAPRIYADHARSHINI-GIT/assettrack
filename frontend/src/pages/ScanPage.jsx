import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Camera, CameraOff, ImageUp, ScanLine, Search } from 'lucide-react';
import { api } from '../api/client';
import { tagFromScan } from '../lib/format';
import { PageHeader, Spinner } from '../components/ui';

/** Decode a QR from an ImageData using jsQR (lazy-loaded). */
async function decode(imageData) {
  const { default: jsQR } = await import('jsqr');
  return jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' })?.data || null;
}

export default function ScanPage() {
  const { tag: routeTag } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [camError, setCamError] = useState('');
  const [manual, setManual] = useState('');
  const [resolving, setResolving] = useState(false);
  const [lastError, setLastError] = useState('');

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);
  useEffect(() => stop, [stop]);

  const open = useCallback(
    async (text) => {
      const tag = tagFromScan(text);
      if (!tag) {
        setLastError(`"${String(text).slice(0, 60)}" is not an AssetTrack QR code`);
        return false;
      }
      setResolving(true);
      setLastError('');
      try {
        const r = await api(`/assets/by-tag/${encodeURIComponent(tag)}`);
        stop();
        toast.success(`Opened ${r.data.assetTag}`);
        navigate(`/assets/${r.data.id}`, { replace: Boolean(routeTag) });
        return true;
      } catch (e) {
        setLastError(e.status === 404 ? `No asset found with tag ${tag}` : e.message);
        return false;
      } finally {
        setResolving(false);
      }
    },
    [navigate, stop, routeTag],
  );

  // /scan/AT-0001 (the URL printed in the QR) resolves straight to the asset.
  useEffect(() => {
    if (routeTag) open(routeTag);
  }, [routeTag, open]);

  async function start() {
    setCamError('');
    setLastError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError('This browser cannot access the camera. Use HTTPS, or upload a photo of the QR code instead.');
      return;
    }
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      const v = videoRef.current;
      v.srcObject = stream;
      await v.play();
      setActive(true);
      let busy = false;
      const tick = async () => {
        if (!streamRef.current) return;
        if (!busy && v.readyState >= 2 && v.videoWidth) {
          busy = true;
          const c = canvasRef.current;
          const scale = Math.min(1, 640 / v.videoWidth);
          c.width = Math.round(v.videoWidth * scale);
          c.height = Math.round(v.videoHeight * scale);
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(v, 0, 0, c.width, c.height);
          const text = await decode(ctx.getImageData(0, 0, c.width, c.height));
          if (text && (await open(text))) return;
          busy = false;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      stop();
      setCamError(
        e.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser settings, or upload a photo instead.'
          : e.name === 'NotFoundError'
            ? 'No camera was found on this device. Upload a photo of the QR code instead.'
            : `Could not start the camera: ${e.message}`,
      );
    } finally {
      setStarting(false);
    }
  }

  async function fromFile(file) {
    if (!file) return;
    setLastError('');
    try {
      const bmp = await createImageBitmap(file);
      const c = canvasRef.current;
      const scale = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(bmp.height * scale);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      const text = await decode(ctx.getImageData(0, 0, c.width, c.height));
      if (!text) setLastError('No QR code was found in that image. Try a sharper, closer photo.');
      else await open(text);
    } catch (e) {
      setLastError(`Could not read the image: ${e.message}`);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Scan QR code" subtitle="Point your camera at an AssetTrack label to open the asset" />
      <div className="card overflow-hidden">
        <div className="relative aspect-[4/3] bg-slate-900">
          <video ref={videoRef} className={`h-full w-full object-cover ${active ? '' : 'hidden'}`} playsInline muted />
          {active && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="size-56 rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          )}
          {!active && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-slate-300">
              {resolving ? <Spinner className="size-8" /> : <ScanLine className="size-12 text-slate-500" />}
              <p className="text-sm">{resolving ? 'Opening asset…' : 'Camera is off'}</p>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap gap-2">
            {!active ? (
              <button className="btn-primary" onClick={start} disabled={starting}>{starting ? <Spinner /> : <Camera className="size-4" />} Start camera</button>
            ) : (
              <button className="btn-secondary" onClick={stop}><CameraOff className="size-4" /> Stop camera</button>
            )}
            <label className="btn-secondary cursor-pointer">
              <ImageUp className="size-4" /> Upload photo
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { fromFile(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>
          {camError && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200" role="alert">{camError}</p>}
          {lastError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300" role="alert">{lastError}</p>}
          <form className="flex gap-2 border-t border-slate-200 pt-4 dark:border-slate-800" onSubmit={(e) => { e.preventDefault(); open(manual); }}>
            <input className="input font-mono" placeholder="Or type a tag, e.g. AT-0001" value={manual} onChange={(e) => setManual(e.target.value)} aria-label="Asset tag" />
            <button className="btn-secondary" disabled={!manual.trim() || resolving}><Search className="size-4" /> Open</button>
          </form>
        </div>
      </div>
    </div>
  );
}

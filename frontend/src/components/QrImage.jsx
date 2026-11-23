import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { qrUrlFor } from '../lib/format';

/** Data-URL PNG for an asset tag's QR (encodes the scan URL). */
export function qrDataUrl(tag, width = 240) {
  return QRCode.toDataURL(qrUrlFor(tag), { width, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } });
}

export default function QrImage({ tag, size = 160, className = '' }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let live = true;
    qrDataUrl(tag, size * 2).then((s) => live && setSrc(s));
    return () => {
      live = false;
    };
  }, [tag, size]);
  if (!src) return <div className={`skeleton ${className}`} style={{ width: size, height: size }} />;
  return <img src={src} width={size} height={size} alt={`QR code for ${tag}`} className={`rounded bg-white ${className}`} />;
}

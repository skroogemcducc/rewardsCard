import QRCode from 'qrcode';

export async function toQrDataUrl(value, { margin = 1, width = 280 } = {}) {
  const svg = await QRCode.toString(value, { type: 'svg', margin, width });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

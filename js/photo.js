// ============================================================================
//  RATE PHOTO  —  the mandi board, photographed at the gate
// ----------------------------------------------------------------------------
//  A number typed at home is a claim. A photograph of the board behind it is
//  evidence — and evidence is what makes a stranger believe the price.
//
//  No OCR, and that is a decision, not a shortcut: Assamese and Hindi handwriting
//  on a whiteboard would be misread more often than read. The photo is the proof;
//  the trader types the number. The farmer sees both.
//
//  Images are downscaled to 900 px and JPEG-compressed before they are stored, so
//  one rate costs ~60–120 KB instead of 4 MB — it has to survive in localStorage.
// ============================================================================
const MAX_EDGE = 900;
const QUALITY  = 0.7;
const MAX_BYTES = 260 * 1024;         // a hard cap: the device store is finite

export const photoSupported = () =>
  typeof document !== 'undefined' &&
  (typeof FileReader !== 'undefined') &&
  !!(document.createElement('canvas').getContext);

// Reads a File/Blob and returns a compressed data URL.
export function compressImage(file, { maxEdge = MAX_EDGE, quality = QUALITY } = {}){
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No photo chosen.'));
    if (typeof FileReader === 'undefined')
      return reject(new Error('This browser cannot read photos — the rate can still be posted without one.'));
    if (!/^image\//.test(file.type || '')) return reject(new Error('That file is not an image.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that photo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not open that photo.'));
      img.onload = () => {
        try {
          const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          let q = quality;
          let out = c.toDataURL('image/jpeg', q);
          // Step the quality down until it fits — a slightly soft photo is better
          // than a rate that cannot be saved at all.
          while (out.length * 0.75 > MAX_BYTES && q > 0.3){
            q -= 0.12;
            out = c.toDataURL('image/jpeg', q);
          }
          resolve({ dataUrl: out, bytes: Math.round(out.length * 0.75), width: w, height: h });
        } catch (e){ reject(new Error('Could not process that photo.')); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Rough size of a data URL in bytes — used to refuse an oversized photo early.
export const dataUrlBytes = d => (d ? Math.round(String(d).length * 0.75) : 0);
export const withinLimit = d => dataUrlBytes(d) <= MAX_BYTES;
export const MAX_PHOTO_BYTES = MAX_BYTES;

/* image.js — a picture file made small enough to keep in the database.
 *
 * The payment QR is stored in settings as a data URL, so it travels with the
 * building's file and its backups. A phone photo straight off the camera is
 * several megabytes; a QR needs nowhere near that to scan. So it is drawn onto
 * a canvas at most 600px on its long side and encoded as whichever of PNG,
 * WebP and JPEG comes out smallest.
 *
 * PNG is tried first and kept when it fits: a QR is flat black and white, PNG
 * stores that exactly, and JPEG's smearing at the module edges is what makes a
 * printed code fail to scan.
 */

const MAX_SIDE = 600;
const TARGET_BYTES = 300 * 1024;
const LIMIT_BYTES = 1024 * 1024;

const bytesOf = dataUrl => Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4);

function loadImage(file){
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('เปิดรูปนี้ไม่ได้ ไฟล์อาจเสียหรือไม่ใช่รูปภาพ')); };
    img.src = url;
  });
}

export async function shrinkImage(file){
  if(!file || !/^image\//.test(file.type)){
    throw new Error('ไฟล์นี้ไม่ใช่รูปภาพ เลือกไฟล์ PNG, JPG หรือ WebP');
  }
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  // White under a transparent PNG, or the JPEG fallback turns it black.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const tries = [
    canvas.toDataURL('image/png'),
    canvas.toDataURL('image/webp', 0.92),
    canvas.toDataURL('image/jpeg', 0.92),
    canvas.toDataURL('image/jpeg', 0.8),
  // A browser that cannot encode a type hands back PNG under its own name.
  ].filter(u => /^data:image\/(png|webp|jpeg);/.test(u));

  const fits = tries.find(u => bytesOf(u) <= TARGET_BYTES);
  const best = fits || tries.reduce((a, b) => bytesOf(a) <= bytesOf(b) ? a : b);
  if(bytesOf(best) > LIMIT_BYTES){
    throw new Error('รูปยังใหญ่เกิน 1 MB หลังย่อแล้ว ลองครอบเฉพาะตัว QR แล้วอัปโหลดใหม่');
  }
  return best;
}

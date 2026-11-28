import { cn } from '../../utils/cn';

const initialsOf = (user) =>
  (user?.name || user?.email || '?').split(' ').filter(Boolean).map((s) => s[0]).slice(0, 2).join('').toUpperCase();

/** Profile photo, or initials on a brand circle. */
export default function Avatar({ user, src, className }) {
  const url = src ?? user?.avatarUrl;
  if (url) return <img src={url} alt="" className={cn('h-8 w-8 rounded-full object-cover', className)} />;
  return (
    <span className={cn('grid h-8 w-8 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white', className)}>
      {initialsOf(user)}
    </span>
  );
}

/** Read an image file, crop it to a centred square and return a small JPEG data URL. */
export function resizeImage(file, size = 256) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) { reject(new Error('not-image')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad-image')); };
    img.src = url;
  });
}

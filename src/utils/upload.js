/* Multer upload config — images stored on disk; path saved in DB */
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', process.env.UPLOAD_DIR || 'public/uploads');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// Returns a multer instance that stores into /uploads/<subfolder>
function uploader(subfolder = 'misc') {
  const dest = path.join(UPLOAD_ROOT, subfolder);
  ensureDir(dest);

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dest),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const base = path.basename(file.originalname, ext)
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
      cb(null, `${base || 'img'}-${Date.now()}${ext}`);
    },
  });

  const maxMb = parseInt(process.env.MAX_UPLOAD_MB || '8', 10);

  return multer({
    storage,
    limits: { fileSize: maxMb * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ok = /image\/(jpe?g|png|gif|webp|svg\+xml|avif)/.test(file.mimetype);
      cb(ok ? null : new Error('Only image files are allowed'), ok);
    },
  });
}

// Convert a stored multer file to a web path like /uploads/products/abc.jpg
function webPath(subfolder, filename) {
  return `/uploads/${subfolder}/${filename}`;
}

// Delete an uploaded file given its web path (best-effort)
function removeByWebPath(webp) {
  if (!webp) return;
  const rel = webp.replace(/^\/uploads\//, '');
  const full = path.join(UPLOAD_ROOT, rel);
  fs.promises.unlink(full).catch(() => {});
}

module.exports = { uploader, webPath, removeByWebPath, UPLOAD_ROOT };

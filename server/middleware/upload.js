import multer from 'multer';
import { AppError } from '../utils/AppError.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;

// Held in memory rather than written to disk: the buffer goes straight to
// Cloudinary, so there is no temporary file to clean up or leak.
export const productImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      callback(new AppError('UNSUPPORTED_IMAGE_TYPE', 415, 'Upload a JPEG, PNG or WebP image'));
      return;
    }
    callback(null, true);
  },
}).single('image');

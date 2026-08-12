import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';
import { AppError } from './AppError.js';
import { logger } from './logger.js';

const configured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);

if (configured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
  });
}

export function uploadProductImage(buffer, organizationId) {
  if (!configured) {
    throw new AppError('IMAGE_UPLOAD_UNAVAILABLE', 503, 'Image uploads are not configured');
  }

  // Foldering by organization keeps one tenant's media out of another's listing
  // in the Cloudinary console.
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `stockledger/${organizationId}`, resource_type: 'image' },
      (error, result) => {
        if (error) {
          // The caller is told nothing useful on purpose, but silence in the log
          // leaves rejected credentials and a network fault looking identical.
          logger.error(
            { err: error, httpCode: error.http_code, organizationId },
            'cloudinary rejected an image upload',
          );
          reject(new AppError('IMAGE_UPLOAD_FAILED', 502, 'The image could not be stored'));
          return;
        }
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}

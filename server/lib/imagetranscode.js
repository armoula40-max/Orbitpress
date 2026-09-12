'use strict';
/**
 * imagetranscode.js — server-side counterpart of the Android bridge's Bitmap
 * JPEG re-encoding at the WordPress boundary.
 *
 * WordPress answers a raw media POST with rest_upload_sideload_error /
 * "Sorry, you are not allowed to upload this file type." whenever the file
 * extension plus the real content cannot be matched against the site's
 * allowed MIME list. WebP is the common casualty (WordPress < 5.8, multisite
 * "Upload file types" lists, and several security plugins drop it) while JPEG
 * is accepted by every install, so the publishing flow normalizes to JPEG.
 *
 * sharp ships prebuilt libvips inside its npm package: nothing extra is apt-get
 * installed in the Docker image.
 */
const sharp = require('sharp');
const { PublishingContracts } = require('./contracts');

const JPEG_MIME = 'image/jpeg';
const JPEG_EXTENSION = 'jpg';
/** Longest edge kept when re-encoding an image for WordPress. */
const MAX_TRANSCODE_EDGE = 4096;

function shouldTranscodeToJpeg(mimeType) {
  return String(mimeType || '').toLowerCase() === 'image/webp';
}

/**
 * Decodes any image sharp understands, flattens transparency onto white
 * (JPEG has no alpha), caps the longest edge at MAX_TRANSCODE_EDGE, and
 * encodes a baseline JPEG. Dimensions (and therefore the Pinterest 2:3
 * ratio) are preserved except for the safety downscale.
 */
async function transcodeToJpeg(bytes) {
  if (!bytes || !bytes.length) throw new Error('Cannot transcode an empty image.');
  const metadata = await sharp(bytes, { failOn: 'none' }).metadata();
  let pipeline = sharp(bytes, { failOn: 'none' })
    .flatten({ background: { r: 255, g: 255, b: 255, alpha: 1 } });
  const longestEdge = Math.max(metadata.width || 0, metadata.height || 0);
  if (longestEdge > MAX_TRANSCODE_EDGE) {
    pipeline = pipeline.resize(MAX_TRANSCODE_EDGE, MAX_TRANSCODE_EDGE, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }
  const output = await pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  return { bytes: output, mimeType: JPEG_MIME, extension: JPEG_EXTENSION };
}

/**
 * Labels provider output from its real magic bytes rather than the format the
 * provider documented. OpenAI-compatible endpoints may answer with JPEG while
 * advertising PNG (and some answer WebP). Unknown data is decoded and saved as
 * a standard JPEG so the rest of the pipeline only ever holds known formats.
 */
async function normalizeProviderImage(bytes) {
  if (!bytes || !bytes.length) throw new Error('Image provider returned an empty image.');
  const detected = PublishingContracts.detectImageMimeType(bytes);
  if (detected) {
    const extension = detected === 'image/jpeg' ? 'jpg' : detected.slice('image/'.length);
    return { bytes, mimeType: detected, extension };
  }
  try {
    return await transcodeToJpeg(bytes);
  } catch {
    throw new Error('Image provider returned data that is not a supported JPEG, PNG, or WebP image.');
  }
}

/** Small valid JPEG for the connection test's media round-trip. */
async function probeJpeg() {
  const bytes = await sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).jpeg({ quality: 80 }).toBuffer();
  return { bytes, mimeType: JPEG_MIME, extension: JPEG_EXTENSION };
}

module.exports = {
  JPEG_MIME,
  JPEG_EXTENSION,
  MAX_TRANSCODE_EDGE,
  shouldTranscodeToJpeg,
  transcodeToJpeg,
  normalizeProviderImage,
  probeJpeg,
};

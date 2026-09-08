'use strict';
/**
 * images.js — local image storage + validation, mirroring the Android bridge:
 *  - parseImage(dataUrl | local://ref) with real byte-sniffing
 *  - Pinterest images must be an exact 2:3 portrait (JPEG/PNG/WebP)
 *  - files stored per site under data/images/<siteId>/<uuid>.<ext>
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('./store');
const { PublishingContracts, MediaPublishingContract } = require('./contracts');

const MAX_IMAGE_BYTES = 12_000_000;

function safeSiteId(value) {
  const raw = String(value || 'site-default');
  return (raw || 'site-default').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'site-default';
}

function imageDirectory(siteId) {
  const base = path.join(DATA_DIR, 'images');
  fs.mkdirSync(base, { recursive: true });
  const safe = safeSiteId(siteId);
  if (safe === 'site-default') return base;
  const dir = path.join(base, safe);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeImageFilename(reference) {
  const ref = String(reference || '');
  if (!ref.startsWith('local://')) throw new Error('Invalid local image reference.');
  const filename = ref.slice('local://'.length);
  if (!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(filename)) throw new Error('Invalid local image reference.');
  return filename;
}

// --- pure-JS image dimension readers (no native dependencies) -------------

function pngDimensions(bytes) {
  if (bytes.length < 24) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegDimensions(bytes) {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1];
    // SOF0-SOF15 except DHT/JPG/DAC
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

function webpDimensions(bytes) {
  if (bytes.length < 30) return null;
  const fourcc = bytes.toString('ascii', 12, 16);
  if (fourcc === 'VP8 ') {
    const width = bytes.readUInt16LE(26) & 0x3fff;
    const height = bytes.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }
  if (fourcc === 'VP8L') {
    const b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height };
  }
  if (fourcc === 'VP8X') {
    const width = 1 + bytes.readUIntLE(24, 3);
    const height = 1 + bytes.readUIntLE(27, 3);
    return { width, height };
  }
  return null;
}

function imageDimensions(bytes, mimeType) {
  if (mimeType === 'image/png') return pngDimensions(bytes);
  if (mimeType === 'image/jpeg') return jpegDimensions(bytes);
  if (mimeType === 'image/webp') return webpDimensions(bytes);
  return null;
}

function extensionFor(mimeType) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

function validateImage(bytes, mime, pinterest) {
  if (!bytes || bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error('Choose an image smaller than 12 MB.');
  }
  if (pinterest) {
    const dims = imageDimensions(bytes, mime);
    if (!dims || !(dims.width > 0 && dims.height > 0 && dims.width * 3 === dims.height * 2)) {
      throw new Error('Pinterest image must have an exact 2:3 portrait ratio, such as 1000×1500.');
    }
  }
  return { bytes, mimeType: mime, extension: extensionFor(mime), width: undefined };
}

function parseImage(dataUrl, pinterest, siteId) {
  const value = String(dataUrl || '');
  if (value.startsWith('local://')) return parseImageReference(value, pinterest, siteId);
  const separator = value.indexOf(',');
  if (!(separator > 0 && value.startsWith('data:'))) throw new Error('Choose a valid image file.');
  const declaredMime = value.slice(5, value.indexOf(';'));
  const bytes = Buffer.from(value.slice(separator + 1), 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('Choose an image smaller than 12 MB.');
  return validateImage(bytes, PublishingContracts.validatedImageMimeType(declaredMime, bytes), pinterest);
}

function parseImageReference(reference, pinterest, siteId) {
  const filename = safeImageFilename(reference);
  const extension = filename.split('.').pop().toLowerCase();
  const declaredMime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : extension === 'webp' ? 'image/webp' : extension === 'png' ? 'image/png' : null;
  if (!declaredMime) throw new Error('Unsupported local image format.');
  const file = path.join(imageDirectory(siteId), filename);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error('The saved image is no longer available on this server. Select it again.');
  }
  const bytes = fs.readFileSync(file);
  return validateImage(bytes, PublishingContracts.validatedImageMimeType(declaredMime, bytes), pinterest);
}

// --- operations exposed through the bridge --------------------------------

function storeImage(request) {
  const kind = String(request.kind || '');
  if (!['featured', 'pinterest', 'article'].includes(kind)) throw new Error('Unknown image type.');
  const siteId = String(request.siteId || 'site-default');
  const image = parseImage(String(request.dataUrl || ''), kind === 'pinterest', siteId);
  const reference = `local://${crypto.randomUUID()}.${image.extension}`;
  fs.writeFileSync(path.join(imageDirectory(siteId), reference.slice('local://'.length)), image.bytes, { mode: 0o600 });
  return { ok: true, reference, mimeType: image.mimeType };
}

function loadImage(request) {
  const image = parseImageReference(String(request.reference || ''), false, String(request.siteId || 'site-default'));
  return { ok: true, dataUrl: `data:${image.mimeType};base64,${image.bytes.toString('base64')}` };
}

function removeImage(request) {
  const filename = safeImageFilename(String(request.reference || ''));
  const file = path.join(imageDirectory(String(request.siteId || 'site-default')), filename);
  fs.rmSync(file, { force: true });
  return { ok: true };
}

module.exports = {
  DATA_DIR,
  imageDirectory,
  imageDimensions,
  safeImageFilename,
  parseImage,
  parseImageReference,
  validateImage,
  storeImage,
  loadImage,
  removeImage,
};

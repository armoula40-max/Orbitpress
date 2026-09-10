'use strict';
/**
 * imagetranscode.test.js — the server-side WebP → JPEG normalization that
 * prevents rest_upload_sideload_error on WordPress installs that do not
 * accept WebP, plus the provider-bytes normalization.
 */
const test = require('node:test');
const assert = require('node:assert');
const mocks = require('./mockServers');
const transcode = require('../lib/imagetranscode');
const imagesLib = require('../lib/images');

test('WebP is re-encoded as JPEG while keeping exact dimensions', async () => {
  const webp = await mocks.realImage('webp', 1000, 1500);
  const jpeg = await transcode.transcodeToJpeg(webp);
  assert.equal(jpeg.mimeType, 'image/jpeg');
  assert.equal(jpeg.extension, 'jpg');
  assert.equal(jpeg.bytes[0], 0xff, 'JPEG SOI marker');
  assert.equal(jpeg.bytes[1], 0xd8);
  const dims = imagesLib.imageDimensions(jpeg.bytes, 'image/jpeg');
  assert.deepEqual(dims, { height: 1500, width: 1000 }, 'the Pinterest 2:3 ratio survives transcoding');
});

test('over-large images are downscaled but never upscaled', async () => {
  const giant = await mocks.realImage('webp', 5000, 3000);
  const jpeg = await transcode.transcodeToJpeg(giant);
  const dims = imagesLib.imageDimensions(jpeg.bytes, 'image/jpeg');
  assert.ok(Math.max(dims.width, dims.height) <= transcode.MAX_TRANSCODE_EDGE, 'longest edge is capped');
  assert.equal(dims.width, transcode.MAX_TRANSCODE_EDGE, 'proportional resize keeps aspect ratio');
});

test('provider bytes are labeled from real magic bytes, not the advertised type', async () => {
  const jpegBytes = await mocks.realImage('jpeg', 80, 80);
  // An OpenAI-compatible endpoint that documents PNG but answers JPEG.
  const labeled = await transcode.normalizeProviderImage(jpegBytes);
  assert.equal(labeled.mimeType, 'image/jpeg');
  assert.equal(labeled.extension, 'jpg');

  const pngBytes = await mocks.realImage('png', 64, 64);
  const labeledPng = await transcode.normalizeProviderImage(pngBytes);
  assert.equal(labeledPng.mimeType, 'image/png');
  assert.equal(labeledPng.extension, 'png');

  const webpBytes = await mocks.realImage('webp', 64, 96);
  const labeledWebp = await transcode.normalizeProviderImage(webpBytes);
  assert.equal(labeledWebp.mimeType, 'image/webp');
  assert.equal(labeledWebp.extension, 'webp');

  await assert.rejects(() => transcode.normalizeProviderImage(Buffer.from('definitely not an image')), /not a supported/);
  await assert.rejects(() => transcode.normalizeProviderImage(Buffer.alloc(0)), /empty image/);
});

test('the connection probe is a valid non-empty JPEG', async () => {
  const probe = await transcode.probeJpeg();
  assert.equal(probe.mimeType, 'image/jpeg');
  assert.equal(probe.extension, 'jpg');
  assert.ok(probe.bytes.length > 100, 'probe carries actual JPEG data');
  assert.equal(probe.bytes[0], 0xff);
  assert.equal(probe.bytes[1], 0xd8);
});

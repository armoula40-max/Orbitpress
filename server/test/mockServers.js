'use strict';
/**
 * Mock upstream servers used by the test-suite (the sandbox has no outbound
 * internet, and the real platform scrapers must never be hit in tests).
 *
 *  - mock WordPress (login, categories, tags, media, posts, repair data)
 *  - mock Pinterest page carrying a realistic __PWS_DATA__ JSON island
 *  - mock OpenAI-compatible Article API (json_schema + fallback flag)
 */
const http = require('http');

function tinyPng(width, height) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'ascii');
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr[16] = 8; ihdr[17] = 2;
  return Buffer.concat([sig, ihdr]);
}

function makeDataUrl(buffer, mime = 'image/png') {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

/**
 * A REAL, fully-encodable image (unlike tinyPng, which only carries a PNG
 * signature). Needed when the code under test hands bytes to sharp to
 * transcode, e.g. WebP → JPEG on the WordPress upload path.
 */
async function realImage(format, width, height) {
  const sharp = require('sharp');
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      raw[offset] = x < width / 3 ? 120 : 245;
      raw[offset + 1] = 200;
      raw[offset + 2] = 160;
    }
  }
  const pipeline = sharp(raw, { raw: { width, height, channels } });
  if (format === 'webp') return pipeline.webp({ quality: 90 }).toBuffer();
  if (format === 'jpeg' || format === 'jpg') return pipeline.jpeg({ quality: 90 }).toBuffer();
  return pipeline.png().toBuffer();
}

// ---------------------------------------------------------------------------

function startWordPressMock(state = {}) {
  const data = {
    categories: [{ id: 7, name: 'Breakfast' }, { id: 3, name: 'Chicken' }],
    media: [],
    uploads: [],
    posts: [],
    tags: [],
    nextPostId: 500,
    nextMediaId: 900,
    ...(state || {}),
  };
  data.baseUrl = `http://127.0.0.1:${0}`;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = (payload, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    // Public-facing post pages (for the internal-link liveness GET) — these
    // never require authorization on a real WordPress site. When the mock
    // simulates plain (?p=) permalinks, pretty /slug/ URLs 404 like WordPress.
    if (req.method === 'GET' && !url.pathname.startsWith('/wp-json') && !url.pathname.startsWith('/wp-')) {
      if (data.deadLinks === true || data.plainPermalinks === true || data.publicPagesBlocked === true) {
        res.writeHead(data.publicPagesBlocked === true ? 403 : 404, { 'Content-Type': 'text/html' });
        return res.end('not found');
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><html><body><h1>Mock post ${url.pathname}</h1></body></html>`);
    }
    // the REST API root advertises what the site can authenticate with
    if (req.method === 'GET' && url.pathname === '/wp-json/') {
      const authentication = data.noApplicationPasswords ? {} : { 'application-passwords': { endpoints: { authorization: `${data.baseUrl}/wp-admin/authorize-application.php` } } };
      return json({ name: 'Mock Site', description: 'Just another WordPress site', url: data.baseUrl, namespaces: ['wp/v2'], authentication });
    }
    // OrbitPress SEO Bridge plugin (public discovery; authed write)
    if (req.method === 'GET' && url.pathname === '/wp-json/orbitpress/v1/seo/plugins') {
      if (data.bridge === false) return json({ code: 'rest_no_route', message: 'No route' }, 404);
      const yoast = data.seoPlugin === 'yoast';
      const rankmath = data.seoPlugin !== 'yoast';
      return json({ ok: true, bridge: 'orbitpress-seo-bridge/1.0.0', rankmath, yoast, has_seo: true });
    }
    if (req.method === 'POST' && url.pathname === '/wp-json/orbitpress/v1/seo') {
      if (!req.headers.authorization) return json({ code: 'rest_not_logged_in' }, 401);
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const input = JSON.parse(body || '{}');
        data.seoWrites = data.seoWrites || [];
        data.seoWrites.push(input);
        const yoast = data.seoPlugin === 'yoast';
        json({ ok: true, post_id: input.post_id, plugins: { rankmath: !yoast, yoast }, fields: Object.fromEntries(Object.keys(input).map((k) => [k, 'updated'])) });
      });
      return;
    }
    if (!req.headers.authorization && !(data.acceptsAltHeader && req.headers['x-authorization'])) return json({ code: 'rest_not_logged_in' }, 401);
    // credentials are only enforced when a test asks for it
    if (req.method === 'GET' && url.pathname === '/wp-json/wp/v2/users/me') {
      if (data.blockUsersEndpoint) return json({ code: 'rest_user_cannot_view', message: 'Sorry, you are not allowed to list users.', data: { status: 401 } }, 401);
      // a host that drops the Authorization header: only X-Authorization lands
      if (data.acceptsAltHeader) {
        if (req.headers['x-authorization'] && req.headers['x-authorization'] === data.expectedAuth) return json({ id: 1, name: 'Askinz Admin', slug: 'askinz' });
        return json({ code: 'rest_not_logged_in', message: 'You are not currently logged in.', data: { status: 401 } }, 401);
      }
      if (data.expectedAuth && req.headers.authorization !== data.expectedAuth) return json({ code: 'rest_not_logged_in', message: 'You are not currently logged in.', data: { status: 401 } }, 401);
      if (data.requireEditContext && !String(url.searchParams.get('context') || '').includes('edit')) return json({ id: 1, name: 'Askinz Admin', slug: 'askinz' });
      if (data.requireEditContext) return json({ code: 'rest_forbidden_context', message: 'Sorry, you are not allowed to edit posts.', data: { status: 401 } }, 401);
      return json({ id: 1, name: 'Askinz Admin', slug: 'askinz' });
    }
    // a blocked users endpoint with working credentials: publishing is fine,
    // only the account lookup is refused — the shape some security plugins make
    if (req.method === 'GET' && url.pathname === '/wp-json/wp/v2/posts' && data.blockUsersEndpoint) {
      if (data.expectedAuth && req.headers.authorization !== data.expectedAuth) return json({ code: 'rest_not_logged_in', message: 'You are not currently logged in.', data: { status: 401 } }, 401);
      return json([]);
    }
    if (req.method === 'GET' && url.pathname === '/wp-json/wp/v2/categories') {
      if (data.expectedAuth && req.headers.authorization !== data.expectedAuth) return json({ code: 'rest_not_logged_in', message: 'You are not currently logged in.', data: { status: 401 } }, 401);
      const page = Number(url.searchParams.get('page') || 1);
      if (page > 1) return json({ code: 'rest_post_invalid_page_number' }, 400);
      return json(data.categories);
    }
    const catMatch = url.pathname.match(/^\/wp-json\/wp\/v2\/categories\/(\d+)/);
    if (req.method === 'GET' && catMatch) {
      const found = data.categories.find((c) => c.id === Number(catMatch[1]));
      return found ? json(found) : json({ code: 'rest_term_invalid' }, 404);
    }
    if (req.method === 'GET' && url.pathname === '/wp-json/wp/v2/tags') {
      const search = (url.searchParams.get('search') || '').toLowerCase();
      return json(data.tags.filter((t) => t.name.toLowerCase().includes(search)));
    }
    if (req.method === 'POST' && url.pathname === '/wp-json/wp/v2/tags') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const tag = { id: 50 + data.tags.length, name: JSON.parse(body).name };
        data.tags.push(tag);
        json(tag);
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/wp-json/wp/v2/media') {
      // WordPress reads the file from the raw body and its type from the
      // Content-Type header + the Content-Disposition filename. A body that is
      // not the matching image is refused with rest_upload_sideload_error, so
      // the mock refuses it too — otherwise a broken upload looks fine here.
      let body = Buffer.alloc(0);
      req.on('data', (chunk) => { body = Buffer.concat([body, chunk]); });
      req.on('end', () => {
        const contentType = String(req.headers['content-type'] || '');
        const disposition = String(req.headers['content-disposition'] || '');
        const filename = (/filename="([^"]*)"/.exec(disposition) || [])[1] || '';
        const record = { contentType, filename, bytes: body, length: body.length };
        data.uploads.push(record);
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        const rejected = (data.rejectImageTypes || []).includes(contentType);
        const signature = body.length >= 8
          && ((body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) ? 'image/jpeg'
            : (body[0] === 0x89 && body[1] === 0x50) ? 'image/png'
              : (body.toString('ascii', 8, 12) === 'WEBP') ? 'image/webp'
                : 'not-an-image');
        const extension = (filename.split('.').pop() || '').toLowerCase();
        if (rejected || !allowed.includes(contentType) || signature !== contentType
            || !/^[\x20-\x7e]+$/.test(filename) || !['jpg', 'jpeg', 'png', 'webp'].includes(extension)) {
          return json({
            code: 'rest_upload_sideload_error',
            message: 'Sorry, you are not allowed to upload this file type.',
            data: { status: 500 },
          }, 500);
        }
        const media = { id: data.nextMediaId, source_url: `https://wp.test/uploads/${data.nextMediaId}.${extension}` };
        data.nextMediaId += 1;
        data.media.push(media);
        return json(media, 201);
      });
      return;
    }
    const mediaMatch = url.pathname.match(/^\/wp-json\/wp\/v2\/media\/(\d+)/);
    if (mediaMatch && req.method === 'POST') return json({ id: Number(mediaMatch[1]), source_url: 'https://wp.test/uploads/ok.png' });
    if (mediaMatch && req.method === 'GET') {
      const media = data.media.find((m) => m.id === Number(mediaMatch[1]));
      return media ? json(media) : json({ code: 'rest_post_invalid_id' }, 404);
    }
    if (mediaMatch && req.method === 'DELETE') {
      data.deletions = data.deletions || [];
      data.deletions.push(Number(mediaMatch[1]));
      return json({ deleted: true, previous: { id: Number(mediaMatch[1]) } });
    }
    if (req.method === 'GET' && url.pathname === '/wp-json/wp/v2/posts') {
      // context=edit is the one that needs real credentials, like WordPress
      if (String(url.searchParams.get('context') || '') === 'edit' && data.expectedAuth && req.headers.authorization !== data.expectedAuth) {
        return json({ code: 'rest_not_logged_in', message: 'You are not currently logged in.', data: { status: 401 } }, 401);
      }
      const slug = url.searchParams.get('slug');
      let rows;
      if (slug && data.deadLinks === true) rows = []; // genuinely broken permalinks
      else rows = slug ? data.posts.filter((p) => p.slug === slug) : data.posts;
      // Internal-link verification GETs the public permalink: hand back rows
      // whose link points at this live mock instead of the fake wp.test host.
      if (data.liveInternalLinks === true && data.deadLinks !== true) {
        rows = rows.map((p) => (p.link && /^https?:\/\/wp\.test\/[^?]*\/?$/.test(p.link))
          ? { ...p, link: `${data.baseUrl}/${p.slug || p.id}/` } : p);
      }
      return json(rows);
    }
    const postMatch = url.pathname.match(/^\/wp-json\/wp\/v2\/posts\/(\d+)/);
    if (postMatch && req.method === 'GET') {
      const post = data.posts.find((p) => p.id === Number(postMatch[1]));
      return post ? json(post) : json({ code: 'rest_post_invalid_id' }, 404);
    }
    if (postMatch && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const post = data.posts.find((p) => p.id === Number(postMatch[1]));
        if (!post) return json({ code: 'rest_post_invalid_id' }, 404);
        const patch = JSON.parse(body);
        if (patch.content) post.content = { raw: patch.content, rendered: patch.content };
        json(post);
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/wp-json/wp/v2/posts') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const input = JSON.parse(body);
        const postId = data.nextPostId++;
        const post = {
          id: postId,
          title: { rendered: String(input.title || input.slug || `Post ${postId}`), raw: String(input.title || '') },
          link: data.plainPermalinks ? `https://wp.test/?p=${postId}` : `https://wp.test/${input.slug}/`,
          slug: input.slug,
          status: input.status,
          modified: new Date().toISOString(),
          content: { raw: input.content, rendered: input.content },
          categories: input.categories,
          meta: input.meta || {},
        };
        data.posts.push(post);
        json(post, 201);
      });
      return;
    }
    json({ code: 'rest_no_route' }, 404);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      data.baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve({ server, url: data.baseUrl, data });
    });
  });
}

// ---------------------------------------------------------------------------

const MOCK_PINS_HTML = `<!doctype html><html><head><title>swaliha - Pinterest</title></head><body>
<script id="__PWS_DATA__" type="application/json">${JSON.stringify({
  props: {},
  context: {},
  resourceResponses: {
    UserProfileResource: {
      response: {
        data: { username: 'swaliha', full_name: 'Swaliha Crafts' },
      },
    },
  },
  initialTree: {
    data: {
      pins: [
        { type: 'pin', id: '100000000000000001', title: 'Crochet Baby Blanket', description: 'Easy crochet baby blanket pattern for beginners', link: 'https://example.com/baby-blanket', created_at: '2026-08-20T10:00:00.000Z', aggregated_pin_data: { aggregated_stats: { saves: 452, comments: 12 } }, images: { orig: { url: 'https://i.pinimg.com/originals/aa.jpg' } } },
        { type: 'pin', id: '100000000000000002', title: 'Nail Art Summer', description: 'Pastel summer nails inspiration', link: 'https://example.com/nails', created_at: '2026-08-25T18:30:00.000Z', aggregated_pin_data: { aggregated_stats: { saves: 1200, comments: 44 } }, images: { orig: { url: 'https://i.pinimg.com/originals/bb.jpg' } } },
        { type: 'pin', id: '100000000000000003', title: '', description: 'Tiny apartment furniture layout move', created_at: '2026-09-01T08:00:00.000Z', aggregated_pin_data: { aggregated_stats: { saves: 55 } }, images: { orig: { url: 'https://i.pinimg.com/originals/cc.jpg' } } },
      ],
      board: { name: 'Crochet Ideas', pinner: { full_name: 'Swaliha Crafts', username: 'swaliha' } },
    },
  },
})}</script>
</body></html>`;

function startPinterestMock() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(MOCK_PINS_HTML);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

// ---------------------------------------------------------------------------

function sampleArticleJson() {
  return {
    title: 'Crispy Air Fryer Chicken Wings',
    metaDescription: 'Ultra-crispy air fryer chicken wings with a dry rub and zero breading, ready in 35 minutes.',
    slug: 'crispy-air-fryer-chicken-wings',
    contentType: 'recipe',
    categoryName: 'Chicken',
    outline: [{ heading: 'Why this works', keyPoints: ['dry rub', 'high heat'] }],
    htmlContent: '<p>These air fryer wings turn shatter-crisp without breading.</p><h2>Why this works</h2><p>Patting wings dry matters.</p>',
    internalLinks: [{ anchor: 'air fryer basket', reason: 'related technique guide' }],
    recipe: {
      isRecipe: true, description: 'Crispy dry-rub wings.', prepTime: 'PT10M', cookTime: 'PT25M', totalTime: 'PT35M',
      recipeYield: '4 servings', cuisine: 'American',
      ingredients: ['1 kg chicken wings', '1 tbsp baking powder', '1 tsp salt', '1 tsp smoked paprika'],
      instructions: [
        { name: 'Dry', text: 'Pat the wings dry.' },
        { name: 'Season', text: 'Toss with the rub.' },
        { name: 'Air fry', text: 'Cook at 200C.' },
        { name: 'Rest', text: 'Rest 5 minutes.' },
      ],
      notes: ['Serve hot.'],
    },
    recipes: [],
    pinterest: { title: 'Crispy Air Fryer Chicken Wings', altText: 'Air fryer chicken wings' },
  };
}

function startArticleApiMock(options = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const parsed = body ? JSON.parse(body) : {};
      calls.push(parsed);
      const system = JSON.stringify(parsed.messages || []);
      if (system.includes('items')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          choices: [{
            message: {
              role: 'assistant',
              content: JSON.stringify({
                items: [
                  { id: '111111111111111111', keyword: 'sourdough starter discard recipes', angle: 'Use discard in weeknight bakes', contentType: 'recipe' },
                  { id: '222222222222222222', keyword: 'no knead sourdough bread', angle: 'Beginner proofing timeline', contentType: 'article' },
                ],
              }),
            },
          }],
        }));
        return;
      }
      if (options.rejectJsonSchemaOnly && parsed.response_format && JSON.stringify(parsed.response_format).includes('json_schema')) {
        // Real OpenRouter/DeepSeek wording: "Response format" uses a space,
        // so naive substring matching on "response_format" would miss it.
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Response format is not supported by this model' } }));
        return;
      }
      if (options.rejectResponseFormat && parsed.response_format) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'unsupported parameter: response_format json_schema' } }));
        return;
      }
      if (options.rejectMaxTokens && Number(parsed.max_tokens) > options.rejectMaxTokens) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `max_tokens must be at most ${options.rejectMaxTokens}` } }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify(options.payload || sampleArticleJson()) } }] }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}`, calls }));
  });
}

/**
 * Mock of the endpoints the Pinterest web app uses to create a Pin, matching
 * the current S3 upload flow:
 *   ApiResource/create (register) -> S3 POST -> VIPResource/get (poll)
 *   -> PinResource/create
 * options.failStage: 'register-auth' (code 2 envelope), 's3' (S3 refuses, which
 * exercises the legacy /upload-image/ fallback).
 */
function startPinterestPublishMock(options = {}) {
  const calls = [];
  const bodies = [];
  const mockState = { pin: null };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    calls.push({ method: req.method, path: url.pathname });
    const json = (payload, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    const authFailure = () => json({
      status: 'failure', code: 2, message: 'Authentication failed.', data: null,
    }, 401);
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      // Internal endpoints carry options either in ?data= or in a form body.
      const encoded = url.searchParams.get('data') || (raw ? new URLSearchParams(raw).get('data') : null);
      if (encoded) { try { bodies.push(JSON.parse(encoded)); } catch { /* ignore */ } }
      if (raw && url.pathname === '/s3-upload') {
        bodies.push({ s3Upload: { length: Buffer.byteLength(raw), hasFile: raw.includes('name="file"') } });
      }

      // /me/ redirects an authenticated browser to /<username>/.
      if (url.pathname === '/me/' || url.pathname === '/me') {
        res.writeHead(302, { Location: '/armoula40/' });
        return res.end();
      }
      if (url.pathname === '/armoula40/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end('<html><body><script id="__PWS_DATA__" type="application/json">{"props":{"initialReduxState":{"users":{"555000111":{"username":"armoula40","is_connected_user":true}}}}}</script></body></html>');
      }

      if (url.pathname === '/resource/UserResource/get/') {
        // Functional session canary: guests/auth-expired jars get code 2.
        if (options.failStage === 'user-auth') return authFailure();
        return json({ resource_response: { data: { id: '555000111', username: 'armoula40' } } });
      }
      if (url.pathname === '/resource/BoardPickerBoardsResource/get/') {
        if (options.failStage === 'boards-auth') return authFailure();
        return json({
          resource_response: {
            data: {
              all_boards: [
                { id: '777888999000111222', name: 'Sourdough easy recipes', url: '/armoula40/sourdough-easy-recipes/' },
                { id: '112233445566778899', name: 'Recipes', url: '/armoula40/recipes/' },
                { id: '333444555666777888', name: 'لوحات أفكار', url: '/armoula40/afkar/' },
              ],
            },
          },
        });
      }
      if (url.pathname === '/resource/BoardsResource/get/') {
        // The connected account's boards, as the Save-to picker lists them.
        if (options.failStage === 'boards-auth') return authFailure();
        return json({
          resource_response: {
            data: [
              { id: '777888999000111222', name: 'Sourdough easy recipes', url: '/armoula40/sourdough-easy-recipes/', owner: { username: 'armoula40' } },
              { id: '112233445566778899', name: 'Recipes', url: '/mockuser/recipes/', owner: { username: 'armoula40' } },
              { id: '333444555666777888', name: 'لوحات أفكار', url: '/armoula40/afkar/', owner: { username: 'armoula40' } },
            ],
          },
          resource: { options: { bookmarks: ['-end-'] } },
        });
      }
      if (url.pathname === '/resource/BoardResource/get/') {
        if (options.failStage === 'board-missing') {
          return json({ resource_response: { data: null }, message: 'Board not found.' });
        }
        return json({ resource_response: { data: { id: '112233445566778899' } } });
      }
      if (url.pathname === '/resource/ApiResource/create/') {
        if (options.failStage === 'register-auth') return authFailure();
        const base = `http://127.0.0.1:${server.address().port}`;
        return json({
          resource_response: {
            data: {
              image_story_pin: {
                upload_id: 777001,
                upload_url: `${base}/s3-upload`,
                upload_parameters: {
                  key: 'uploads/orbitpress-test.jpg',
                  AWSAccessKeyId: 'AKIAMOCK',
                  policy: 'mock-policy',
                  signature: 'mock-signature',
                },
              },
            },
          },
        });
      }
      if (url.pathname === '/s3-upload') {
        if (options.failStage === 's3') {
          res.writeHead(403, { 'Content-Type': 'application/xml' });
          return res.end('<Error><Code>AccessDenied</Code></Error>');
        }
        res.writeHead(204);
        return res.end();
      }
      if (url.pathname === '/resource/VIPResource/get/') {
        return json({
          resource_response: {
            data: { 777001: { status: 'succeeded', signature: 'imagesig-777001', image_url: 'https://i.pinimg.com/processed/777001.jpg' } },
          },
        });
      }
      if (url.pathname === '/upload-image/') {
        return json({ success: true, image_url: 'https://i.pinimg.com/uploaded/legacy.jpg' });
      }
      if (url.pathname === '/resource/PinResource/create/') {
        mockState.pin = { id: '987654321098765432', link: options.pinAttachedLink || '' };
        return json({ resource_response: { data: { id: '987654321098765432' } } });
      }
      if (url.pathname === '/resource/PinResource/get/') {
        return json({ resource_response: { data: { id: '987654321098765432', link: (mockState.pin && mockState.pin.link) || '' } } });
      }
      if (url.pathname === '/resource/PinResource/update/') {
        const updateBody = bodies[bodies.length - 1];
        if (updateBody && updateBody.options) mockState.pin = { id: '987654321098765432', link: updateBody.options.link || '' };
        return json({ resource_response: { data: { id: '987654321098765432', link: (mockState.pin && mockState.pin.link) || '' } } });
      }
      return json({ error: `unmocked ${url.pathname}` }, 404);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      server,
      url: `http://127.0.0.1:${server.address().port}`,
      calls,
      bodies,
      paths: () => calls.map((c) => c.path),
      state: mockState,
    }));
  });
}

/**
 * Minimal OpenAI-compatible images endpoint.
 * `rejectSize` makes the provider refuse anything but that one size, the way
 * DALL·E 3 and friends behave.
 */
function startImageApiMock(options) {
  const calls = [];
  const rejectSize = options && options.rejectSize ? String(options.rejectSize) : '';
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const parsed = body ? JSON.parse(body) : {};
      calls.push(parsed);
      if (rejectSize && parsed.size !== rejectSize) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `unsupported size ${parsed.size}` } }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ b64_json: tinyPng(64, 64).toString('base64') }] }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}`, calls }));
  });
}

/** Minimal mock of the internal Pinterest resource GET endpoints. */
function startPinterestResourceMock() {
  const calls = [];
  const pin = (id, title) => ({
    id: String(id),
    type: 'pin',
    title,
    description: `${title} description`,
    created_at: '2025-01-07T18:23:09+00:00',
    link: 'https://example.test/post',
    domain: 'example.test',
    images: { orig: { url: `https://i.pinimg.com/originals/${id}.jpg`, width: 1000, height: 1500 } },
    repin_count: 418,
    comment_count: 3,
    aggregated_pin_data: { aggregated_stats: { saves: 418 } },
    pinner: { username: 'mockuser', full_name: 'Mock User' },
    board: { id: '8', name: 'Recipes' },
  });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    calls.push(url.pathname);
    const json = (payload, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (!/^\/resource\/.+\/get\/$/.test(url.pathname)) return json({ error: 'not found' }, 404);
    const name = url.pathname.split('/')[2];
    const body = { resource_response: { data: [], bookmark: null }, resource: {} };
    if (name === 'BoardFeedResource') {
      body.resource_response.data = [pin('111111111111111111', 'Board Pin One'), pin('222222222222222222', 'Board Pin Two')];
    } else if (name === 'ProfileBoardsResource') {
      body.resource_response.data = [{ id: '8', name: 'Recipes', url: 'https://www.pinterest.com/mockuser/recipes/', pin_count: 2 }];
    } else if (name === 'BaseSearchResource') {
      body.resource_response.data = [pin('333333333333333333', 'Search Result One')];
    } else if (name === 'PinResource') {
      body.resource_response.data = pin('444444444444444444', 'Detailed Pin');
    }
    return json(body);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}`, calls }));
  });
}

/**
 * Mock of the official Pinterest v5 API (api.pinterest.com). A freshly created
 * developer app sits on "Trial access pending" and every endpoint answers
 * HTTP 401 {"code":3,"message":"Your application consumer type is not
 * supported, please contact support."} until Pinterest activates it.
 */
function startPinterestApiMock(options = {}) {
  const calls = [];
  const status = options.status || 401;
  const payload = options.payload !== undefined
    ? options.payload
    : { code: 3, message: 'Your application consumer type is not supported, please contact support.' };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      calls.push({ method: req.method, path: req.url, authorization: req.headers.authorization, body: body ? JSON.parse(body) : null });
      if (options.success) {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: '99887766554433221', link: 'https://www.pinterest.com/pin/99887766554433221/' }));
        return;
      }
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}`, calls }));
  });
}

module.exports = { tinyPng, realImage, startImageApiMock, startPinterestPublishMock, startPinterestApiMock, makeDataUrl, startWordPressMock, startPinterestMock, startArticleApiMock, startPinterestResourceMock, sampleArticleJson };

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

// ---------------------------------------------------------------------------

function startWordPressMock(state = {}) {
  const data = {
    categories: [{ id: 7, name: 'Breakfast' }, { id: 3, name: 'Chicken' }],
    media: [],
    posts: [],
    tags: [],
    nextPostId: 500,
    nextMediaId: 900,
    ...(state || {}),
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = (payload, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (!req.headers.authorization) return json({ code: 'rest_not_logged_in' }, 401);
    if (req.method === 'GET' && url.pathname === '/wp-json/wp/v2/users/me') return json({ id: 1, name: 'Askinz Admin', slug: 'askinz' });
    if (req.method === 'GET' && url.pathname === '/wp-json/wp/v2/categories') {
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
      const media = { id: data.nextMediaId++, source_url: `https://wp.test/uploads/${data.nextMediaId}.png` };
      data.media.push(media);
      return json(media, 201);
    }
    const mediaMatch = url.pathname.match(/^\/wp-json\/wp\/v2\/media\/(\d+)/);
    if (mediaMatch && req.method === 'POST') return json({ id: Number(mediaMatch[1]), source_url: 'https://wp.test/uploads/ok.png' });
    if (mediaMatch && req.method === 'GET') {
      const media = data.media.find((m) => m.id === Number(mediaMatch[1]));
      return media ? json(media) : json({ code: 'rest_post_invalid_id' }, 404);
    }
    if (req.method === 'GET' && url.pathname === '/wp-json/wp/v2/posts') {
      const slug = url.searchParams.get('slug');
      return json(slug ? data.posts.filter((p) => p.slug === slug) : data.posts);
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
        const post = {
          id: data.nextPostId++,
          link: `https://wp.test/${input.slug}/`,
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
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}`, data }));
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
      if (options.rejectResponseFormat && parsed.response_format) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'unsupported parameter: response_format json_schema' } }));
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

/** Minimal mock of the endpoints the Pinterest web app uses to create a Pin. */
function startPinterestPublishMock() {
  const calls = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    calls.push(url.pathname);
    const json = (payload) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (url.pathname === '/upload-image/') return json({ success: true, image_url: 'https://i.pinimg.com/uploaded/test.jpg' });
    if (url.pathname === '/resource/PinResource/create/') {
      return json({ resource_response: { data: { id: '987654321098765432' } } });
    }
    if (url.pathname === '/resource/BoardResource/get/') {
      return json({ resource_response: { data: { id: '112233445566778899' } } });
    }
    return json({ error: `unmocked ${url.pathname}` });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}`, calls }));
  });
}

/** Minimal OpenAI-compatible images endpoint. */
function startImageApiMock() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      calls.push(body ? JSON.parse(body) : {});
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

module.exports = { tinyPng, startImageApiMock, startPinterestPublishMock, makeDataUrl, startWordPressMock, startPinterestMock, startArticleApiMock, startPinterestResourceMock, sampleArticleJson };

'use strict';
process.env.ORBITPRESS_ALLOW_HTTP = '1';
process.env.ORBITPRESS_DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'orbitpress-ai-'));

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const AiProviders = require('../lib/ai/providers');
const AiClient = require('../lib/ai/client');
const article = require('../lib/article');
const store = require('../lib/store');
const mocks = require('./mockServers');

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

test('provider registry carries every documented preset', () => {
  const ids = AiProviders.PRESETS.map((p) => p.id);
  for (const id of ['gemini', 'openrouter', 'deepseek', 'nvidia', 'groq', 'together', 'openai', 'cloudflare-llm', 'ollama', 'custom']) {
    assert.ok(ids.includes(id), `registry must ship ${id}`);
  }
  assert.equal(AiProviders.PRESET_MAP.gemini.kind, 'gemini');
  assert.ok(AiProviders.PRESET_MAP.gemini.structured === 'native');
});

test('legacy articleBaseUrl/Model/ApiKey fields behave like the custom preset', () => {
  const cfg = AiProviders.resolveTextConfig({
    articleBaseUrl: 'https://gateway.example.com/v1/', articleModel: 'm-1', articleApiKey: 'secret',
  });
  assert.equal(cfg.presetId, 'custom');
  assert.equal(cfg.kind, 'openai');
  assert.equal(cfg.baseUrl, 'https://gateway.example.com/v1'); // trailing slash trimmed
  assert.equal(cfg.model, 'm-1');
  assert.equal(cfg.apiKey, 'secret');
  assert.deepEqual(AiProviders.validateConfig(cfg), []);
});

test('Gemini native config ignores the free-form URL and targets the native host', () => {
  const cfg = AiProviders.resolveTextConfig({
    textProvider: 'gemini', articleBaseUrl: 'https://ignored.example.com',
    articleModel: 'gemini-2.5-flash', articleApiKey: 'g-key',
  });
  assert.equal(cfg.kind, 'gemini');
  assert.equal(cfg.baseUrl, 'https://generativelanguage.googleapis.com');
  assert.deepEqual(AiProviders.validateConfig(cfg), []);
});

test('Cloudflare Workers AI embeds the account id and refuses to run without it', () => {
  const missing = AiProviders.resolveTextConfig({
    textProvider: 'cloudflare-llm', articleModel: '@cf/meta/llama-3.1-8b-instruct-fast', articleApiKey: 'cf-token',
  });
  assert.equal(missing.baseUrl, '');
  assert.ok(AiProviders.validateConfig(missing).some((m) => m.includes('Account ID')));

  const ok = AiProviders.resolveTextConfig({
    textProvider: 'cloudflare-llm', articleAccountId: 'acct 123',
    articleModel: '@cf/meta/llama-3.1-8b-instruct-fast', articleApiKey: 'cf-token',
  });
  assert.ok(ok.baseUrl.includes('/accounts/acct%20123/ai/v1'));
  assert.deepEqual(AiProviders.validateConfig(ok), []);
});

test('Ollama needs no key and is the only plain-HTTP loopback allowed', () => {
  const ollama = AiProviders.resolveTextConfig({ textProvider: 'ollama', articleModel: 'qwen2.5:14b' });
  assert.equal(ollama.apiKey, '');
  assert.deepEqual(AiProviders.validateConfig(ollama), []);
  assert.ok(AiProviders.isLoopback('http://127.0.0.1:11434/v1'));
  assert.ok(!AiProviders.isLoopback('http://10.0.0.5:11434/v1'));

  const remoteHttp = AiProviders.resolveTextConfig({
    textProvider: 'custom', articleBaseUrl: 'http://10.0.0.5:8080/v1', articleModel: 'm', articleApiKey: 'k',
  });
  assert.ok(AiProviders.validateConfig(remoteHttp).some((m) => m.includes('HTTP')));
});

test('fallback config resolves only when both provider and model are set', () => {
  const none = AiProviders.resolvePrimaryAndFallback({ textProvider: 'groq', articleModel: 'm', articleApiKey: 'k' });
  assert.equal(none.fallback, null);

  const both = AiProviders.resolvePrimaryAndFallback({
    textProvider: 'groq', articleModel: 'primary-model', articleApiKey: 'k1',
    textFallbackProvider: 'deepseek', articleFallbackModel: 'fallback-model', articleFallbackApiKey: 'k2',
  });
  assert.equal(both.fallback.presetId, 'deepseek');
  assert.equal(both.fallback.model, 'fallback-model');
  assert.equal(both.fallback.apiKey, 'k2');
  assert.equal(both.fallback.fallback, true);
});

test('the browser provider list stays in sync with the server registry', () => {
  const uiJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app', 'providers-ui.js'), 'utf8');
  const serverIds = AiProviders.PRESETS.map((p) => p.id).filter(Boolean).sort();
  const uiIds = Array.from(uiJs.matchAll(/\{\s*id:\s*'([a-z0-9-]+)'/g), (m) => m[1]).sort();
  assert.deepEqual(uiIds, serverIds);
});

// ---------------------------------------------------------------------------
// OpenAI-compatible adapter ladder
// ---------------------------------------------------------------------------

test('OpenAI adapter keeps json_schema when the provider accepts it', async () => {
  const api = await mocks.startArticleApiMock();
  try {
    const cfg = AiProviders.resolveTextConfig({ textProvider: 'custom', articleBaseUrl: api.url + '/v1', articleModel: 'gen-x', articleApiKey: 'k' });
    const out = await AiClient.chat(cfg, {
      messages: [{ role: 'user', content: 'hi' }], temperature: 0.2, maxTokens: 200,
      jsonSchema: { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
    });
    assert.equal(out.mode, 'json_schema');
    assert.ok(JSON.parse(out.content));
  } finally { api.server.close(); }
});

test('OpenAI adapter steps down to json_object then plain when formats are refused', async (t) => {
  const schemaOnly = await mocks.startArticleApiMock({ rejectJsonSchemaOnly: true });
  t.after(() => schemaOnly.server.close());
  const cfg1 = AiProviders.resolveTextConfig({ textProvider: 'custom', articleBaseUrl: schemaOnly.url + '/v1', articleModel: 'gen-x', articleApiKey: 'k' });
  const jsonObject = await AiClient.chat(cfg1, {
    messages: [{ role: 'user', content: 'hi' }], maxTokens: 200,
    jsonSchema: { type: 'object', properties: { a: { type: 'string' } } },
  });
  assert.equal(jsonObject.mode, 'json_object');

  const allModes = await mocks.startArticleApiMock({ rejectResponseFormat: true });
  t.after(() => allModes.server.close());
  const cfg2 = AiProviders.resolveTextConfig({ textProvider: 'custom', articleBaseUrl: allModes.url + '/v1', articleModel: 'gen-x', articleApiKey: 'k' });
  const plain = await AiClient.chat(cfg2, {
    messages: [{ role: 'user', content: 'hi' }], maxTokens: 200,
    jsonSchema: { type: 'object', properties: { a: { type: 'string' } } },
  });
  assert.equal(plain.mode, 'plain');
});

test('OpenAI adapter retries with a smaller token budget when the provider caps max_tokens', async () => {
  const api = await mocks.startArticleApiMock({ rejectMaxTokens: 100 });
  try {
    const cfg = AiProviders.resolveTextConfig({ textProvider: 'custom', articleBaseUrl: api.url + '/v1', articleModel: 'gen-x', articleApiKey: 'k' });
    const out = await AiClient.chat(cfg, {
      messages: [{ role: 'user', content: 'hi' }], maxTokens: 400,
      jsonSchema: { type: 'object', properties: { a: { type: 'string' } } },
    });
    assert.equal(out.mode, 'json_schema');
    const budgets = api.calls.map((c) => c.max_tokens);
    assert.ok(budgets.some((n) => n <= 100), `expected a retried budget <=100, saw ${budgets.join(',')}`);
  } finally { api.server.close(); }
});

// ---------------------------------------------------------------------------
// Gemini native adapter
// ---------------------------------------------------------------------------

function startGeminiMock(options = {}) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      calls.push({ url: req.url, key: req.headers['x-goog-api-key'], body: body ? JSON.parse(body) : {} });
      if (options.blocked) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ ok: true, mode: options.schema ? 'schema' : 'json' }) }] }, finishReason: 'STOP' }],
        usageMetadata: { totalTokenCount: 7 },
      }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    server, calls,
    url: `http://127.0.0.1:${server.address().port}`,
  })));
}

test('Gemini adapter calls the native endpoint with the key header and native schema', async (t) => {
  const gem = await startGeminiMock({ schema: true });
  t.after(() => gem.server.close());
  const cfg = AiProviders.resolveTextConfig({
    textProvider: 'gemini', articleModel: 'gemini-2.5-flash', articleApiKey: 'g-key',
  });
  // point the native host at the mock for the test
  cfg.baseUrl = gem.url;
  const out = await AiClient.chat(cfg, {
    messages: [{ role: 'system', content: 'you are a writer' }, { role: 'user', content: 'go' }],
    maxTokens: 100,
    jsonSchema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], $schema: 'x', additionalProperties: false },
  });
  assert.equal(out.mode, 'native-schema');
  assert.equal(gem.calls[0].key, 'g-key', 'key travels in the x-goog-api-key header, never the URL');
  assert.ok(gem.calls[0].url.includes('/v1beta/models/gemini-2.5-flash:generateContent'));
  assert.equal(gem.calls[0].body.generationConfig.responseMimeType, 'application/json');
  assert.ok(gem.calls[0].body.generationConfig.responseSchema, 'responseSchema present');
  assert.equal(JSON.stringify(gem.calls[0].body.generationConfig.responseSchema).includes('$schema'), false, 'Gemini-rejected keys stripped');
  assert.ok(gem.calls[0].body.systemInstruction, 'system instruction hoisted to the native field');
});

test('Gemini blocked prompt surfaces the block reason', async (t) => {
  const gem = await startGeminiMock({ blocked: true });
  t.after(() => gem.server.close());
  const cfg = AiProviders.resolveTextConfig({ textProvider: 'gemini', articleModel: 'gemini-2.5-flash', articleApiKey: 'g-key' });
  cfg.baseUrl = gem.url;
  await assert.rejects(() => AiClient.chat(cfg, { messages: [{ role: 'user', content: 'go' }], maxTokens: 50 }), /SAFETY|حجب/);
});

test('probe reports structured JSON support and latency', async (t) => {
  const api = await mocks.startArticleApiMock();
  t.after(() => api.server.close());
  const cfg = AiProviders.resolveTextConfig({ textProvider: 'custom', articleBaseUrl: api.url + '/v1', articleModel: 'gen-x', articleApiKey: 'k' });
  const probe = await AiClient.probe(cfg);
  assert.equal(probe.ok, true);
  assert.equal(probe.model, 'gen-x');
  assert.equal(probe.structured, true);
  assert.ok(probe.latencyMs >= 0);

  const down = AiProviders.resolveTextConfig({ textProvider: 'custom', articleBaseUrl: 'https://127.0.0.1:9/v1', articleModel: 'gen-x', articleApiKey: 'k' });
  const bad = await AiClient.probe(down);
  assert.equal(bad.ok, false);
  assert.ok(bad.message.length > 5);
});

// ---------------------------------------------------------------------------
// Fallback chain + provenance (never silent)
// ---------------------------------------------------------------------------

test('a dead primary transparently switches to the fallback and logs why', async (t) => {
  const fb = await mocks.startArticleApiMock();
  t.after(() => fb.server.close());
  const settings = {
    textProvider: 'custom',
    articleBaseUrl: 'https://127.0.0.1:9/v1', articleModel: 'dead-model', articleApiKey: 'k1',
    textFallbackProvider: 'custom',
    articleFallbackBaseUrl: fb.url + '/v1', articleFallbackModel: 'fb-model', articleFallbackApiKey: 'k2',
  };
  const out = await article.requestArticleCompletion({
    settings,
    messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }],
    maxTokens: 300,
  });
  assert.equal(out.provenance.fallbackUsed, true);
  assert.ok(out.provenance.fallbackReason.length > 5, 'the primary failure reason is recorded');
  const failed = out.provenance.attempts.find((a) => a.role === 'primary' && a.ok === false);
  const saved = out.provenance.attempts.find((a) => a.role === 'fallback' && a.ok === true);
  assert.ok(failed, 'failed primary attempt logged');
  assert.ok(saved, 'successful fallback attempt logged');
  assert.equal(saved.model, 'fb-model');
  assert.ok(JSON.parse(out.response.choices[0].message.content), 'content still parses');
});

test('testArticleApi probes both primary and fallback', async (t) => {
  const api = await mocks.startArticleApiMock();
  t.after(() => api.server.close());
  const settings = {
    textProvider: 'custom',
    articleBaseUrl: api.url + '/v1', articleModel: 'gen-x', articleApiKey: 'sk-primary-secret',
    textFallbackProvider: 'custom',
    articleFallbackBaseUrl: 'https://127.0.0.1:9/v1', articleFallbackModel: 'fb-x', articleFallbackApiKey: 'sk-fallback-secret',
  };
  store.saveSiteSettings(settings, 'site-fb-probe');
  const result = await article.testArticleApi({ siteId: 'site-fb-probe' });
  assert.equal(result.ok, true);
  assert.equal(result.structured, true);
  assert.ok(result.fallback, 'fallback probe included');
  assert.equal(result.fallback.ok, false, 'and its failure is reported, not hidden');
});

test('drafts carry non-secret generation provenance through generate()', async (t) => {
  const api = await mocks.startArticleApiMock();
  t.after(() => api.server.close());
  store.saveSiteSettings({
    textProvider: 'custom',
    articleBaseUrl: api.url + '/v1', articleModel: 'gen-x', articleApiKey: 'sk-primary-secret',
  }, 'site-gen-prov');
  const result = await article.generate({
    siteId: 'site-gen-prov', keyword: 'أسهل حلى بارد', niche: 'food', contentType: 'article', categoryName: 'حلويات',
  });
  assert.equal(result.ok, true);
  assert.ok(result.draft.generation, 'draft.generation present');
  assert.ok(/gen-x/.test(result.draft.generation.generatedBy));
  assert.equal(result.draft.generation.fallbackUsed, false);
  assert.ok(Array.isArray(result.draft.generation.attempts));
  const serialized = JSON.stringify(result.draft.generation);
  assert.equal(serialized.includes('sk-primary-secret'), false, 'no api key leaks into provenance');
});

// ---------------------------------------------------------------------------
// Roundup completeness: tolerant parsing + automatic repair of "Recipe N was
// incomplete" instead of a hard failure.
// ---------------------------------------------------------------------------

const { DraftContract, LongFormCompletenessContract } = require('../lib/contracts');

function roundupFixture(overrides = {}) {
  const filler = Array.from({ length: 80 }, (_, i) => `Step guidance paragraph number ${i} with useful detail about the recipes.`).join(' ');
  const recipe = (n, extra = {}) => ({
    isRecipe: true,
    title: `Chicken recipe ${n}`,
    description: `A complete description for recipe ${n}.`,
    prepTime: 'PT10M', cookTime: 'PT20M', totalTime: 'PT30M',
    recipeYield: '4 servings', cuisine: 'International',
    ingredients: ['500 g chicken', '1 tsp salt', '1 tbsp oil', '1 onion'],
    instructions: [
      { name: 'Prep', text: `Recipe ${n}: prep the ingredients.` },
      { name: 'Cook', text: `Recipe ${n}: cook thoroughly.` },
      { name: 'Rest', text: `Recipe ${n}: rest briefly.` },
      { name: 'Serve', text: `Recipe ${n}: serve warm.` },
    ],
    notes: ['Use fresh herbs.'],
    ...extra,
  });
  return {
    title: 'Two easy chicken recipes',
    metaDescription: 'Two easy chicken recipes for weeknight dinners with simple ingredients.',
    seoTitle: 'Two easy chicken recipes for quick dinners at home',
    seoDescription: 'Two easy chicken recipes for weeknight dinners, with full ingredients, steps and tips for a juicy result every time.',
    focusKeyphrase: 'two easy chicken recipes',
    slug: 'two-easy-chicken-recipes',
    contentType: 'article',
    categoryName: 'Chicken',
    htmlContent: `<h2>Introduction</h2><p>${filler}</p>`,
    internalLinks: [], externalReferences: [], secondaryKeywords: [],
    outline: [{ heading: 'First recipe', keyPoints: ['a'] }],
    recipes: [recipe(1), recipe(2)],
    recipe: { isRecipe: false },
    pinterest: { title: 'Two easy chicken recipes', altText: 'Two easy chicken recipes pin cover' },
    ...overrides,
  };
}

test('recipe fields tolerate newline-string ingredients and plain-string steps', () => {
  const fixture = roundupFixture({
    recipes: [{
      isRecipe: true, title: 'Loose-format recipe', description: 'desc',
      prepTime: 'PT5M', cookTime: 'PT15M', recipeYield: '2', cuisine: 'x',
      ingredients: '2 cups flour\n1 cup milk\n• 1 egg\n▪ 1 tsp salt',
      instructions: ['Mix the dry ingredients.', 'Add the milk and egg.', 'Cook on medium heat.', 'Serve immediately.'],
      notes: 'Best warm\n',
    }],
  });
  const draft = DraftContract.normalize(fixture, 'Chicken');
  assert.equal(draft.recipes[0].ingredients.length, 4, 'newline/bullet string split into ingredients');
  assert.equal(draft.recipes[0].instructions.length, 4, 'plain string steps accepted');
  assert.equal(draft.recipes[0].notes.length, 1);
});

test('incomplete recipe errors name the actual missing counts', () => {
  const fixture = roundupFixture();
  fixture.recipes[0].ingredients = [];
  fixture.recipes[0].instructions = [{ name: 'a', text: 'only one step' }];
  assert.throws(
    () => DraftContract.normalize(fixture, 'Chicken'),
    /Recipe 1 was incomplete \(ingredients: 0, instructions: 1/,
  );
});

test('an incomplete first roundup reply is repaired automatically and logged', async (t) => {
  const complete = roundupFixture();
  const incomplete = roundupFixture({
    recipes: [{
      isRecipe: true, title: 'Chicken recipe 1', description: 'd',
      prepTime: 'PT1M', cookTime: 'PT1M', recipeYield: '1', cuisine: 'x',
      ingredients: ['a'], instructions: [{ name: 's', text: 'only one short step' }], notes: ['n'],
    }],
  });
  const api = await mocks.startArticleApiMock({ payloads: [incomplete, complete] });
  t.after(() => api.server.close());
  store.saveSiteSettings({
    textProvider: 'custom',
    articleBaseUrl: api.url + '/v1', articleModel: 'gen-x', articleApiKey: 'sk',
  }, 'site-roundup-repair');
  const result = await article.generate({
    siteId: 'site-roundup-repair',
    keyword: '2 easy chicken recipes', niche: 'food', contentType: 'auto', categoryName: 'Chicken',
  });
  assert.equal(result.ok, true);
  assert.equal(result.draft.recipes.length, 2);
  assert.ok(result.draft.generation.repairPasses >= 1, 'repair pass recorded on the draft');
  const check = LongFormCompletenessContract.validate(result.draft, 2);
  assert.equal(check.valid, true, check.reason);
});

test('a roundup that stays incomplete after repair fails with the exact recipe reason', async (t) => {
  const bad = roundupFixture({
    recipes: [{
      isRecipe: true, title: 'Only recipe', description: 'd',
      prepTime: 'PT1M', cookTime: 'PT1M', recipeYield: '1', cuisine: 'x',
      ingredients: ['a'], instructions: [{ name: 's', text: 'one step' }], notes: ['n'],
    }],
  });
  const api = await mocks.startArticleApiMock({ payloads: [bad, bad, bad] });
  t.after(() => api.server.close());
  store.saveSiteSettings({
    textProvider: 'custom',
    articleBaseUrl: api.url + '/v1', articleModel: 'gen-x', articleApiKey: 'sk',
  }, 'site-roundup-stuck');
  await assert.rejects(
    () => article.generate({
      siteId: 'site-roundup-stuck',
      keyword: '2 easy chicken recipes', niche: 'food', contentType: 'auto', categoryName: 'Chicken',
    }),
    /incomplete recipe output|incomplete/,
  );
});

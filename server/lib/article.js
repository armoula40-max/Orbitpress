'use strict';
/**
 * article.js — port of the generation + social analysis operations from
 * MainActivity.kt: generate (json_schema with provider fallback + long-form
 * completeness repair), analyzeSocialKeywords, analyzePinterestKeywords,
 * and the new FeedSpy report generator (Arabic or English).
 */
const { requestJson } = require('./http');
const {
  PublishingContracts,
  ProviderCompatibilityContract,
  DraftContract,
  RecipeRequestContract,
  LongFormCompletenessContract,
} = require('./contracts');
const { requireAiSettings } = require('./wordpress');
const SeoAnalyzer = require('../public/app/seoAnalyzer');
const AiProviders = require('./ai/providers');
const AiClient = require('./ai/client');

// ---------------------------------------------------------------------------
// Default prompts, single source of truth (also served at /api/prompt-defaults
// so the Settings UI can show and reset them). Every prompt below can be
// overridden per website from Settings; an empty override uses the default.
// ---------------------------------------------------------------------------
const PROMPT_DEFAULTS = {
  articleSystem: "You are Askinz's exacting content editor and technical SEO strategist optimizing for a guaranteed 100/100 score in both Rank Math and Yoast. You write in the SAME language and script as the primary keyword (Modern Standard Arabic for Arabic keywords, natural English for English ones). Adapt vocabulary, examples, safety guidance, and expertise to the requested niche. Produce genuinely helpful original content for practical search intent; use cooking rules only when the niche and keyword are genuinely food-related. Never fabricate reviews, ratings, citations, testing, nutrition, calories, provenance, medical advice, or ranking promises. Never invent URLs or statistics. Keyword usage must read naturally — no stuffing. Use only semantic HTML allowed in a WordPress post body (h2, h3, p, ul, ol, li, strong, em, table, figure, img are fine).",
  recipeRepairSystem: 'You are a strict recipe-roundup completion editor. Never summarize requested recipes; return every complete recipe.',
  recipeRepairInstruction: 'CRITICAL COMPLETENESS REPAIR: return exactly {count} fully populated objects in recipes[]. Do not return a summary, names only, or a single recipe. Every object must include a title, description, at least 4 ingredients with quantities, prep time, cook time, yield, 4 to 9 numbered instructions, and at least one useful note. The collection body must be long and detailed. Previous output problem: {issue}',
  analyzer: 'You are a {platform} content analyst. Analyze only the supplied posts. Return strict JSON with keys summary, reason, primaryKeywords, longTailKeywords, relatedKeywords, topics, winningPhrases, searchIntent, titlePatterns, contentAngles. Keep extracted keywords separate from AI suggestions. Do not copy a post verbatim.',
  viral: 'You are an SEO editor. For each supplied post propose exactly one precise search keyword, a writing angle and the content type (recipe or article). Return strict JSON: {"items":[{"id":"...","keyword":"...","angle":"...","contentType":"recipe|article"}]}. Never copy the post title verbatim.',
  viralAr: 'أنت محرر SEO. لكل منشور مرقق، اقترح كلمة مفتاحية بحثية واحدة دقيقة وزاوية كتابة واضحة ونوع المحتوى (recipe أو article). أعد JSON صارماً: {"items":[{"id":"...","keyword":"...","angle":"...","contentType":"recipe|article"}]}. لا تنسخ عنوان المنشور حرفياً.',
  feedspy: 'You are an expert FeedSpy-style social content analyst. Analyze only the supplied posts and the stats block. Return strict JSON with keys: headline, executiveSummary, viralPatterns, primaryKeywords, longTailKeywords, topics, winningPhrases, bestTimeAdvice, contentAngles, competitorWatch, planOfAction. Lists are plain string arrays. Never copy a post verbatim.',
  feedspyAr: 'أنت محلل محتوى اجتماعي خبير بأسلوب FeedSpy. حلّل المنشورات المرفقة فقط مع كتلة الإحصاءات. أعد JSON صارماً بالمفاتيح: headline, executiveSummary, viralPatterns, primaryKeywords, longTailKeywords, topics, winningPhrases, bestTimeAdvice, contentAngles, competitorWatch, planOfAction. كل القيم نصوص عربية واضحة، والقوائم مصفوفات نصية. لا تنسخ المنشورات حرفياً. ركّز على ما قاده التفاعل العالي عملياً.',
};

// Resolve an optional per-site override; {token} placeholders in the default
// text are expanded. A non-empty override is used verbatim and is itself
// token-expanded.
function resolvePrompt(override, defaultText, tokens) {
  const base = String(override || '').trim() || defaultText;
  return String(base).replace(/\{(\w+)\}/g, (match, key) => (tokens && tokens[key] != null ? String(tokens[key]) : match));
}

function chatEndpoint(base) {
  const url = PublishingContracts.requireHttpsUrl(base, 'Article API URL');
  return url.endsWith('/chat/completions') ? url : `${url}/chat/completions`;
}

function articleResponseFormat() {
  const schema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      metaDescription: { type: 'string' },
      focusKeyphrase: { type: 'string' },
      secondaryKeywords: { type: 'array', items: { type: 'string' }, maxItems: 8 },
      seoTitle: { type: 'string' },
      seoDescription: { type: 'string' },
      paaQuestions: { type: 'array', items: { type: 'string' }, maxItems: 6 },
      externalReferences: { type: 'array', maxItems: 3, items: { type: 'object', properties: { anchor: { type: 'string' }, topic: { type: 'string' } }, required: ['anchor', 'topic'], additionalProperties: false } },
      slug: { type: 'string' },
      contentType: { type: 'string', enum: ['recipe', 'article'] },
      categoryName: { type: 'string' },
      outline: { type: 'array', items: { type: 'object', properties: { heading: { type: 'string' }, keyPoints: { type: 'array', items: { type: 'string' } } }, required: ['heading', 'keyPoints'], additionalProperties: false } },
      htmlContent: { type: 'string' },
      internalLinks: { type: 'array', items: { type: 'object', properties: { anchor: { type: 'string' }, reason: { type: 'string' } }, required: ['anchor', 'reason'], additionalProperties: false } },
      recipe: { type: 'object', properties: { isRecipe: { type: 'boolean' }, description: { type: 'string' }, prepTime: { type: 'string' }, cookTime: { type: 'string' }, totalTime: { type: 'string' }, recipeYield: { type: 'string' }, cuisine: { type: 'string' }, ingredients: { type: 'array', items: { type: 'string' } }, instructions: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, text: { type: 'string' } }, required: ['name', 'text'], additionalProperties: false } }, notes: { type: 'array', items: { type: 'string' } } }, required: ['isRecipe', 'description', 'prepTime', 'cookTime', 'totalTime', 'recipeYield', 'cuisine', 'ingredients', 'instructions', 'notes'], additionalProperties: false },
      recipes: { type: 'array', maxItems: 12, items: { type: 'object', properties: { title: { type: 'string' }, isRecipe: { type: 'boolean' }, description: { type: 'string' }, prepTime: { type: 'string' }, cookTime: { type: 'string' }, totalTime: { type: 'string' }, recipeYield: { type: 'string' }, cuisine: { type: 'string' }, ingredients: { type: 'array', items: { type: 'string' } }, instructions: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, text: { type: 'string' } }, required: ['name', 'text'], additionalProperties: false } }, notes: { type: 'array', items: { type: 'string' } } }, required: ['title', 'isRecipe', 'description', 'prepTime', 'cookTime', 'totalTime', 'recipeYield', 'cuisine', 'ingredients', 'instructions', 'notes'], additionalProperties: false } },
      pinterest: { type: 'object', properties: { title: { type: 'string' }, altText: { type: 'string' } }, required: ['title', 'altText'], additionalProperties: false },
    },
    required: ['title', 'metaDescription', 'focusKeyphrase', 'secondaryKeywords', 'seoTitle', 'seoDescription', 'paaQuestions', 'externalReferences', 'slug', 'contentType', 'categoryName', 'outline', 'htmlContent', 'internalLinks', 'recipe', 'recipes', 'pinterest'],
    additionalProperties: false,
  };
  return { type: 'json_schema', json_schema: { name: 'askinz_niche_article', strict: true, schema } };
}

/**
 * Article completion through the unified provider layer (lib/ai).
 *  - resolves the selected preset (Gemini native / OpenAI-compatible / ...),
 *  - the adapter walks its own structured-output ladder internally,
 *  - an optional fallback provider is tried when the primary fails after its
 *    own retries are exhausted, and the switch + reason is recorded.
 * Returns { response (OpenAI-shaped for the caller), mode, provenance }.
 */
async function requestArticleCompletion({ settings, messages, temperature = 0.2, maxTokens }) {
  const { primary, fallback } = AiProviders.resolvePrimaryAndFallback(settings);
  const schema = articleResponseFormat().json_schema.schema;
  const provenance = { attempts: [], startedAt: new Date().toISOString() };

  const tryOne = async (cfg, role) => {
    const started = Date.now();
    const result = await AiClient.chat(cfg, { messages, temperature, maxTokens, jsonSchema: schema });
    provenance.attempts.push({
      role, provider: cfg.presetId, label: cfg.label, model: cfg.model,
      mode: result.mode, ok: true, latencyMs: Date.now() - started,
    });
    provenance.generatedBy = role === 'fallback' ? `${cfg.label} · ${cfg.model}` : `${cfg.label} · ${cfg.model}`;
    return {
      response: { choices: [{ message: { content: result.content } }], usage: result.usage },
      mode: result.mode,
      cfg,
      provenance,
    };
  };

  let primaryError = null;
  try {
    return await tryOne(primary, 'primary');
  } catch (error) {
    provenance.attempts.push({
      role: 'primary', provider: primary.presetId, label: primary.label, model: primary.model,
      ok: false, reason: String(error && error.message || error).slice(0, 300),
    });
    primaryError = error;
  }
  if (fallback) {
    try {
      const out = await tryOne(fallback, 'fallback');
      provenance.fallbackUsed = true;
      provenance.fallbackReason = String(primaryError && primaryError.message || primaryError).slice(0, 300);
      return out;
    } catch (error) {
      provenance.attempts.push({
        role: 'fallback', provider: fallback.presetId, label: fallback.label, model: fallback.model,
        ok: false, reason: String(error && error.message || error).slice(0, 300),
      });
    }
  }
  throw primaryError;
}

async function requestCompletion({ baseUrl, apiKey, model, messages, temperature = 0.2, responseFormat }) {
  const body = { model, temperature, messages };
  if (responseFormat) body.response_format = responseFormat;
  try {
    return await requestJson(chatEndpoint(baseUrl), 'POST', { Authorization: `Bearer ${apiKey}` }, body);
  } catch (error) {
    if (!responseFormat) throw error;
    const message = String(error.message || '').toLowerCase();
    const rejectsFormat = /response_format|json|schema|unsupported|invalid_request|400|422/.test(message);
    if (!rejectsFormat) throw error;
    delete body.response_format;
    return requestJson(chatEndpoint(baseUrl), 'POST', { Authorization: `Bearer ${apiKey}` }, body);
  }
}

/** Parse a model reply into JSON: fences, prose around it, or nothing. */
function parseModelJson(content) {
  const cleaned = stripCodeFence(String(content || '').trim());
  try { return JSON.parse(cleaned); } catch { /* continue */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* fall through */ }
  }
  return null;
}

function stripCodeFence(content) {
  return String(content || '').trim().replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
}

async function generate(request) {
  const settings = requireAiSettings(request);
  const keyword = String(request.keyword || '').trim();
  if (keyword.length < 2 || keyword.length > 160) throw new Error('Keyword must contain 2 to 160 characters.');
  const niche = String(request.niche || 'food');
  const requestedType = ['recipe', 'article', 'auto'].includes(String(request.contentType)) ? String(request.contentType) : 'auto';
  const category = String(request.categoryName || '').trim();
  const keywords = (Array.isArray(request.keywords) ? request.keywords : []).map((k) => String(k || '').trim().slice(0, 160)).filter(Boolean).slice(0, 40);
  const titleList = String(request.existingTitles || '').trim().slice(0, 4000);
  const requestedRecipeCount = RecipeRequestContract.requestedCount(keyword);
  const customizedTextPrompt = String(settings.textPrompt || '').trim()
    .replace(/\{\{keyword\}\}/g, keyword)
    .replace(/\{\{category\}\}/g, category);
  // Best-effort: when WordPress is configured, hand the model the REAL titles
  // of published posts so internal-link anchors match actual articles. AI
  // generation stays independent of WordPress — failures are silent no-ops.
  let internalCandidates = [];
  try {
    if (String(settings.wordpressBaseUrl || '').trim()) {
      const wordpress = require('./wordpress');
      const Seo = require('./seo');
      const realPosts = await Seo.fetchPublishedPosts(wordpress.wpRoot(settings.wordpressBaseUrl), settings, 2);
      internalCandidates = realPosts.map((p) => String(p.title || '').trim()).filter(Boolean).slice(0, 40);
    }
  } catch { /* no WordPress connection yet: model still suggests anchors */ }
  const maxTokens = 12000;
  const prompt = buildPrompt({ keyword, niche, requestedType, category, keywords, titleList, requestedRecipeCount, customizedTextPrompt, internalCandidates });

  const messages = [
    { role: 'system', content: resolvePrompt(settings.articleSystemPrompt, PROMPT_DEFAULTS.articleSystem) },
    { role: 'user', content: prompt },
  ];
  const first = await requestArticleCompletion({ settings, messages, temperature: 0.7, maxTokens });
  const content = first.response.choices && first.response.choices[0] && first.response.choices[0].message && first.response.choices[0].message.content;
  let draft = parseArticleDraft(content, category, keyword);
  let provenance = first.provenance;
  if (requestedRecipeCount > 0 && !LongFormCompletenessContract.validate(draft, requestedRecipeCount).valid) {
    const issue = LongFormCompletenessContract.validate(draft, requestedRecipeCount).reason;
    const repairInstruction = resolvePrompt(settings.recipeRepairPrompt, PROMPT_DEFAULTS.recipeRepairInstruction, { count: requestedRecipeCount, issue });
    const repairMessages = [
      { role: 'system', content: resolvePrompt(settings.recipeRepairSystemPrompt, PROMPT_DEFAULTS.recipeRepairSystem) },
      { role: 'user', content: `${prompt}\n${repairInstruction}` },
    ];
    const repaired = await requestArticleCompletion({ settings, messages: repairMessages, temperature: 0.4, maxTokens });
    const repairedContent = repaired.response.choices && repaired.response.choices[0] && repaired.response.choices[0].message && repaired.response.choices[0].message.content;
    draft = parseArticleDraft(repairedContent, category, keyword);
    provenance = {
      ...repaired.provenance,
      attempts: [...provenance.attempts, ...repaired.provenance.attempts],
      repairPasses: 1,
      repairReason: issue,
    };
    const completeness = LongFormCompletenessContract.validate(draft, requestedRecipeCount);
    if (!completeness.valid) {
      throw new Error(`The Article API returned incomplete long-form output: ${completeness.reason}. Please retry with a provider that supports structured long-form output.`);
    }
  }
  // Non-secret generation provenance: which provider/model actually answered,
  // structured-output mode, fallback switch and repair attempts.
  draft.generation = {
    generatedBy: provenance.generatedBy || '',
    fallbackUsed: !!provenance.fallbackUsed,
    fallbackReason: provenance.fallbackReason || '',
    repairPasses: provenance.repairPasses || 0,
    attempts: provenance.attempts.map((a) => ({ ...a, reason: a.reason ? String(a.reason).slice(0, 220) : undefined })),
    at: provenance.startedAt,
  };
  return { ok: true, draft };
}

/** Parse a model reply into a normalized draft, tolerating fences and prose. */
function parseArticleDraft(content, category, keyword) {
  const parsed = parseModelJson(stripCodeFence(content));
  if (!parsed || typeof parsed !== 'object') {
    const preview = String(content || '').replace(/\s+/g, ' ').slice(0, 300);
    throw new Error(`The Article API did not return JSON (it answered with prose or an empty body). Switch the model to one that supports JSON output, or retry. Response preview: ${preview}`);
  }
  return applySeoDefaults(DraftContract.normalize(parsed, category), keyword);
}

function applySeoDefaults(draft, keyword) {
  if (!draft) return draft;
  const rtl = SeoAnalyzer.isRtl(keyword);
  if (!draft.focusKeyphrase) draft.focusKeyphrase = keyword;
  if (!draft.seoTitle) draft.seoTitle = SeoAnalyzer.buildSeoTitle({ keyphrase: draft.focusKeyphrase, title: draft.title, rtl });
  if (!draft.seoDescription) draft.seoDescription = SeoAnalyzer.buildSeoDescription({ keyphrase: draft.focusKeyphrase, metaDescription: draft.metaDescription, title: draft.title, rtl });
  if (!draft.metaDescription) draft.metaDescription = draft.seoDescription.slice(0, 160);
  if (!draft.slug) {
    // Arabic tokens are kept (cleanSlug allows the Arabic block); hyphenated.
    draft.slug = String(keyword).toLowerCase().replace(/[^a-z0-9؀-ۿݐ-ݿ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 220)
      || `post-${Date.now()}`;
  }
  const p = draft.pinterest || {};
  if (!p.altText) {
    p.altText = draft.focusKeyphrase && !SeoAnalyzer.norm(draft.title).includes(SeoAnalyzer.norm(draft.focusKeyphrase))
      ? `${draft.focusKeyphrase} - ${draft.title}`.slice(0, 180)
      : draft.title.slice(0, 180);
  }
  draft.pinterest = p;
  return draft;
}

function buildPrompt({ keyword, niche, requestedType, category, keywords, titleList, requestedRecipeCount, customizedTextPrompt, internalCandidates }) {
  const rtl = SeoAnalyzer.isRtl(keyword);
  const language = rtl ? 'Modern Standard Arabic (العربية الفصحى), including EVERY field: title, seoTitle, descriptions, headings, body, notes and alt text' : 'natural English';
  const isRoundup = requestedRecipeCount > 0;
  const wordTarget = requestedType === 'recipe' || isRoundup ? 900 : 1200;
  return `
    You are writing ONE complete, publication-ready article for the website's "${niche}" niche. Write entirely in ${language}.

    # ROLE
    Senior on-page SEO editor whose drafts score 100/100 in Rank Math AND Yoast, while being genuinely useful to real readers.

    # AUDIENCE AND INTENT
    Primary keyword (exact focus keyphrase): ${keyword}
    Requested format: ${requestedType}${isRoundup ? ` (a recipe collection delivering EXACTLY ${requestedRecipeCount} complete, distinct recipes in recipes[])` : ''}
    Infer the real search intent (learn, compare, or cook) and satisfy it fully.
    Preferred WordPress category: ${category || 'choose the most fitting one'}
    Related queued keywords already assigned to other articles (do not overlap, but you may pick 5-8 supporting ones): ${keywords.join(', ') || 'None'}
    Existing site titles you must not duplicate: ${titleList || 'None supplied'}

    # NON-NEGOTIABLE SEO RULES (checked automatically — satisfy every one)
    - focusKeyphrase: the exact primary keyword above, ${rtl ? 'in Arabic' : '2-4 English words'}. It must appear in: the seoTitle at the START (≤60 characters total), seoDescription (within first 100 chars), slug, the first paragraph of htmlContent, 30-40% of H2/H3 headings (never every heading), and at least one image alt concept.
    - Keyword density 0.5%-2.5%: count words carefully; for a 1200-word article use the exact focus keyphrase roughly 6-14 times including variations, spread naturally.
    - secondaryKeywords: 5 to 8 real supporting keywords people actually search, used naturally in headings and body.
    - seoTitle: max 60 characters, click-worthy, focus keyphrase first.
    - seoDescription: 120 to 156 characters, includes the focus keyphrase early, ends with a hook or call to action.
    - paaQuestions: 3 to 5 genuine "people also ask" questions this article answers, each phrased like a real searcher.
    - Body length: at least ${wordTarget} words of real content in htmlContent. Short paragraphs (2-4 sentences). ${isRoundup ? 'Each recipe in recipes[] is rendered separately as a schema-rich recipe card; the body ties the collection together.' : ''}
    - 4 to 8 H2 sections (plus H3 sub-steps where useful); the introduction directly promises the answer in 2-3 short paragraphs.
    - Include an FAQ-style H2 near the end answering 3 paaQuestions briefly in your own words.
    - internalLinks: 2 to 4 anchor suggestions. The site ALREADY contains these real published articles: ${(internalCandidates && internalCandidates.length) ? internalCandidates.map((t) => `"${t}"`).join(' · ') : 'none available yet'}. When related articles exist, pick 2-3 of these EXACT titles (or a distinctive 2-4 word phrase from each) as anchor text, and place that exact phrase once, naturally and contextually, in the relevant section of htmlContent (e.g. in a paragraph that discusses that sub-topic). Suggest anchors unrelated to the article's body for nothing; and NEVER invent URLs — anchors only, the server matches the real link.
    - seoTitle CTR: if the body genuinely delivers a numbered set (N tips, N steps, N recipes, N ways, N mistakes), put that REAL number at or near the start of seoTitle — never invent a number for an article that is not a list. Use ONE truthful Arabic power word only when the content really supports it (سهلة، سريعة، مجربة، لذيذة، عملية، شاملة، فعالة، مثالية، ناجحة، خطوة بخطوة) — no hype the body does not deliver.
    - externalReferences: 1 or 2 objects {anchor,topic} where topic is a stable, well-known reference topic suitable for Wikipedia or an official organisation page (e.g. an ingredient, technique, standard or organisation). Use that exact anchor phrase once naturally in the body. No fabricated studies, statistics or citations.
    - Use the focus keyphrase exactly (same word order) at least once; surrounding synonyms elsewhere.

    # CONTENT TYPE RULES
    - Choose "recipe" ONLY for a genuinely cookable dish (or a collection of them). For crochet, pets, nails, furniture, decor, DIY, beauty, gardening, etc. choose "article": recipe.isRecipe must be false and recipes must be empty, and instead give concrete steps, materials, safety, maintenance or buying guidance.
    ${isRoundup ? `- recipes[] MUST contain exactly ${requestedRecipeCount} FULLY populated, distinct recipes (never summarize, never merge). Each: unique title (recipe 1 should contain the focus keyphrase), 1-3 sentence description, at least 6 ingredients WITH quantities, prepTime/cookTime/totalTime as ISO 8601 (PT15M, PT1H), recipeYield, cuisine, 5-9 concrete numbered instructions, and 1-3 practical notes (tips, storage, substitutions).\n    - The roundup body is still ≥ ${wordTarget} words: an intro, guidance (how to choose, tips, storage, serving), and transitions BETWEEN recipes with a short paragraph per recipe.` : `- For one cookable dish, populate recipe with sensible ingredients with quantities, 4 to 9 concrete steps, ISO 8601 durations such as PT15M, yield, cuisine, and 1 to 3 useful notes. Do NOT render a recipe card inside htmlContent.\n    - For articles use real, specific, actionable steps instead.`}
    - Never invent ratings, reviews, stars, calories, nutrition values, prices, brands, medical claims, testing or provenance.

    # PINTEREST FIELD
    - pinterest.title: a concise scroll-stopping Pin title (max 80 chars); pinterest.altText: one descriptive sentence that includes the focus keyphrase (max 180 chars). No hashtags, no Pin description field.

    # HARD CONSTRAINTS
    - Return valid JSON ONLY with this exact structure:
    {"title":"","metaDescription":"","focusKeyphrase":"","secondaryKeywords":[""],"seoTitle":"","seoDescription":"","paaQuestions":[""],"externalReferences":[{"anchor":"","topic":""}],"slug":"","contentType":"recipe|article","categoryName":"","outline":[{"heading":"","keyPoints":[""]}],"htmlContent":"","internalLinks":[{"anchor":"","reason":""}],"recipe":{"isRecipe":false,"description":"","prepTime":"","cookTime":"","totalTime":"","recipeYield":"","cuisine":"","ingredients":[],"instructions":[{"name":"","text":""}],"notes":[]},"recipes":[{"title":"","isRecipe":true,"description":"","prepTime":"","cookTime":"","totalTime":"","recipeYield":"","cuisine":"","ingredients":[""],"instructions":[{"name":"","text":""}],"notes":[""]}],"pinterest":{"title":"","altText":""}}
    - slug: lowercase, hyphen-separated${rtl ? ', KEEP ARABIC WORDS IN ARABIC SCRIPT (do not transliterate)' : ''}, 2-5 words including the focus keyphrase.
    - htmlContent is semantic HTML fragments only: h2, h3, p, ul, ol, li, strong, em, table. No Markdown, CSS, scripts, iframes, image URLs or links with invented hrefs.
    ${customizedTextPrompt ? `\nCUSTOM EDITOR PROMPT (follow when compatible with this contract):\n${customizedTextPrompt}` : ''}
  `.trim();
}

async function analyzeKeywords(request, platformHint) {
  const settings = requireAiSettings(request);
  const posts = Array.isArray(request.posts) ? request.posts : [];
  if (posts.length < 1 || posts.length > 20) throw new Error('Select between 1 and 20 social posts.');
  const compact = posts.map((post) => ({
    title: String(post.title || '').slice(0, 500),
    text: String(post.text || '').slice(0, 1800),
    url: String(post.url || ''),
    viralScore: Number(post.viralScore) || 0,
    saves: post.saves != null ? post.saves : null,
    comments: post.comments != null ? post.comments : null,
  }));
  const platform = (String(request.platform || platformHint || 'pinterest').toLowerCase()) || 'pinterest';
  const system = resolvePrompt(settings.analyzerPrompt, PROMPT_DEFAULTS.analyzer, { platform });
  const user = JSON.stringify({ platform, task: 'Extract keywords and explain winning content patterns from the ranked posts.', posts: compact });
  const provider = ProviderCompatibilityContract.normalize(settings.articleBaseUrl, settings.articleModel);
  const body = {
    model: provider.model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  let response;
  try {
    response = await requestCompletion({
      baseUrl: provider.baseUrl,
      apiKey: settings.articleApiKey,
      model: provider.model,
      messages: body.messages,
      temperature: body.temperature,
      responseFormat: body.response_format,
    });
  } catch (error) {
    throw new Error(ProviderCompatibilityContract.diagnostic(error.message));
  }
  const content = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
  const parsed = parseModelJson(content);
  // A provider that answers in prose still produced an analysis: keep it
  // instead of throwing away the whole run.
  const report = parsed || { summary: String(content || '').slice(0, 2000), primaryKeywords: [] };
  return { ok: true, report };
}

/**
 * Viral handoff: for each supplied post, ask the configured Article API for
 * ONE keyword (and the angle to write it from) in the site's language. The
 * app already has this analyzer — keyword guessing with regex is only the
 * fallback when the AI is unreachable.
 */
async function viralKeywords(request) {
  const settings = requireAiSettings(request);
  const language = String(request.language || 'en').startsWith('ar') ? 'ar' : 'en';
  const posts = (Array.isArray(request.posts) ? request.posts : []).slice(0, 12).map((post) => ({
    id: String(post.id || ''),
    title: String(post.title || '').slice(0, 300),
    text: String(post.text || '').slice(0, 700),
    boardName: post.boardName || null,
    sourceUrl: post.outboundUrl || null,
    saves: post.saves ?? null,
    reactions: post.reactions ?? null,
    comments: post.comments ?? null,
    viralScore: Number(post.viralScore) || 0,
  }));
  if (!posts.length) throw new Error('There are no posts to extract keywords from.');
  const provider = ProviderCompatibilityContract.normalize(settings.articleBaseUrl, settings.articleModel);
  const system = resolvePrompt(settings.viralPrompt, language === 'ar' ? PROMPT_DEFAULTS.viralAr : PROMPT_DEFAULTS.viral);
  const user = JSON.stringify({ task: 'Turn each viral post into one keyword to publish against.', language, posts });
  const body = {
    model: provider.model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  };
  let response;
  try {
    response = await requestJson(chatEndpoint(provider.baseUrl), 'POST', { Authorization: `Bearer ${settings.articleApiKey}` }, body);
  } catch (error) {
    const message = String(error.message || '').toLowerCase();
    if (message.includes('response_format') || message.includes('json')) {
      delete body.response_format;
      response = await requestJson(chatEndpoint(provider.baseUrl), 'POST', { Authorization: `Bearer ${settings.articleApiKey}` }, body);
    } else {
      throw new Error(ProviderCompatibilityContract.diagnostic(error.message));
    }
  }
  const content = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
  let parsed = {};
  try { parsed = JSON.parse(stripCodeFence(content)); } catch { parsed = {}; }
  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const siteId = String(request.siteId || 'site-default');
  const items = rawItems
    .map((item) => ({
      id: String(item.id || ''),
      keyword: String(item.keyword || item.primaryKeyword || '').trim().slice(0, 120),
      angle: String(item.angle || '').trim().slice(0, 400),
      contentType: String(item.contentType || '').toLowerCase() === 'recipe' ? 'recipe' : 'article',
    }))
    .filter((item) => item.keyword.length >= 3)
    .slice(0, 12);
  void siteId;
  return { ok: true, items };
}

/**
 * Connectivity probe for the configured Article API: one tiny completion,
 * no WordPress involved, so the user can confirm the provider works (or see
 * the exact failure) without connecting a site.
 */
async function testArticleApi(request) {
  const settings = requireAiSettings(request);
  const { primary, fallback } = AiProviders.resolvePrimaryAndFallback(settings);
  const problems = AiProviders.validateConfig(primary);
  if (problems.length) {
    return { ok: false, model: primary.model, latencyMs: 0, message: problems.join(' · ') };
  }
  const result = await AiClient.probe(primary);
  // Surface the active provider and its structured-JSON capability explicitly.
  result.message = result.ok
    ? `${primary.label} · ${result.structured ? 'يدعم JSON المنظّم ✓' : 'يجيب لكن بدون تأكيد وضع JSON (سيعمل وضع الاستخراج)'} · ${result.mode}`
    : result.message;
  if (fallback) {
    result.fallback = await AiClient.probe(fallback);
  }
  return result;
}

async function analyzeSocialKeywords(request) {
  return analyzeKeywords(request, String(request.platform || 'facebook'));
}

async function analyzePinterestKeywords(request) {
  return analyzeKeywords(request, 'pinterest');
}

/**
 * FeedSpy-style full report: Arabic or English, over normalized + ranked posts
 * and the computed analytics block from the scraper analyzer.
 */
async function feedspyReport(request) {
  const settings = requireAiSettings(request);
  const language = String(request.language || 'ar').startsWith('ar') ? 'ar' : 'en';
  const platform = String(request.platform || 'pinterest').toLowerCase();
  const posts = (Array.isArray(request.posts) ? request.posts : []).slice(0, 20).map((post) => ({
    title: String(post.title || '').slice(0, 300),
    text: String(post.text || '').slice(0, 900),
    publishedAt: post.publishedAt || null,
    reactions: post.reactions ?? null,
    comments: post.comments ?? null,
    shares: post.shares ?? null,
    saves: post.saves ?? null,
    viralScore: Number(post.viralScore) || 0,
  }));
  if (!posts.length) throw new Error('There are no collected posts to analyze yet.');
  const stats = request.stats && typeof request.stats === 'object' ? request.stats : {};
  const provider = ProviderCompatibilityContract.normalize(settings.articleBaseUrl, settings.articleModel);
  const system = resolvePrompt(settings.feedspyPrompt, language === 'ar' ? PROMPT_DEFAULTS.feedspyAr : PROMPT_DEFAULTS.feedspy);
  const user = JSON.stringify({
    platform,
    source: String(request.source || ''),
    period: request.period || null,
    stats,
    posts,
    task: language === 'ar' ? 'أنتج تقريراً عربياً عملياً: لماذا نجحت المنشورات الأعلى تفاعلاً، وكيف نكرر النجاح بمحتوى أصلي.' : 'Produce a practical report explaining why the top posts won and how to repeat it with original content.',
  });
  const body = {
    model: provider.model,
    temperature: 0.3,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
  };
  let response;
  try {
    response = await requestJson(chatEndpoint(provider.baseUrl), 'POST', { Authorization: `Bearer ${settings.articleApiKey}` }, body);
  } catch (error) {
    const message = String(error.message || '').toLowerCase();
    if (message.includes('response_format') || message.includes('json')) {
      delete body.response_format;
      response = await requestJson(chatEndpoint(provider.baseUrl), 'POST', { Authorization: `Bearer ${settings.articleApiKey}` }, body);
    } else {
      throw new Error(ProviderCompatibilityContract.diagnostic(error.message));
    }
  }
  const content = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
  let report;
  try {
    report = JSON.parse(stripCodeFence(content));
  } catch {
    report = { headline: language === 'ar' ? 'تقرير' : 'Report', executiveSummary: String(content || '') };
  }
  return { ok: true, report, language };
}

module.exports = {
  viralKeywords,
  testArticleApi,
  requestArticleCompletion,
  generate,
  analyzeSocialKeywords,
  analyzePinterestKeywords,
  feedspyReport,
  articleResponseFormat,
  PROMPT_DEFAULTS,
};

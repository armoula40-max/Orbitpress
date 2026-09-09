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
    required: ['title', 'metaDescription', 'slug', 'contentType', 'categoryName', 'outline', 'htmlContent', 'internalLinks', 'recipe', 'recipes', 'pinterest'],
    additionalProperties: false,
  };
  return { type: 'json_schema', json_schema: { name: 'askinz_niche_article', strict: true, schema } };
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
  const provider = ProviderCompatibilityContract.normalize(settings.articleBaseUrl, settings.articleModel);
  const endpoint = chatEndpoint(provider.baseUrl);
  const prompt = buildPrompt({ keyword, niche, requestedType, category, keywords, titleList, requestedRecipeCount, customizedTextPrompt });

  const body = {
    model: provider.model,
    max_tokens: provider.maxOutputTokens,
    messages: [
      { role: 'system', content: "You are Askinz's exacting English content editor and SEO strategist. Adapt vocabulary, examples, safety guidance, and expertise to the requested niche. Produce genuinely helpful original content for practical search intent; use cooking rules only when the requested niche and keyword are genuinely food-related. Never fabricate reviews, ratings, citations, testing, nutrition, provenance, medical advice, or ranking promises. Write natural English, not keyword repetition. Use only semantic HTML allowed in a WordPress post body." },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    response_format: articleResponseFormat(),
  };
  const headers = { Authorization: `Bearer ${settings.articleApiKey}` };
  let response;
  try {
    response = await requestJson(endpoint, 'POST', headers, body);
  } catch (error) {
    const message = String(error.message || '').toLowerCase();
    if (!(message.includes('response_format') || message.includes('json_schema') || message.includes('unsupported'))) {
      throw new Error(ProviderCompatibilityContract.diagnostic(error.message));
    }
    delete body.response_format;
    response = await requestJson(endpoint, 'POST', headers, body);
  }
  const content = response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content;
  const json = stripCodeFence(content);
  let draft = DraftContract.normalize(JSON.parse(json), category);
  if (requestedRecipeCount > 0 && !LongFormCompletenessContract.validate(draft, requestedRecipeCount).valid) {
    const issue = LongFormCompletenessContract.validate(draft, requestedRecipeCount).reason;
    const repairPrompt = prompt + `\nCRITICAL COMPLETENESS REPAIR: return exactly ${requestedRecipeCount} fully populated objects in recipes[]. Do not return a summary, names only, or a single recipe. Every object must include a title, description, at least 4 ingredients with quantities, prep time, cook time, yield, 4 to 9 numbered instructions, and at least one useful note. The collection body must be long and detailed. Previous output problem: ${issue}`;
    const repairBody = {
      ...body,
      messages: [
        { role: 'system', content: 'You are a strict recipe-roundup completion editor. Never summarize requested recipes; return every complete recipe.' },
        { role: 'user', content: repairPrompt },
      ],
    };
    const repairedResponse = await requestJson(endpoint, 'POST', headers, repairBody);
    const repairedContent = repairedResponse.choices && repairedResponse.choices[0] && repairedResponse.choices[0].message && repairedResponse.choices[0].message.content;
    draft = DraftContract.normalize(JSON.parse(stripCodeFence(repairedContent)), category);
    const completeness = LongFormCompletenessContract.validate(draft, requestedRecipeCount);
    if (!completeness.valid) {
      throw new Error(`The Article API returned incomplete long-form output: ${completeness.reason}. Please retry with a provider that supports structured long-form output.`);
    }
  }
  return { ok: true, draft };
}

function buildPrompt({ keyword, niche, requestedType, category, keywords, titleList, requestedRecipeCount, customizedTextPrompt }) {
  return `
    Write one complete English article draft for the website's "${niche}" niche.

    Primary keyword: ${keyword}
    Requested format: ${requestedType}${requestedRecipeCount > 0 ? ` (must deliver exactly ${requestedRecipeCount} full recipes in recipes[])` : ''}
    Preferred WordPress category: ${category || 'let the editor choose'}
    Queued related keywords to avoid overlapping: ${keywords.join(', ') || 'None'}
    Existing site titles to avoid duplicating: ${titleList || 'None supplied'}

    Return valid JSON only with this exact structure:
    {"title":"","metaDescription":"","slug":"","contentType":"recipe|article","categoryName":"","outline":[{"heading":"","keyPoints":[""]}],"htmlContent":"","internalLinks":[{"anchor":"","reason":""}],"recipe":{"isRecipe":false,"description":"","prepTime":"","cookTime":"","totalTime":"","recipeYield":"","cuisine":"","ingredients":[],"instructions":[{"name":"","text":""}],"notes":[]},"recipes":[{"title":"","isRecipe":true,"description":"","prepTime":"","cookTime":"","totalTime":"","recipeYield":"","cuisine":"","ingredients":[""],"instructions":[{"name":"","text":""}],"notes":[""]}],"pinterest":{"title":"","altText":""}}

    Requirements:
    - Infer practical search intent, create a distinct title, a concise meta description under 160 characters, and a lower-case canonical-friendly slug.
    - Provide 3 to 6 outline H2 sections. htmlContent starts with a concise benefit-led introduction, uses H2 sections, and provides useful substitutions, storage, or variations where appropriate.
    - For food content or an explicit recipe keyword, select recipe only when it is genuinely a cookable dish. Otherwise select article.
    - For a cookable dish, recipe must contain sensible ingredients, 4 to 9 concrete steps, ISO 8601 durations such as PT15M, yield, cuisine, and 1 to 3 useful notes. Do not put a recipe card inside htmlContent.
    - For non-food niches such as crochet, pets, nails, furniture, home decor, DIY, beauty, or gardening, select article; recipe.isRecipe must be false, recipes must be empty, and provide practical niche-specific steps, materials, safety notes, maintenance, or buying guidance as appropriate.
    - Offer 2 to 4 internal-link anchor suggestions but never invent URLs.
    - Create only a concise natural Pinterest SEO title and image alt text. Do not create a Pinterest description or hashtags.
    - Do not include Markdown, CSS, scripts, iframes, ratings, reviews, calories, nutrition values, image URLs, medical claims, citations, affiliate claims, ranking promises, or unsupported facts.
    ${customizedTextPrompt ? `\nCUSTOM EDITOR PROMPT (follow it when compatible with the required JSON contract):\n${customizedTextPrompt}` : ''}
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
  const system = `You are a ${platform} content analyst. Analyze only the supplied posts. Return strict JSON with keys summary, reason, primaryKeywords, longTailKeywords, relatedKeywords, topics, winningPhrases, searchIntent, titlePatterns, contentAngles. Keep extracted keywords separate from AI suggestions. Do not copy a post verbatim.`;
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
    report = { summary: content, primaryKeywords: [] };
  }
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
  const system = language === 'ar'
    ? 'أنت محرر SEO. لكل منشور مرقق، اقترح كلمة مفتاحية بحثية واحدة دقيقة وزاوية كتابة واضحة ونوع المحتوى (recipe أو article). أعد JSON صارماً: {"items":[{"id":"...","keyword":"...","angle":"...","contentType":"recipe|article"}]}. لا تنسخ عنوان المنشور حرفياً.'
    : 'You are an SEO editor. For each supplied post propose exactly one precise search keyword, a writing angle and the content type (recipe or article). Return strict JSON: {"items":[{"id":"...","keyword":"...","angle":"...","contentType":"recipe|article"}]}. Never copy the post title verbatim.';
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
  const system = language === 'ar'
    ? 'أنت محلل محتوى اجتماعي خبير بأسلوب FeedSpy. حلّل المنشورات المرفقة فقط مع كتلة الإحصاءات. أعد JSON صارماً بالمفاتيح: headline, executiveSummary, viralPatterns, primaryKeywords, longTailKeywords, topics, winningPhrases, bestTimeAdvice, contentAngles, competitorWatch, planOfAction. كل القيم نصوص عربية واضحة، والقوائم مصفوفات نصية. لا تنسخ المنشورات حرفياً. ركّز على ما قاده التفاعل العالي عملياً.'
    : 'You are an expert FeedSpy-style social content analyst. Analyze only the supplied posts and the stats block. Return strict JSON with keys: headline, executiveSummary, viralPatterns, primaryKeywords, longTailKeywords, topics, winningPhrases, bestTimeAdvice, contentAngles, competitorWatch, planOfAction. Lists are plain string arrays. Never copy a post verbatim.';
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
  generate,
  analyzeSocialKeywords,
  analyzePinterestKeywords,
  feedspyReport,
  articleResponseFormat,
};

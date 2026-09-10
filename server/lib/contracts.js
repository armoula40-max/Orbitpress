'use strict';
/**
 * contracts.js — JavaScript port of the OrbitPress Android Kotlin contracts.
 *
 * Sources ported (app/src/main/java/com/askinz/publisher/):
 *  - DraftContract.kt
 *  - PublishingContracts.kt (Publishing / PostStatus / Seo / Keyword / Preflight / Schedule)
 *  - WordPressMarkup.kt
 *  - MediaPublishingContract.kt
 *  - CategorySyncContracts.kt
 *  - LongFormCompletenessContract.kt
 *  - RecipeRequestContract.kt
 *  - ProviderCompatibilityContract.kt
 *  - SettingsPersistenceContract.kt
 *
 * The functions intentionally keep the same error messages and limits so the
 * web server validates exactly like the Android app.
 */

// ---------------------------------------------------------------------------
// DraftContract
// ---------------------------------------------------------------------------
const BLOCKED_BLOCKS = /<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi;
const EVENT_HANDLERS = /\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const JAVASCRIPT_URLS = /\s(?:href|src)\s*=\s*(?:"\s*javascript:[^"]*|'\s*javascript:[^']*'|javascript:[^\s>]+)/gi;

function cleanSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 220);
}

function sanitizeHtml(value) {
  return String(value || '')
    .replace(BLOCKED_BLOCKS, '')
    .replace(EVENT_HANDLERS, '')
    .replace(JAVASCRIPT_URLS, '')
    .trim();
}

function removeDuplicateRecipeSections(htmlContent) {
  const html = String(htmlContent || '');
  const recipeSection = /<h2\b[^>]*>\s*(?:ingredients|instructions|directions|method|how\s+to\s+(?:make|cook)[^<]*)\s*<\/h2>[\s\S]*?(?=<h2\b|$)/gi;
  const cardMatch = html.match(/<section\b[^>]*data-recipe-card\s*=\s*["']true["']/i);
  const cardStart = cardMatch ? html.indexOf(cardMatch[0]) : -1;
  const beforeCard = cardStart >= 0 ? html.slice(0, cardStart) : html;
  const cardAndAfter = cardStart >= 0 ? html.slice(cardStart) : '';
  return (beforeCard.replace(recipeSection, '').replace(/\n{3,}/g, '\n\n').trim() + cardAndAfter).trim();
}

function optArr(v) { return Array.isArray(v) ? v : []; }
function optObj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }
function optStr(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }
function take(s, n) { return String(s).slice(0, n); }

const DraftContract = {
  cleanSlug,
  sanitizeHtml,
  removeDuplicateRecipeSections,

  normalize(raw, selectedCategory) {
    const title = optStr(raw.title).trim().slice(0, 255);
    if (!title) throw new Error('The article model returned no title.');
    const requestedContentType = raw.contentType === 'recipe' ? 'recipe' : 'article';
    const articleHtml = sanitizeHtml(raw.htmlContent);
    if (!articleHtml) throw new Error('The article model returned no article body.');
    const slug = cleanSlug(raw.slug || title);
    if (!slug) throw new Error('The article model returned an invalid slug.');

    const recipes = normalizeRecipes(raw.recipes);
    const contentType = recipes.length > 0 ? 'article' : requestedContentType;
    const recipe = normalizeRecipe(raw.recipe, contentType);
    if (contentType === 'recipe') {
      if (!recipe.isRecipe) throw new Error('Recipe content was missing recipe details.');
      if (!(recipe.ingredients.length > 0 && recipe.instructions.length >= 4 && recipe.instructions.length <= 9)) {
        throw new Error('Recipe content was incomplete.');
      }
    }
    recipes.forEach((item, index) => {
      if (!item.isRecipe) throw new Error(`Recipe ${index + 1} was missing recipe details.`);
      if (!(item.ingredients.length > 0 && item.instructions.length >= 4 && item.instructions.length <= 9)) {
        throw new Error(`Recipe ${index + 1} was incomplete.`);
      }
    });
    const pinterestSource = optObj(raw.pinterest);
    let pinterestTitle = (pinterestSource ? optStr(pinterestSource.title).trim().slice(0, 100) : '') || title.slice(0, 100);
    let pinterestAltText = (pinterestSource ? optStr(pinterestSource.altText).trim().slice(0, 320) : '') || title.slice(0, 320);
    const category = (String(selectedCategory || '').trim() || optStr(raw.categoryName).trim()).slice(0, 120);

    const draft = {
      id: `draft-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      title,
      metaDescription: optStr(raw.metaDescription).trim().slice(0, 160),
      slug,
      contentType,
      categoryName: category,
      outline: normalizeOutline(raw.outline),
      internalLinks: normalizeInternalLinks(raw.internalLinks),
      recipe,
      recipes,
      pinterest: { title: pinterestTitle, altText: pinterestAltText },
      pinterestTitle,
      pinterestAltText,
      generationStatus: 'ready',
      createdAt: Date.now(),
    };
    draft.htmlContent = renderArticle(articleHtml, title, contentType === 'recipe', recipe, recipes);
    draft.schema = DraftContract.buildSchema(draft, null, []);
    return draft;
  },

  buildSchema(draft, canonicalUrl, imageUrls) {
    const result = {
      '@context': 'https://schema.org',
      name: optStr(draft.title),
      description: optStr(draft.metaDescription),
      author: { '@type': 'Organization', name: 'Askinz', url: 'https://askinz.com' },
    };
    if (canonicalUrl && String(canonicalUrl).trim()) {
      result.mainEntityOfPage = { '@type': 'WebPage', '@id': canonicalUrl };
    }
    if (imageUrls && imageUrls.length) result.image = imageUrls;
    const recipes = optArr(draft.recipes);
    if (recipes.length > 0) {
      result.hasPart = recipes.map((r) => recipeSchema(r));
      result['@type'] = 'Article';
      result.headline = optStr(draft.title);
      return result;
    }
    if (optStr(draft.contentType) === 'recipe') {
      const recipe = optObj(draft.recipe) || {};
      result['@type'] = 'Recipe';
      result.recipeCategory = optStr(draft.categoryName);
      result.recipeCuisine = optStr(recipe.cuisine);
      result.prepTime = optStr(recipe.prepTime);
      result.cookTime = optStr(recipe.cookTime);
      result.totalTime = optStr(recipe.totalTime);
      result.recipeYield = optStr(recipe.recipeYield);
      result.recipeIngredient = optArr(recipe.ingredients);
      result.recipeInstructions = optArr(recipe.instructions).map((step) => ({
        '@type': 'HowToStep',
        name: optStr(step && step.name),
        text: optStr(step && step.text),
      }));
    } else {
      result['@type'] = 'Article';
      result.headline = optStr(draft.title);
    }
    return result;
  },
};

function recipeSchema(recipe) {
  return {
    '@type': 'Recipe',
    name: optStr(recipe.title),
    description: optStr(recipe.description),
    prepTime: optStr(recipe.prepTime),
    cookTime: optStr(recipe.cookTime),
    totalTime: optStr(recipe.totalTime),
    recipeYield: optStr(recipe.recipeYield),
    recipeCuisine: optStr(recipe.cuisine),
    recipeIngredient: optArr(recipe.ingredients),
    recipeInstructions: optArr(recipe.instructions).map((step) => ({
      '@type': 'HowToStep',
      name: optStr(step && step.name),
      text: optStr(step && step.text),
    })),
  };
}

function normalizeRecipes(source) {
  const result = [];
  optArr(source).slice(0, 12).forEach((sourceRecipe, index) => {
    if (!optObj(sourceRecipe)) return;
    const recipe = normalizeRecipe(sourceRecipe, 'recipe');
    recipe.title = optStr(sourceRecipe.title).trim().slice(0, 255) || `Recipe ${index + 1}`;
    result.push(recipe);
  });
  return result;
}

function normalizeOutline(source) {
  const result = [];
  optArr(source).slice(0, 6).forEach((item) => {
    if (!optObj(item)) return;
    const heading = optStr(item.heading).trim().slice(0, 160);
    if (!heading) return;
    const points = optArr(item.keyPoints)
      .slice(0, 6)
      .map((p) => optStr(p).trim().slice(0, 240))
      .filter(Boolean);
    result.push({ heading, keyPoints: points });
  });
  return result;
}

function normalizeInternalLinks(source) {
  const result = [];
  optArr(source).slice(0, 4).forEach((item) => {
    if (!optObj(item)) return;
    const anchor = optStr(item.anchor).trim().slice(0, 160);
    const reason = optStr(item.reason).trim().slice(0, 260);
    if (anchor && reason) result.push({ anchor, reason });
  });
  return result;
}

function stringArray(source, maxItems, maxLength) {
  const out = [];
  optArr(source).slice(0, maxItems).forEach((value) => {
    const text = optStr(value).trim().slice(0, maxLength);
    if (text) out.push(text);
  });
  return out;
}

function emptyRecipe() {
  return {
    isRecipe: false,
    description: '',
    prepTime: '',
    cookTime: '',
    totalTime: '',
    recipeYield: '',
    cuisine: '',
    ingredients: [],
    instructions: [],
    notes: [],
  };
}

function normalizeRecipe(source, contentType) {
  if (contentType !== 'recipe') return emptyRecipe();
  const recipe = optObj(source) || {};
  const ingredients = stringArray(recipe.ingredients, 30, 260);
  const notes = stringArray(recipe.notes, 3, 360);
  const instructions = [];
  optArr(recipe.instructions).slice(0, 9).forEach((item, index) => {
    if (!optObj(item)) return;
    const name = optStr(item.name).trim().slice(0, 120) || `Step ${index + 1}`;
    const text = optStr(item.text).trim().slice(0, 900);
    if (text) instructions.push({ name, text });
  });
  return {
    isRecipe: true,
    description: optStr(recipe.description).trim().slice(0, 600),
    prepTime: optStr(recipe.prepTime).trim().slice(0, 40),
    cookTime: optStr(recipe.cookTime).trim().slice(0, 40),
    totalTime: optStr(recipe.totalTime).trim().slice(0, 40),
    recipeYield: optStr(recipe.recipeYield).trim().slice(0, 80),
    cuisine: optStr(recipe.cuisine).trim().slice(0, 80),
    ingredients,
    instructions,
    notes,
  };
}

function renderArticle(html, title, isRecipe, recipe, recipes) {
  const parts = [html];
  if (isRecipe) parts.push(renderRecipeCard(title, recipe));
  if (recipes.length > 0) {
    recipes.forEach((item, index) => {
      parts.push(renderRecipeCard(`${index + 1}. ${item.title}`, item));
    });
  }
  return parts.filter((part) => part && part.trim()).join('\n');
}

function esc(s) {
  return optStr(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderRecipeCard(title, recipe) {
  const ingredients = optArr(recipe.ingredients).map((item) => `<li>${esc(item)}</li>`).join('');
  const steps = optArr(recipe.instructions)
    .map((step) => `<li><strong>${esc(step.name)}.</strong> ${esc(step.text)}</li>`)
    .join('');
  const notes = optArr(recipe.notes);
  const notesBlock = notes.length
    ? `<div class="askinz-recipe-notes"><h3>Helpful notes</h3><ul>${notes.map((note) => `<li>${esc(note)}</li>`).join('')}</ul></div>`
    : '';
  return `<section class="askinz-recipe-card" data-recipe-card="true"><h2>${esc(title)}</h2><p>${esc(recipe.description)}</p><div class="askinz-recipe-tools"><span>Prep: ${esc(recipe.prepTime)}</span><span>Cook: ${esc(recipe.cookTime)}</span><span>Total: ${esc(recipe.totalTime)}</span><span>Yield: ${esc(recipe.recipeYield)}</span><span>Cuisine: ${esc(recipe.cuisine)}</span></div><h3>Ingredients</h3><ul>${ingredients}</ul><h3>Instructions</h3><ol>${steps}</ol>${notesBlock}</section>`;
}

// ---------------------------------------------------------------------------
// PublishingContracts / PostStatus / Seo / Keyword / Preflight / Schedule
// ---------------------------------------------------------------------------

const KeywordContract = {
  normalize(value) {
    return optStr(value).trim().replace(/\s+/g, ' ').toLowerCase();
  },
  deduplicate(values) {
    return [...new Set(values.map(KeywordContract.normalize).filter((v) => v.length >= 2 && v.length <= 160))];
  },
};

const PostStatusContract = {
  allowed: new Set(['draft', 'pending', 'publish']),
  normalize(value) {
    const v = optStr(value).trim().toLowerCase() || 'draft';
    if (!this.allowed.has(v)) throw new Error('Unsupported WordPress status.');
    return v;
  },
};

const SeoContract = {
  canonical(value) {
    const v = optStr(value).trim().slice(0, 2048);
    if (v && !v.startsWith('https://')) throw new Error('Canonical URL must use HTTPS.');
    return v;
  },
  text(value, limit) {
    return optStr(value).trim().slice(0, limit);
  },
};

/** Test-only escape hatch: allows http://localhost and http://127.0.0.1 when ORBITPRESS_ALLOW_HTTP=1 (used by the mock test servers). */
function insecureTestUrlAllowed(url) {
  if (process.env.ORBITPRESS_ALLOW_HTTP !== '1') return false;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url);
}

const PublishingContracts = {
  requireHttpsUrl(value, label) {
    const url = optStr(value).trim().replace(/\/+$/, '');
    if (!url.startsWith('https://') && !insecureTestUrlAllowed(url)) throw new Error(`${label} must use HTTPS.`);
    return url;
  },

  /** Real format from magic bytes, or null when the bytes are no supported image. */
  detectImageMimeType(bytes) {
    const detected = detectMimeType(bytes);
    return detected === 'unknown' ? null : detected;
  },

  validatedImageMimeType(declared, bytes) {
    const mime = optStr(declared).toLowerCase();
    const detected = detectMimeType(bytes);
    if (detected === 'unknown') throw new Error('Choose a JPEG, PNG, or WebP image.');
    if (mime && mime !== detected) return detected;
    return detected;
  },

  requireExistingCategoryId(id) {
    if (!(Number(id) > 0)) throw new Error('Choose one of the existing WordPress categories before publishing.');
  },

  normalizePostStatus(value) {
    return PostStatusContract.normalize(value);
  },

  normalizeTags(tags) {
    return KeywordContract.deduplicate(tags).slice(0, 20);
  },

  featuredImageAltText(title, contentType) {
    return contentType === 'recipe' ? `${title} recipe featured image` : `${title} featured image`;
  },

  pinterestImageAltText(pinterestTitle, fallbackTitle) {
    return `${(pinterestTitle || fallbackTitle || '').trim()} Pinterest image`;
  },
};

function detectMimeType(bytes) {
  if (!bytes || bytes.length < 12) return 'unknown';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return 'unknown';
}

const PreflightContract = {
  check(draft, images, categoryId) {
    const errors = [];
    const warnings = [];
    const title = optStr(draft.title).trim();
    const meta = optStr(draft.metaDescription).trim();
    const slug = optStr(draft.slug).trim();
    if (!title) errors.push('Title is required');
    else if (title.length < 20 || title.length > 70) warnings.push('Title length is outside the recommended 20–70 characters');
    if (!meta) errors.push('Meta description is required');
    else if (meta.length > 160) errors.push('Meta description exceeds 160 characters');
    if (!slug) errors.push('Slug is required');
    if (!(Number(categoryId) > 0)) errors.push('An existing WordPress category is required');
    if (!optStr(images.featured)) errors.push('Featured image is required');
    if (!optStr(images.pinterest)) errors.push('Pinterest image is required');
    if (!optStr(draft.htmlContent).includes('application/ld+json') && !optStr(draft.schema)) {
      warnings.push('Structured data could not be confirmed locally');
    }
    const recipe = optObj(draft.recipe);
    if (optStr(draft.contentType) === 'recipe' && !(recipe && optArr(recipe.instructions).length >= 4 && optArr(recipe.instructions).length <= 9)) {
      errors.push('Recipe instructions must contain 4–9 steps');
    }
    return { errors, warnings, valid: errors.length === 0 };
  },
};

const ScheduleContract = {
  validate(delayMinutes, operation) {
    if (!['generate', 'publish'].includes(operation)) throw new Error('Unsupported scheduled operation.');
    if (!(delayMinutes >= 1 && delayMinutes <= 43200)) throw new Error('Schedule delay must be between 1 minute and 30 days.');
    return delayMinutes;
  },
};

// ---------------------------------------------------------------------------
// WordPressMarkup
// ---------------------------------------------------------------------------
const WordPressMarkup = {
  featuredImage(url, altText) {
    return `<figure class="wp-block-image size-large"><img src="${esc(url)}" alt="${esc(altText)}" /></figure>`;
  },
  pinterestSaveButton(shareUrl) {
    return `<p data-askinz-pinterest-direct="true"><a href="${esc(shareUrl)}" target="_blank" rel="noopener">Save on Pinterest</a></p>`;
  },
  structuredData(json) {
    return `<script type="application/ld+json">${json}</script>`;
  },
};

// ---------------------------------------------------------------------------
// MediaPublishingContract
// ---------------------------------------------------------------------------
const MediaPublishingContract = {
  requirePinterestRatio(width, height) {
    if (!(width > 0 && height > 0 && width * 3 === height * 2)) {
      throw new Error('Pinterest image must use an exact 2:3 portrait ratio.');
    }
  },
  normalizePrompt(prompt) {
    const value = optStr(prompt).trim().slice(0, 2048);
    if (value.length < 5) throw new Error('Image prompt must contain at least 5 characters.');
    return value;
  },
  normalizePinterestLink(link) {
    const value = optStr(link).trim();
    if (!value.startsWith('https://')) throw new Error('Pinterest links must use HTTPS.');
    return value.slice(0, 2048);
  },
};

// ---------------------------------------------------------------------------
// CategorySyncContracts
// ---------------------------------------------------------------------------
const CategorySyncContracts = {
  normalize(items) {
    const seen = new Set();
    return items
      .filter((item) => item && item.id > 0 && optStr(item.name).trim())
      .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
      .sort((a, b) => String(a.name).toLowerCase().localeCompare(String(b.name).toLowerCase()));
  },
};

// ---------------------------------------------------------------------------
// LongFormCompletenessContract
// ---------------------------------------------------------------------------
const LongFormCompletenessContract = {
  validate(draft, expectedCount) {
    const ok = (reason) => ({ valid: !reason, reason: reason || '' });
    if (expectedCount <= 0) return ok('');
    const recipes = optArr(draft.recipes);
    if (!Array.isArray(draft.recipes)) return ok('recipes[] is missing');
    if (recipes.length !== expectedCount) return ok(`Expected ${expectedCount} recipes but received ${recipes.length}`);
    const bodyWords = optStr(draft.htmlContent).replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
    const minimumWords = Math.max(220, expectedCount * 55);
    if (bodyWords < minimumWords) return ok(`The roundup body is too short (${bodyWords} words; minimum ${minimumWords})`);
    for (let index = 0; index < recipes.length; index += 1) {
      const recipe = optObj(recipes[index]);
      if (!recipe) return ok(`Recipe ${index + 1} is not an object`);
      if (!recipe.isRecipe) return ok(`Recipe ${index + 1} is not marked as a recipe`);
      if (!optStr(recipe.title).trim()) return ok(`Recipe ${index + 1} has no title`);
      if (!optStr(recipe.description).trim()) return ok(`Recipe ${index + 1} has no description`);
      if (!optStr(recipe.prepTime).trim() || !optStr(recipe.cookTime).trim()) return ok(`Recipe ${index + 1} is missing timing`);
      if (!optStr(recipe.recipeYield).trim()) return ok(`Recipe ${index + 1} is missing yield`);
      if (optArr(recipe.ingredients).length < 4) return ok(`Recipe ${index + 1} needs at least 4 ingredients`);
      const instructions = optArr(recipe.instructions).length;
      if (instructions < 4 || instructions > 9) return ok(`Recipe ${index + 1} needs 4 to 9 instructions`);
      if (optArr(recipe.notes).length === 0) return ok(`Recipe ${index + 1} needs at least one note`);
    }
    return ok('');
  },
};

// ---------------------------------------------------------------------------
// RecipeRequestContract
// ---------------------------------------------------------------------------
const RecipeRequestContract = {
  requestedCount(keyword) {
    const numbered = /\b(\d{1,2})\s+(?:[a-z-]+\s+){0,3}recipes?\b/i.exec(String(keyword || ''));
    if (numbered) return Math.min(12, Math.max(2, parseInt(numbered[1], 10)));
    return /recipe\s+roundup|multiple\s+recipes|recipes\s+and\s+recipes/i.test(String(keyword || '')) ? 2 : 0;
  },
};

// ---------------------------------------------------------------------------
// ProviderCompatibilityContract
// ---------------------------------------------------------------------------
const ProviderCompatibilityContract = {
  StructuredMode: { JSON_SCHEMA: 'JSON_SCHEMA', JSON_OBJECT_FALLBACK: 'JSON_OBJECT_FALLBACK', PLAIN_JSON_REPAIR: 'PLAIN_JSON_REPAIR' },

  normalize(baseUrl, model, mode) {
    const structuredMode = mode || this.StructuredMode.JSON_SCHEMA;
    const normalizedUrl = optStr(baseUrl).trim().replace(/\/+$/, '');
    if (!normalizedUrl.startsWith('https://') && !insecureTestUrlAllowed(normalizedUrl)) throw new Error('Article API URL must use HTTPS.');
    const normalizedModel = optStr(model).trim().slice(0, 160);
    if (!normalizedModel) throw new Error('Article API model is required.');
    return {
      baseUrl: normalizedUrl,
      model: normalizedModel,
      mode: structuredMode,
      maxOutputTokens: structuredMode === this.StructuredMode.JSON_SCHEMA ? 12000 : 10000,
    };
  },

  modeForError(message) {
    const value = String(message || '').toLowerCase();
    if (value.includes('json_schema') || value.includes('response_format') || value.includes('unsupported')) {
      return this.StructuredMode.JSON_OBJECT_FALLBACK;
    }
    if (value.includes('context') || value.includes('maximum') || value.includes('token') || value.includes('length')) {
      return this.StructuredMode.PLAIN_JSON_REPAIR;
    }
    return this.StructuredMode.JSON_SCHEMA;
  },

  diagnostic(message) {
    const value = String(message || '').toLowerCase();
    if (value.includes('json_schema') || value.includes('response_format')) {
      return 'This provider does not support JSON Schema; OrbitPress will retry with a compatible structured-output mode.';
    }
    if (value.includes('context') || value.includes('maximum') || value.includes('token') || value.includes('length')) {
      return 'The provider output limit is too small for this long article; reduce the recipe count or choose a larger-context model.';
    }
    if (value.includes('401') || value.includes('403') || value.includes('unauthorized')) {
      return 'The Article API rejected the key; verify the provider key and permissions.';
    }
    if (value.includes('404')) {
      return 'The Article API endpoint or model was not found; verify the base URL and model.';
    }
    return 'The Article API returned an unexpected response; retry after checking the provider settings.';
  },
};

// ---------------------------------------------------------------------------
// SettingsPersistenceContract
// ---------------------------------------------------------------------------
const SettingsPersistenceContract = {
  DEFAULT_SITE_ID: 'site-default',

  canonicalSiteId(rawSiteId) {
    return optStr(rawSiteId).trim() || this.DEFAULT_SITE_ID;
  },

  merge(existing, incoming) {
    const merged = JSON.parse(JSON.stringify(existing || {}));
    [
      'articleBaseUrl', 'articleModel', 'wordpressBaseUrl', 'wordpressUsername', 'categoryId',
      'imageProvider', 'imageBaseUrl', 'imageAccountId', 'imageModel', 'pinterestBoardId',
      'facebookAppId', 'facebookGraphVersion', 'pinterestClientId', 'pinterestRedirectUri',
      'textPrompt', 'imagePrompt', 'pinterestPrompt', 'articleImageCount', 'scraperApiBaseUrl',
    ].forEach((key) => {
      merged[key] = optStr(incoming[key]).trim();
    });
    ['articleApiKey', 'wordpressAppPassword', 'imageApiToken', 'pinterestAccessToken', 'facebookAccessToken', 'scraperApiKey'].forEach((key) => {
      const value = optStr(incoming[key]).trim();
      if (value) merged[key] = value;
    });
    // Multiple Pinterest background-prompt templates (name + prompt), kept
    // distinct from the legacy single pinterestPrompt string.
    if (Array.isArray(incoming.pinterestPrompts)) {
      merged.pinterestPrompts = incoming.pinterestPrompts
        .map((item) => ({
          name: optStr(item && item.name).trim().slice(0, 80),
          prompt: optStr(item && item.prompt).trim().slice(0, 4000),
        }))
        .filter((item) => item.prompt)
        .slice(0, 20);
    }
    return merged;
  },

  isConfigured(settings) {
    return ['articleBaseUrl', 'articleModel', 'articleApiKey', 'wordpressBaseUrl', 'wordpressUsername', 'wordpressAppPassword']
      .every((key) => optStr(settings[key]).trim());
  },
};

module.exports = {
  DraftContract,
  PublishingContracts,
  PostStatusContract,
  SeoContract,
  KeywordContract,
  PreflightContract,
  ScheduleContract,
  WordPressMarkup,
  MediaPublishingContract,
  CategorySyncContracts,
  LongFormCompletenessContract,
  RecipeRequestContract,
  ProviderCompatibilityContract,
  SettingsPersistenceContract,
};

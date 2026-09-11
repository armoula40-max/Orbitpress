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
  const cardMatch = html.match(/<(?:section|div)\b[^>]*(?:data-recipe-card\s*=\s*["']true["']|class\s*=\s*["'][^"']*askinz-recipe-card)/i);
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

function textLooksArabic(value) {
  return /[\u0600-\u06FF]/.test(String(value || ''));
}

/**
 * Recipe card rendered with FULLY INLINE styles and kses-safe tags (div, h2,
 * h3, p, ul, ol, li, span). The old <section class="askinz-recipe-card">
 * depended on CSS that only exists inside the app, so on WordPress it showed
 * up as unstyled text and, for roles without unfiltered_html, the <section>
 * wrapper was stripped entirely. Inline styles make the card render identically
 * on every theme and survive wp_kses_post. Labels follow the content language.
 */
function renderRecipeCard(title, recipe) {
  const ingredients = optArr(recipe.ingredients);
  const instructions = optArr(recipe.instructions);
  const notes = optArr(recipe.notes);
  const languageSample = [title, recipe.description, ingredients.join(' '), notes.join(' '),
    instructions.map((s) => `${s && s.name || ''} ${s && s.text || ''}`).join(' ')].join(' ');
  const ar = textLooksArabic(languageSample);
  const labels = ar
    ? { prep: 'تحضير', cook: 'طهي', total: 'الإجمالي', yield: 'الكمية', cuisine: 'المطبخ', ingredients: 'المكوّنات', instructions: 'طريقة التحضير', notes: 'ملاحظات مفيدة' }
    : { prep: 'Prep', cook: 'Cook', total: 'Total', yield: 'Yield', cuisine: 'Cuisine', ingredients: 'Ingredients', instructions: 'Instructions', notes: 'Helpful notes' };
  const GREEN = '#2f6b4f';
  const CREAM = '#fffaf2';
  const chips = [
    [labels.prep, recipe.prepTime],
    [labels.cook, recipe.cookTime],
    [labels.total, recipe.totalTime],
    [labels.yield, recipe.recipeYield],
    [labels.cuisine, recipe.cuisine],
  ].filter(([, value]) => String(value || '').trim());
  const chipHtml = chips.map(([label, value]) =>
    `<span style="display:inline-block;background:#eef4ea;color:${GREEN};border-radius:999px;padding:5px 13px;margin:3px 6px 3px 0;font-size:13px;font-weight:700;">${esc(label)}: ${esc(value)}</span>`).join('');
  const ingredientsHtml = ingredients.map((item) =>
    `<li style="margin:0 0 7px;line-height:1.6;">${esc(item)}</li>`).join('');
  const stepsHtml = instructions.map((step) => {
    const generatedName = /^step\s*\d+$/i.test(String(step.name || '').trim());
    const name = step.name && !generatedName ? `<strong style="color:${GREEN};">${esc(step.name)}: </strong>` : '';
    return `<li style="margin:0 0 9px;line-height:1.65;">${name}${esc(step.text)}</li>`;
  }).join('');
  const notesHtml = notes.length
    ? `<div style="margin-top:16px;background:#f6efdf;border:1px solid #eadfc4;border-radius:12px;padding:12px 16px;"><strong style="display:block;margin-bottom:6px;color:#7a5a1d;">${esc(labels.notes)}</strong><ul style="margin:0;padding-left:22px;">${notes.map((note) => `<li style="margin:0 0 6px;line-height:1.6;">${esc(note)}</li>`).join('')}</ul></div>`
    : '';
  return `<div class="askinz-recipe-card" data-recipe-card="true" style="direction:${ar ? 'rtl' : 'ltr'};text-align:${ar ? 'right' : 'left'};margin:34px 0;border:2px solid #e4d5bd;border-radius:18px;overflow:hidden;background:${CREAM};color:#2c2a26;">
<div style="background:${GREEN};padding:18px 22px;">
<h2 style="margin:0;color:#ffffff;font-size:24px;line-height:1.35;">${esc(title)}</h2>
${recipe.description ? `<p style="margin:7px 0 0;color:#e6f1ea;font-size:14px;line-height:1.6;">${esc(recipe.description)}</p>` : ''}
</div>
<div style="padding:18px 22px 20px;">
${chipHtml ? `<p style="margin:0 0 6px;">${chipHtml}</p>` : ''}
${ingredientsHtml ? `<h3 style="margin:16px 0 9px;color:${GREEN};font-size:19px;">${esc(labels.ingredients)}</h3><ul style="margin:0;padding-${ar ? 'right' : 'left'}:24px;">${ingredientsHtml}</ul>` : ''}
${stepsHtml ? `<h3 style="margin:18px 0 9px;color:${GREEN};font-size:19px;">${esc(labels.instructions)}</h3><ol style="margin:0;padding-${ar ? 'right' : 'left'}:24px;">${stepsHtml}</ol>` : ''}
${notesHtml}
</div>
</div>`;
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
const INLINE_ROLE_ORDER = ['hero', 'ingredients', 'preparation', 'cooking', 'detail', 'lifestyle'];
const INLINE_ROLE_LABELS = {
  hero: 'finished result',
  ingredients: 'ingredients and materials laid out',
  preparation: 'preparation in progress',
  cooking: 'making and cooking process',
  detail: 'close-up detail',
  lifestyle: 'serving and lifestyle view',
};
// Heading keywords (English, Arabic, French) that identify where each shot
// belongs inside the article body. h3 anchors match the generated recipe
// card (Ingredients / Instructions headings).
const INLINE_ANCHORS = [
  { role: 'ingredients', h3: true, patterns: ['ingredient', 'what you need', 'what you’ll need', 'materials', 'supplies', 'tools', 'equipment', 'gather your', 'shopping list', 'مكونات', 'مقادير', 'المواد', 'الأدوات', 'fourniture', 'matériel', 'ingrédient'] },
  { role: 'preparation', h3: false, patterns: ['preparation', 'before you begin', 'getting ready', 'mise en place', 'get started', 'set up', 'setup', 'prep ', 'التحضير', 'préparation'] },
  { role: 'cooking', h3: true, patterns: ['instructions', 'directions', 'method', 'steps', 'how to', 'cook', 'bake', 'assembly', 'assemble', 'making', 'make it', 'الخطوات', 'الطريقة', 'الطبخ', 'cuisson', 'étapes', 'réalisation'] },
  { role: 'detail', h3: false, patterns: ['pro tip', 'expert tip', 'tips', 'technique', 'texture', 'troubleshoot', 'faq', 'frequently asked', 'notes', 'نصائح', 'ملاحظات', 'conseils', 'astuces'] },
  { role: 'lifestyle', h3: false, patterns: ['serve', 'serving', 'storage', 'store', 'freeze', 'make ahead', 'final', 'conclusion', 'enjoy', 'presentation', 'plating', 'التقديم', 'الحفظ', 'التخزين', 'service', 'conservation', 'dégustation'] },
];

function headingStripText(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

const WordPressMarkup = {
  featuredImage(url, altText) {
    return `<figure class="wp-block-image size-large"><img src="${esc(url)}" alt="${esc(altText)}" /></figure>`;
  },
  /**
   * Places each additional image next to the section it illustrates instead
   * of appending every image at the end. Images arrive in role order
   * (hero, ingredients, preparation, cooking, detail, lifestyle, ...): the
   * hero follows the intro; role shots anchor to matching headings (incl. the
   * recipe card's h3 Ingredients / Instructions); anything unmatched is
   * spread evenly so pictures never cluster in one spot.
   */
  placeInlineImages(html, figures) {
    const content = String(html || '');
    const items = (Array.isArray(figures) ? figures : []).filter((f) => f && f.html);
    if (!items.length) return content;
    const headings = [];
    const headingRe = /<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
    let match;
    while ((match = headingRe.exec(content)) !== null) {
      headings.push({ index: match.index, end: match.index + match[0].length, level: Number(match[1]), text: headingStripText(match[2]) });
    }
    const cardMatch = content.match(/<(?:section|div)\b[^>]*(?:data-recipe-card\s*=\s*["']true["']|class\s*=\s*["'][^"']*askinz-recipe-card)/i);
    const cardStart = cardMatch ? cardMatch.index : content.length;
    const claimed = new Set();
    const insertions = [];
    const insertAt = (pos, figure) => {
      const key = Math.max(0, Math.min(content.length, Math.round(pos)));
      if (claimed.has(key)) return false;
      claimed.add(key);
      insertions.push({ pos: key, html: figure.html });
      return true;
    };
    const matchesAnchor = (heading, patterns) => patterns.some((p) => heading.text.includes(p)) ||
      patterns.some((p) => /^[a-z ]{2,}$/.test(p) && new RegExp(`\\b${p.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(heading.text));

    items.forEach((figure, figureIndex) => {
      const role = figure.role || INLINE_ROLE_ORDER[figureIndex % INLINE_ROLE_ORDER.length];
      if (role === 'hero' && headings.length) {
        // Right after the benefit-led introduction, before the first H2.
        if (insertAt(headings[0].index, figure)) return;
      }
      const anchor = INLINE_ANCHORS.find((a) => a.role === role);
      if (anchor) {
        const found = headings.find((h) => !claimed.has(h.end)
          && (anchor.h3 || h.level === 2) && h.text && matchesAnchor(h, anchor.patterns));
        if (found && insertAt(found.end, figure)) return;
      }
      figure.unplaced = true;
    });

    // Generic slots: end of intro, after each H2 heading outside the recipe
    // card, and the end of the content.
    const slots = [
      headings[0] ? headings[0].index : content.length,
      ...headings.filter((h) => h.level === 2 && h.index < cardStart).map((h) => h.end),
      content.length,
    ].map((pos) => Math.round(pos)).sort((a, b) => a - b).filter((pos, i, arr) => i === 0 || pos !== arr[i - 1]);
    const freeSlots = slots.filter((pos) => !claimed.has(pos));
    const forceInsert = (pos, figure) => {
      const key = Math.max(0, Math.round(pos));
      claimed.add(key);
      insertions.push({ pos: key, html: figure.html });
    };
    const unplaced = items.filter((f) => f.unplaced);
    let tailOffset = 0;
    unplaced.forEach((figure, k) => {
      if (!freeSlots.length) { forceInsert(content.length + tailOffset, figure); tailOffset += figure.html.length; return; }
      const slotIndex = Math.min(freeSlots.length - 1, Math.floor((k + 0.5) * freeSlots.length / unplaced.length));
      if (insertAt(freeSlots[slotIndex], figure)) return;
      forceInsert(content.length + tailOffset, figure);
      tailOffset += figure.html.length;
    });

    return insertions.sort((a, b) => b.pos - a.pos)
      .reduce((html, ins) => html.slice(0, ins.pos) + ins.html + html.slice(ins.pos), content);
  },
  inlineRoleAltTitle(title, role) {
    const label = INLINE_ROLE_LABELS[role] ? `, ${INLINE_ROLE_LABELS[role]}` : '';
    return `${title || 'Article'}${label}`;
  },
  inlineRoleOrder() { return INLINE_ROLE_ORDER.slice(); },
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
      'articleSystemPrompt', 'analyzerPrompt', 'viralPrompt', 'feedspyPrompt',
      'recipeRepairSystemPrompt', 'recipeRepairPrompt',
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
    // Ordered shot prompts for the additional in-article images, one set per
    // niche: { food: [...rows], crochet: [...rows], '*': [...] }. The '*' key
    // is a generic fallback; an empty object resets every niche to the
    // built-in role tables. Legacy arrays migrate as the generic fallback.
    const sanitizeShotRows = (rows) => (Array.isArray(rows) ? rows : [])
      .map((item) => ({
        name: optStr(item && item.name).trim().slice(0, 80),
        prompt: optStr(item && item.prompt).trim().slice(0, 4000),
      }))
      .filter((item) => item.prompt)
      .slice(0, 8);
    // Feature toggles (per tenant). Pin Studio defaults ON; an explicit
    // false hides the Canva-style pin designer from the draft review screen.
    if (incoming.pinStudioEnabled === true || incoming.pinStudioEnabled === false) {
      merged.pinStudioEnabled = incoming.pinStudioEnabled;
    }
    const rolePrompts = incoming.articleImageRolePrompts;
    if (Array.isArray(rolePrompts)) {
      const rows = sanitizeShotRows(rolePrompts);
      merged.articleImageRolePrompts = rows.length ? { '*': rows } : {};
    } else if (rolePrompts && typeof rolePrompts === 'object') {
      const allowed = new Set(['*', 'food', 'crochet', 'pets', 'nails', 'pets-nails', 'furniture', 'home-decor', 'diy', 'beauty', 'gardening']);
      const byNiche = {};
      Object.entries(rolePrompts).forEach(([key, rows]) => {
        if (!allowed.has(key)) return;
        const clean = sanitizeShotRows(rows);
        if (clean.length) byNiche[key] = clean;
      });
      merged.articleImageRolePrompts = byNiche;
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

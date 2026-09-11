'use strict';
/**
 * pinStudio.js — compose a Pinterest-native pin image from an article.
 *
 * A pin is not the article image: it is a 1000 × 1500 portrait with the
 * headline burned in, the recipe facts readable at a glance and the site name
 * carried along, because most people read a pin as a thumbnail first.
 *
 * The layout maths lives here in pure functions so it can be tested in Node
 * (see test/server.test.js); only `render` touches a canvas.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OrbitPressPin = api;
}(typeof globalThis !== 'undefined' ? globalThis : null, function () {
  const PIN_SIZE = { width: 1000, height: 1500 };
  // Classic three layouts + four Canva-style "pro" compositions that arrange
  // several AI photos, headline blocks, ingredient lists and CTAs.
  const CLASSIC_TEMPLATES = ['scrim', 'card', 'top'];
  const PRO_TEMPLATES = ['ways', 'checklist', 'banner', 'duo', 'listicle', 'steps', 'quote', 'circle'];
  const TEMPLATES = [...CLASSIC_TEMPLATES, ...PRO_TEMPLATES];
  const FONTS = {
    sans: '"Segoe UI", Tahoma, "Noto Sans Arabic", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
    serif: 'Georgia, "Times New Roman", "Noto Naskh Arabic", serif',
    display: '"Trebuchet MS", "Segoe UI", Tahoma, "Noto Kufi Arabic", system-ui, sans-serif',
  };
  const ACCENT = '#f07f68';
  const INK = '#20242f';

  // Curated Canva-like palettes. Each carries paper background, ink, a bold
  // accent (buttons/underlines), a ribbon fill behind photo labels and the
  // light card tone used for paper notes.
  const PALETTES = {
    pumpkin: { name: 'Pumpkin spice', paper: '#f3e7d3', ink: '#4a2f17', accent: '#c9681f', ribbon: '#b45a1c', card: '#fbf5ea', soft: '#e9d3b2', white: '#fffdf8' },
    terracotta: { name: 'Terracotta', paper: '#f6ece5', ink: '#5b241d', accent: '#c0492f', ribbon: '#9c3b27', card: '#fdf7f1', soft: '#e8c9bb', white: '#fffaf7' },
    olive: { name: 'Olive cream', paper: '#f2f1e4', ink: '#33402a', accent: '#7d8b4f', ribbon: '#5f6f3b', card: '#fbfaf0', soft: '#d9dfc4', white: '#fefef9' },
    charcoal: { name: 'Charcoal pop', paper: '#f4f1ec', ink: '#1f2328', accent: '#e0533d', ribbon: '#2c3138', card: '#ffffff', soft: '#d9d4cb', white: '#ffffff' },
    berry: { name: 'Berry blush', paper: '#fbeef0', ink: '#57213a', accent: '#c8386b', ribbon: '#a32a55', card: '#fff8fa', soft: '#f3cfd9', white: '#fff' },
    ocean: { name: 'Ocean fresh', paper: '#eef4f6', ink: '#16394a', accent: '#1f8aa8', ribbon: '#155e75', card: '#fbfdfe', soft: '#cfe4ea', white: '#ffffff' },
  };
  const DEFAULT_PALETTE = 'pumpkin';

  const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
  function isRtl(text) {
    const sample = String(text || '').trim();
    if (!sample) return false;
    const first = Array.from(sample).find((ch) => ARABIC_RE.test(ch) || /[A-Za-z]/.test(ch));
    return !!first && ARABIC_RE.test(first);
  };

  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, number));
  }

  function domainOf(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
      return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.replace(/^www\./i, '');
    } catch {
      return raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
    }
  }

  function normalizeSlot(raw, index) {
    const slot = raw && typeof raw === 'object' ? raw : {};
    return {
      id: String(slot.id || `slot-${index + 1}`),
      label: String(slot.label || '').trim().slice(0, 80),
      ingredients: Array.isArray(slot.ingredients)
        ? slot.ingredients.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
        : [],
      steps: Array.isArray(slot.steps)
        ? slot.steps.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 4)
        : [],
      focusY: clamp(slot.focusY == null ? 0.5 : slot.focusY, 0, 1),
      ref: slot.ref ? String(slot.ref) : null,
    };
  }

  function normalizeLayout(raw, template) {
    const align = (value, fallback) => (['start', 'center', 'end'].includes(value) ? value : fallback);
    // Classic templates always had the CTA at the start; pro templates center it.
    const defaultCtaAlign = PRO_TEMPLATES.includes(template) ? 'center' : 'start';
    return {
      headlineAlign: align(raw.headlineAlign, 'start'),
      headlineShiftY: clamp(raw.headlineShiftY == null ? 0 : Number(raw.headlineShiftY), -30, 30),
      ctaAlign: align(raw.ctaAlign, defaultCtaAlign),
      ctaShiftX: clamp(raw.ctaShiftX == null ? 0 : Number(raw.ctaShiftX), -35, 35),
      ctaShiftY: clamp(raw.ctaShiftY == null ? 0 : Number(raw.ctaShiftY), -15, 15),
    };
  }

  function normalizeDesign(input) {
    const raw = input && typeof input === 'object' ? input : {};
    const template = TEMPLATES.includes(raw.template) ? raw.template : 'scrim';
    const palette = PALETTES[raw.palette] ? raw.palette : DEFAULT_PALETTE;
    const photos = PRO_TEMPLATES.includes(template)
      ? (Array.isArray(raw.photos) ? raw.photos : []).map(normalizeSlot).slice(0, 6)
      : [];
    return {
      template,
      palette,
      headline: String(raw.headline || '').trim().slice(0, 140),
      subline: String(raw.subline || '').trim().slice(0, 240),
      brand: String(raw.brand || '').trim().slice(0, 60),
      cta: String(raw.cta || '').trim().slice(0, 40),
      chips: Array.isArray(raw.chips) ? raw.chips.map((chip) => String(chip || '').trim()).filter(Boolean).slice(0, 3) : [],
      photos,
      layout: normalizeLayout(raw.layout || {}, template),
      overlay: clamp(raw.overlay == null ? 0.74 : raw.overlay, 0, 1),
      textScale: clamp(raw.textScale == null ? 1 : raw.textScale, 0.6, 1.4),
      focusY: clamp(raw.focusY == null ? 0.5 : raw.focusY, 0, 1),
      font: FONTS[raw.font] ? raw.font : 'sans',
      uppercase: raw.uppercase === true,
    };
  }

  /**
   * Where every element sits inside the pin, in canvas pixels.
   * Pure numbers: no fonts are measured here, so the boxes are stable and the
   * text is fitted into them afterwards.
   */
  function layout(design, size) {
    const target = size && size.width > 0 && size.height > 0 ? size : PIN_SIZE;
    const plan = normalizeDesign(design);
    const { width, height } = target;
    const padding = Math.round(width * 0.08);
    const bandHeight = Math.round(height * (plan.template === 'card' ? 0.46 : 0.48));
    const bandTop = plan.template === 'top' ? 0 : height - bandHeight;
    const gap = Math.round(height * 0.02);
    const innerTop = bandTop + Math.round(height * 0.05);
    const innerBottom = bandTop + bandHeight - Math.round(height * 0.05);
    const chipsHeight = plan.chips.length ? Math.round(height * 0.05) : 0;
    const footerHeight = Math.round(height * 0.05);
    const gaps = gap * (2 + (chipsHeight ? 1 : 0));
    const available = Math.max(Math.round(height * 0.1), (innerBottom - innerTop) - chipsHeight - footerHeight - gaps);
    const headlineHeight = Math.round(available * 0.62);
    const sublineHeight = Math.round(available * 0.3);
    let y = innerTop;
    const chips = { x: padding, y, width: width - padding * 2, height: chipsHeight, visible: chipsHeight > 0 };
    if (chipsHeight) y += chipsHeight + gap;
    const headline = { x: padding, y, width: width - padding * 2, height: headlineHeight };
    y += headlineHeight + gap;
    const subline = { x: padding, y, width: width - padding * 2, height: sublineHeight };
    y += sublineHeight + gap;
    const footer = { x: padding, y, width: width - padding * 2, height: footerHeight };
    return {
      size: target,
      template: plan.template,
      padding,
      gap,
      band: { x: 0, y: bandTop, width, height: bandHeight },
      chips,
      headline,
      subline,
      footer,
      radius: Math.round(width * (plan.template === 'card' ? 0.06 : 0)),
    };
  }

  /**
   * Fit an image into a box: 'cover' fills the box and crops the overflow,
   * 'contain' keeps the whole image and leaves background around it.
   */
  function fitRect(imageWidth, imageHeight, boxWidth, boxHeight, mode) {
    if (!(imageWidth > 0 && imageHeight > 0 && boxWidth > 0 && boxHeight > 0)) {
      return { x: 0, y: 0, width: boxWidth, height: boxHeight };
    }
    const scale = mode === 'contain'
      ? Math.min(boxWidth / imageWidth, boxHeight / imageHeight)
      : Math.max(boxWidth / imageWidth, boxHeight / imageHeight);
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    return { x: (boxWidth - width) / 2, y: (boxHeight - height) / 2, width, height };
  }

  /** Cover-fit an image into a box; focusY decides what survives the crop. */
  function coverRect(imageWidth, imageHeight, boxWidth, boxHeight, focusY) {
    if (!(imageWidth > 0 && imageHeight > 0 && boxWidth > 0 && boxHeight > 0)) {
      return { x: 0, y: 0, width: boxWidth, height: boxHeight };
    }
    const scale = Math.max(boxWidth / imageWidth, boxHeight / imageHeight);
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    return {
      x: (boxWidth - width) / 2,
      y: (boxHeight - height) * clamp(focusY == null ? 0.5 : focusY, 0, 1),
      width,
      height,
    };
  }

  function wrapLines(text, measure, maxWidth) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (!current || measure(candidate) <= maxWidth) { current = candidate; continue; }
      lines.push(current);
      current = word;
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  }

  /**
   * Largest font size at which the text fits its box, with the wrapped lines.
   * Shrinks first, and only clips with an ellipsis when even the smallest size
   * cannot fit — clipping silently is how headlines lose their meaning.
   */
  function fitText(ctx, text, options) {
    const max = Math.max(8, Math.round(options.max));
    const min = Math.max(6, Math.round(options.min || max / 2));
    const ratio = options.lineHeightRatio || 1.15;
    const maxLines = options.maxLines || 4;
    const transform = options.transform || ((value) => value);
    const clean = transform(String(text || '').trim());
    if (!clean) return { size: max, lines: [], lineHeight: Math.round(max * ratio), width: 0 };
    let fallback = null;
    for (let size = max; size >= min; size -= 2) {
      ctx.font = fontSpec(options.weight || 700, size, options.family);
      const lines = wrapLines(clean, (value) => ctx.measureText(value).width, options.maxWidth);
      const lineHeight = Math.round(size * ratio);
      if (lines.length <= maxLines && lines.length * lineHeight <= options.maxHeight) {
        return { size, lines, lineHeight, width: Math.max(...lines.map((line) => ctx.measureText(line).width)) };
      }
      const keep = Math.max(1, Math.floor(options.maxHeight / lineHeight));
      fallback = { size, lines: clipLines(lines, keep), lineHeight, width: options.maxWidth };
    }
    return fallback || { size: min, lines: [clean], lineHeight: Math.round(min * ratio), width: options.maxWidth };
  }

  function clipLines(lines, keep) {
    if (lines.length <= keep) return lines;
    const kept = lines.slice(0, keep);
    kept[keep - 1] = `${kept[keep - 1].replace(/[\s…]+$/, '')}…`;
    return kept;
  }

  function fontSpec(weight, size, familyName) {
    return `${weight} ${size}px ${FONTS[familyName] ? FONTS[familyName] : FONTS.sans}`;
  }

  // --- loading and fitting images (browser only) -----------------------------

  function loadBrowserImage(dataUrl, timeoutMs) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(() => reject(new Error('This image could not be decoded in time.')), timeoutMs || 15000);
      image.onload = () => { clearTimeout(timer); resolve(image); };
      image.onerror = () => { clearTimeout(timer); reject(new Error('This image cannot be read.')); };
      image.src = dataUrl;
    });
  }

  /** Read the real pixel size of an image without keeping it around. */
  function imageSize(dataUrl) {
    return loadBrowserImage(dataUrl).then((image) => ({
      width: image.naturalWidth || image.width || 0,
      height: image.naturalHeight || image.height || 0,
    }));
  }

  /**
   * Draw an image into an exact-size canvas — the way generated images are
   * made 2:3. Most text-to-image models answer with a square or a fixed
   * landscape, and Pinterest refuses anything but 2:3, so the shape is fixed
   * here, in the browser, where a canvas exists.
   */
  function fitImage(dataUrl, options) {
    const size = (options && options.size) || PIN_SIZE;
    const mode = (options && options.mode) || 'cover';
    const background = (options && options.background) || '#ffffff';
    return loadBrowserImage(dataUrl).then((image) => {
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, size.width, size.height);
      const rect = fitRect(image.naturalWidth || image.width, image.naturalHeight || image.height, size.width, size.height, mode);
      ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
      return canvas;
    });
  }

  // --- defaults derived from the article ------------------------------------

  function recipeChips(recipe, recipeCount, rtl) {
    const chips = [];
    if (recipe) {
      if (recipe.prepTime) chips.push(rtl ? `تحضير ${recipe.prepTime}` : `${recipe.prepTime} prep`);
      if (recipe.cookTime) chips.push(rtl ? `طهي ${recipe.cookTime}` : `${recipe.cookTime} cook`);
      if (recipe.recipeYield) chips.push(rtl ? `الكمية ${recipe.recipeYield}` : `Serves ${recipe.recipeYield}`);
    }
    if (!chips.length && recipeCount > 1) chips.push(rtl ? `${recipeCount} وصفات` : `${recipeCount} recipes`);
    return chips.slice(0, 3);
  }

  // How many photo slots a pro template composes.
  function slotCountFor(template, recipesLength) {
    if (template === 'ways') return clamp(recipesLength || 4, 1, 4);
    if (template === 'listicle') return clamp(recipesLength || 3, 2, 4);
    if (template === 'duo') return 2;
    return 1; // checklist / banner / steps / quote / circle
  }

  function recipeSteps(recipe) {
    return (Array.isArray(recipe && recipe.instructions) ? recipe.instructions : [])
      .map((step) => String((step && typeof step === 'object') ? (step.text || step.name) : step || '').trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  function recipeLabel(recipe, index, fallbackTitle) {
    const name = String((recipe && (recipe.title || recipe.name)) || '').trim();
    if (name) return name.split(/\||–|—/)[0].trim().slice(0, 60);
    return fallbackTitle ? `${fallbackTitle} ${index + 1}` : `Recipe ${index + 1}`;
  }

  /** Build editable photo slots from the article's recipe data. */
  function defaultSlots(template, context) {
    const data = context || {};
    const recipes = Array.isArray(data.recipes) ? data.recipes : [];
    const single = data.recipe || (data.contentType === 'recipe' ? recipes[0] : null);
    const count = slotCountFor(template, recipes.length || (single ? 1 : 0));
    const title = String(data.title || '').split(/\||–|—/)[0].trim();
    const slots = [];
    for (let i = 0; i < count; i += 1) {
      const recipe = recipes[i] || (i === 0 ? single : null);
      const ingredients = Array.isArray(recipe && recipe.ingredients)
        ? recipe.ingredients.map((item) => String(item || '').replace(/^[\s•\-✓✔]+/, '').trim()).filter(Boolean).slice(0, 6)
        : [];
      const steps = template === 'steps' ? recipeSteps(recipe) : [];
      slots.push({
        id: `slot-${i + 1}`,
        label: ['ways', 'listicle'].includes(template)
          ? recipeLabel(recipe, i, title)
          : title.slice(0, 60),
        ingredients,
        steps,
        focusY: 0.5,
        ref: null,
      });
    }
    return slots;
  }

  function defaultDesign(context, template) {
    const data = context || {};
    const recipes = Array.isArray(data.recipes) ? data.recipes : [];
    const recipe = data.recipe || (data.contentType === 'recipe' ? recipes[0] : null);
    const title = String(data.title || '').split(/\||–|—/)[0].trim();
    const wantsArabic = isRtl(`${title} ${data.metaDescription || ''}`);
    const chosen = TEMPLATES.includes(template) ? template : 'scrim';
    const design = {
      template: chosen,
      headline: title.slice(0, chosen === 'duo' ? 70 : 90),
      subline: String(data.metaDescription || '').trim().slice(0, 150),
      brand: String(data.siteName || domainOf(data.publishedUrl || data.wordpressBaseUrl || '') || '').slice(0, 60),
      cta: wantsArabic
        ? (data.contentType === 'recipe' ? 'احفظي الوصفة' : 'اقرئي المزيد')
        : (data.contentType === 'recipe' ? 'Full recipe' : 'Read more'),
      chips: recipeChips(recipe, recipes.length || (recipe ? 1 : 0), wantsArabic),
    };
    if (PRO_TEMPLATES.includes(chosen)) {
      design.palette = DEFAULT_PALETTE;
      design.photos = defaultSlots(chosen, data);
      design.overlay = 0.6;
      if (wantsArabic) design.uppercase = false;
    }
    return normalizeDesign(design);
  }

  /** The text that travels with the pin: title, description, alt text. */
  function pinText(design, context) {
    const plan = normalizeDesign(design);
    const data = context || {};
    const title = (plan.headline || String(data.title || '').split(/\||–|—/)[0].trim()).slice(0, 100);
    const parts = [plan.subline];
    if (plan.chips.length) parts.push(plan.chips.join(' · '));
    const body = parts.filter(Boolean).join(' · ');
    const tail = plan.cta && plan.brand ? `${plan.cta} on ${plan.brand}` : plan.brand;
    const description = [body, tail].filter(Boolean).join(' — ').slice(0, 800);
    return { title, description, altText: title.slice(0, 500) };
  }

  // --- rendering ------------------------------------------------------------

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, width, height, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawCover(ctx, image, size, focusY) {
    const rect = coverRect(image.width || image.naturalWidth, image.height || image.naturalHeight, size.width, size.height, focusY);
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  }

  function drawScrim(ctx, plan, box) {
    const gradient = ctx.createLinearGradient(0, box.band.y, 0, box.band.y + box.band.height);
    const top = plan.template === 'top';
    gradient.addColorStop(0, `rgba(9,12,20,${top ? plan.overlay : 0})`);
    gradient.addColorStop(top ? 0.55 : 0.45, `rgba(9,12,20,${(plan.overlay * 0.72).toFixed(3)})`);
    gradient.addColorStop(1, `rgba(9,12,20,${top ? 0 : plan.overlay})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(box.band.x, box.band.y, box.band.width, box.band.height);
  }

  function drawCard(ctx, plan, box) {
    ctx.save();
    ctx.shadowColor = 'rgba(16,24,39,.28)';
    ctx.shadowBlur = Math.round(box.size.width * 0.05);
    ctx.shadowOffsetY = Math.round(box.size.height * 0.006);
    ctx.fillStyle = 'rgba(255,253,249,.96)';
    roundRect(ctx, box.padding * 0.5, box.band.y + box.padding * 0.35, box.size.width - box.padding, box.band.height - box.padding * 0.35, box.radius);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = ACCENT;
    roundRect(ctx, box.padding, box.band.y + box.padding * 0.35 + Math.round(box.size.height * 0.028), Math.round(box.size.width * 0.13), Math.round(box.size.height * 0.006), 999);
    ctx.fill();
  }

  function withShadow(ctx, on, width, draw) {
    if (!on) return draw();
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = Math.round(width * 0.03);
    ctx.shadowOffsetY = Math.round(width * 0.004);
    draw();
    ctx.restore();
  }

  function drawChips(ctx, plan, box) {
    if (!box.chips.visible) return;
    const onDark = plan.template !== 'card';
    const height = Math.round(box.chips.height * 0.78);
    const size = Math.round(height * 0.52);
    ctx.font = fontSpec(700, size, plan.font);
    let x = box.chips.x;
    const y = box.chips.y + Math.round((box.chips.height - height) / 2);
    for (const chip of plan.chips) {
      const label = plan.uppercase ? chip.toUpperCase() : chip;
      const width = Math.ceil(ctx.measureText(label).width) + Math.round(height * 0.9);
      ctx.fillStyle = onDark ? 'rgba(255,255,255,.22)' : 'rgba(32,36,47,.08)';
      roundRect(ctx, x, y, width, height, height / 2);
      ctx.fill();
      ctx.fillStyle = onDark ? '#fff' : INK;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + Math.round(height * 0.45), y + height / 2 + 1);
      x += width + Math.round(height * 0.35);
    }
  }

  function drawFooter(ctx, plan, box) {
    const onDark = plan.template !== 'card';
    const size = Math.round(box.footer.height * 0.62);
    const l = plan.layout || {};
    let rowY = box.footer.y + Math.round((box.footer.height - size * 1.7) / 2);
    rowY += Math.round((l.ctaShiftY || 0) * box.size.height / 100);
    const width = box.size.width;
    const padX = box.footer.x;
    let cursor = padX;
    let ctaWidth = 0;
    if (plan.cta) {
      ctx.font = fontSpec(800, size, plan.font);
      const label = plan.uppercase ? plan.cta.toUpperCase() : plan.cta;
      ctaWidth = Math.ceil(ctx.measureText(label).width) + Math.round(size * 1.6);
      const height = Math.round(size * 1.7);
      const align = l.ctaAlign || 'start';
      let x = align === 'center' ? (width - ctaWidth) / 2
        : align === 'end' ? width - padX - ctaWidth
          : padX;
      x += Math.round((l.ctaShiftX || 0) * width / 100);
      x = clamp(x, padX, width - padX - ctaWidth);
      ctx.fillStyle = ACCENT;
      roundRect(ctx, x, rowY, ctaWidth, height, height / 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + Math.round(size * 0.8), rowY + height / 2 + 1);
      cursor = x + ctaWidth + Math.round(size * 0.9);
    }
    if (!plan.brand) return;
    ctx.font = fontSpec(700, size, plan.font);
    ctx.fillStyle = onDark ? 'rgba(255,255,255,.86)' : 'rgba(32,36,47,.66)';
    ctx.textBaseline = 'middle';
    let brandX = cursor;
    if (l.ctaAlign === 'center' || l.ctaAlign === 'end') {
      // Keep the site name readable when the button moves to the middle/right.
      brandX = padX;
    }
    if (brandX + ctx.measureText(plan.brand).width > width - padX) {
      ctx.textAlign = 'right';
      brandX = width - padX;
    }
    ctx.fillText(plan.brand, brandX, rowY + Math.round(size * 0.85) + 1);
    ctx.textAlign = 'left';
  }

  // --------------------------------------------------------------------------
  // Pro "Canva-style" template engine: multiple AI photos composed with bold
  // headlines, ingredient lists, brush ribbons and CTA pills. All geometry is
  // computed from PIN_SIZE so it is unit-testable in Node without a canvas.
  // --------------------------------------------------------------------------

  function proLayout(template, size, photoCount) {
    const target = size && size.width > 0 ? size : PIN_SIZE;
    const { width, height } = target;
    const pad = Math.round(width * 0.058);
    const count = clamp(photoCount || 1, 1, 4);
    const plans = {
      ways: { pad, header: { x: pad, y: Math.round(height * 0.045), width: width - pad * 2, height: Math.round(height * 0.19) }, cards: [] },
      checklist: {
        pad,
        band: { x: 0, y: 0, width, height: Math.round(height * 0.26) },
        photo: { x: pad, y: Math.round(height * 0.17), width: width - pad * 2, height: Math.round(height * 0.37) },
        paper: { x: pad, y: Math.round(height * 0.575), width: width - pad * 2, height: Math.round(height * 0.3) },
        cta: { x: 0, y: Math.round(height * 0.9), width, height: Math.round(height * 0.1) },
      },
      banner: {
        pad,
        photo: { x: 0, y: 0, width, height: Math.round(height * 0.72) },
        panel: { x: 0, y: Math.round(height * 0.72), width, height: Math.round(height * 0.28) },
      },
      duo: {
        pad,
        top: { x: 0, y: 0, width, height: Math.round(height * 0.4) },
        band: { x: 0, y: Math.round(height * 0.4), width, height: Math.round(height * 0.2) },
        bottom: { x: 0, y: Math.round(height * 0.6), width, height: Math.round(height * 0.4) },
      },
      listicle: {
        pad,
        header: { x: pad, y: Math.round(height * 0.045), width: width - pad * 2, height: Math.round(height * 0.15) },
        rows: [],
      },
      steps: {
        pad,
        photo: { x: 0, y: 0, width, height: Math.round(height * 0.42) },
        panel: { x: 0, y: Math.round(height * 0.42), width, height: Math.round(height * 0.58) },
        title: { x: pad * 1.3, y: Math.round(height * 0.445), width: width - pad * 2.6, height: Math.round(height * 0.1) },
        stepRows: [],
        cta: { y: Math.round(height * 0.925), height: Math.round(height * 0.05) },
      },
      quote: {
        pad,
        photo: { x: 0, y: 0, width, height },
        card: { x: Math.round(pad * 1.2), y: Math.round(height * 0.27), width: width - pad * 2.4, height: Math.round(height * 0.44) },
      },
      circle: {
        pad,
        circle: { cx: Math.round(width / 2), cy: Math.round(height * 0.31), r: Math.round(width * 0.365) },
        title: { x: pad * 1.2, y: Math.round(height * 0.62), width: width - pad * 2.4, height: Math.round(height * 0.18) },
        cta: { y: Math.round(height * 0.91), height: Math.round(height * 0.05) },
      },
    };
    const plan = plans[template] || plans.banner;
    if (template === 'listicle') {
      const gap = Math.round(height * 0.018);
      const topY = Math.round(height * 0.21);
      const bottomY = Math.round(height * 0.875);
      const rowH = (bottomY - topY - gap * (count - 1)) / count;
      for (let i = 0; i < count; i += 1) {
        const y = topY + i * (rowH + gap);
        const thumb = Math.round(rowH * 0.92);
        plan.rows.push({
          x: pad,
          y: Math.round(y),
          width: width - pad * 2,
          height: Math.round(rowH),
          thumb: { x: pad, y: Math.round(y + (rowH - thumb) / 2), width: thumb, height: thumb, radius: Math.round(width * 0.028) },
        });
      }
    }
    if (template === 'steps') {
      const startY = Math.round(height * 0.555);
      const endY = Math.round(height * 0.89);
      const stepH = (endY - startY) / 4;
      for (let i = 0; i < 4; i += 1) {
        plan.stepRows.push({ x: pad * 1.3, y: Math.round(startY + i * stepH), width: width - pad * 2.6, height: Math.round(stepH) });
      }
    }
    if (template === 'ways') {
      const gap = Math.round(width * 0.03);
      const top = Math.round(height * 0.255);
      const bottom = Math.round(height * 0.945);
      if (count === 4) {
        const cardW = (width - pad * 2 - gap) / 2;
        const cardH = (bottom - top - gap) / 2;
        for (let row = 0; row < 2; row += 1) {
          for (let col = 0; col < 2; col += 1) {
            plan.cards.push({ x: pad + col * (cardW + gap), y: top + row * (cardH + gap), width: cardW, height: cardH, radius: Math.round(width * 0.03) });
          }
        }
      } else if (count === 3) {
        const leftW = (width - pad * 2 - gap) * 0.52;
        const rightW = (width - pad * 2 - gap) - leftW;
        const rightH = (bottom - top - gap) / 2;
        plan.cards.push({ x: pad, y: top, width: leftW, height: bottom - top, radius: Math.round(width * 0.03) });
        plan.cards.push({ x: pad + leftW + gap, y: top, width: rightW, height: rightH, radius: Math.round(width * 0.03) });
        plan.cards.push({ x: pad + leftW + gap, y: top + rightH + gap, width: rightW, height: rightH, radius: Math.round(width * 0.03) });
      } else {
        const rows = count;
        const cardH = (bottom - top - gap * (rows - 1)) / rows;
        for (let i = 0; i < rows; i += 1) {
          plan.cards.push({ x: pad, y: top + i * (cardH + gap), width: width - pad * 2, height: cardH, radius: Math.round(width * 0.03) });
        }
      }
    }
    plan.size = target;
    return plan;
  }

  // --- canvas drawing helpers (browser only; never called from Node tests) --

  function roundRectPath(ctx, x, y, width, height, radius) {
    const r = Math.min(radius || 0, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /** Organic brush blob behind labels: a lumpy closed curve. */
  function drawBlob(ctx, cx, cy, rx, ry, color, rotation = 0, seed = 1) {
    const bumps = 9;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.beginPath();
    for (let i = 0; i <= bumps; i += 1) {
      const angle = (i / bumps) * Math.PI * 2;
      const wobble = 1 + 0.09 * Math.sin(i * 2.7 + seed * 3.1) + 0.05 * Math.cos(i * 1.9 + seed);
      const x = Math.cos(angle) * rx * wobble;
      const y = Math.sin(angle) * ry * wobble;
      if (i === 0) ctx.moveTo(x, y);
      else {
        const prevAngle = ((i - 0.5) / bumps) * Math.PI * 2;
        const prevWobble = 1 + 0.09 * Math.sin((i - 0.5) * 2.7 + seed * 3.1);
        ctx.quadraticCurveTo(
          Math.cos(prevAngle) * rx * prevWobble,
          Math.sin(prevAngle) * ry * prevWobble,
          x, y,
        );
      }
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function drawPhoto(ctx, image, box, radius = 0, focusY = 0.5) {
    ctx.save();
    roundRectPath(ctx, box.x, box.y, box.width, box.height, radius);
    ctx.clip();
    if (image) {
      const rect = coverRect(image.width || image.naturalWidth, image.height || image.naturalHeight, box.width, box.height, focusY);
      ctx.drawImage(image, rect.x + box.x, rect.y + box.y, rect.width, rect.height);
    } else {
      ctx.fillStyle = '#e7e2d6';
      ctx.fillRect(box.x, box.y, box.width, box.height);
      ctx.strokeStyle = 'rgba(90,80,60,.28)';
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 12]);
      roundRectPath(ctx, box.x + 10, box.y + 10, box.width - 20, box.height - 20, Math.max(4, radius - 6));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawBlock(ctx, text, box, options) {
    const opts = options || {};
    const rtl = opts.rtl || false;
    const fitted = fitText(ctx, text, {
      maxWidth: box.width,
      maxHeight: box.height,
      max: Math.round(opts.max || box.height * 0.5),
      min: Math.round(opts.min || box.height * 0.08),
      weight: opts.weight || 800,
      family: opts.family || 'sans',
      lineHeightRatio: opts.lineHeightRatio || 1.12,
      maxLines: opts.maxLines || 4,
    });
    ctx.font = fontSpec(opts.weight || 800, fitted.size, opts.family || 'sans');
    ctx.fillStyle = opts.color || INK;
    ctx.textBaseline = 'top';
    const align = opts.align || 'start';
    ctx.textAlign = align === 'center' ? 'center' : (align === 'end' ? (rtl ? 'left' : 'right') : (rtl ? 'right' : 'left'));
    const x = align === 'center'
      ? box.x + box.width / 2
      : align === 'end'
        ? (rtl ? box.x : box.x + box.width)
        : (rtl ? box.x + box.width : box.x);
    fitted.lines.forEach((line, index) => {
      ctx.fillText(line, x, box.y + index * fitted.lineHeight);
    });
    return { ...fitted, x, endY: box.y + fitted.lines.length * fitted.lineHeight };
  }

  // Apply the editor's headline nudges (vertical percent of canvas height).
  function laidHeadBox(box, plan, size) {
    const dy = Math.round(((plan.layout && plan.layout.headlineShiftY) || 0) * size.height / 100);
    return { ...box, y: box.y + dy };
  }

  // Place the CTA pill honoring the editor's alignment + x/y nudges.
  function drawPillLaid(ctx, label, baseCx, baseCy, height, color, textColor, plan, size, pad) {
    const l = plan.layout || {};
    const width = pillWidth(ctx, label, height);
    const align = l.ctaAlign || 'center';
    let cx = align === 'start'
      ? pad + width / 2
      : align === 'end'
        ? size.width - pad - width / 2
        : size.width / 2;
    cx += (l.ctaShiftX || 0) * size.width / 100;
    cx = clamp(cx, pad + width / 2, size.width - pad - width / 2);
    const cy = clamp(baseCy + (l.ctaShiftY || 0) * size.height / 100, height, size.height - height / 2);
    return drawPill(ctx, label, cx, cy, height, color, textColor);
  }

  function pillWidth(ctx, label, height) {
    const size = Math.round(height * 0.42);
    ctx.font = fontSpec(800, size, 'sans');
    return Math.ceil(ctx.measureText(label).width) + height * 0.9;
  }

  function drawPill(ctx, label, cx, cy, height, color, textColor) {
    const width = pillWidth(ctx, label, height);
    const x = cx - width / 2;
    const y = cy - height / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(20,12,4,.25)';
    ctx.shadowBlur = Math.round(height * 0.25);
    ctx.shadowOffsetY = Math.round(height * 0.06);
    roundRectPath(ctx, x, y, width, height, height / 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = textColor || '#fff';
    ctx.font = fontSpec(800, Math.round(height * 0.4), 'sans');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + 1);
    return { x, y, width, height };
  }

  /** Photo card for the "ways" template: photo + brush ribbon with label. */
  function drawWaysCard(ctx, slot, image, box, palette, index, rtl) {
    drawPhoto(ctx, image, box, box.radius, (slot && slot.focusY) || 0.5);
    ctx.save();
    roundRectPath(ctx, box.x, box.y, box.width, box.height, box.radius);
    ctx.clip();
    const gradient = ctx.createLinearGradient(0, box.y + box.height * 0.45, 0, box.y + box.height);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(20,12,4,.62)');
    ctx.fillStyle = gradient;
    ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.restore();

    const items = (slot.ingredients || []).slice(0, box.width > box.height + 60 ? 4 : 3);
    const label = slot.label || `Recipe ${index + 1}`;
    const ribbonH = Math.round(box.height * (items.length ? 0.42 : 0.2));
    const ribbonW = box.width * 0.92;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height - ribbonH * 0.62;
    drawBlob(ctx, cx, cy, ribbonW / 2, ribbonH / 2, palette.ribbon, (index % 2 ? 1 : -1) * 0.05, index + 2);
    const textBox = { x: box.x + box.width * 0.1, y: cy - ribbonH * 0.34, width: box.width * 0.8, height: ribbonH * 0.68 };
    drawBlock(ctx, label, textBox, { color: '#fff', max: Math.round(box.width * 0.075), min: Math.round(box.width * 0.045), maxLines: 2, rtl, lineHeightRatio: 1.05 });
    if (items.length) {
      const size = Math.round(box.width * 0.032);
      ctx.font = fontSpec(600, size, 'sans');
      ctx.fillStyle = 'rgba(255,255,255,.94)';
      ctx.textBaseline = 'top';
      ctx.textAlign = rtl ? 'right' : 'left';
      let y = textBox.y + Math.round(box.width * 0.11) + 6;
      items.forEach((item) => {
        const line = `• ${item.length > 26 ? `${item.slice(0, 25)}…` : item}`;
        ctx.fillText(line, rtl ? box.x + box.width * 0.88 : box.x + box.width * 0.12, y);
        y += size * 1.35;
      });
    }
  }

  function drawChecklist(ctx, slot, box, palette, rtl) {
    const items = (slot.ingredients || []).slice(0, 9);
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,20,.18)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 8;
    roundRectPath(ctx, box.x, box.y, box.width, box.height, 26);
    ctx.fillStyle = palette.card;
    ctx.fill();
    ctx.restore();
    const pad = Math.round(box.width * 0.07);
    ctx.font = fontSpec(800, Math.round(box.width * 0.062), 'sans');
    ctx.fillStyle = palette.accent;
    ctx.textBaseline = 'top';
    ctx.textAlign = rtl ? 'right' : 'left';
    const heading = rtl ? '✓ المكوّنات' : '✓ INGREDIENTS';
    ctx.fillText(heading, rtl ? box.x + box.width - pad : box.x + pad, box.y + pad);
    if (!items.length) {
      ctx.font = fontSpec(500, Math.round(box.width * 0.04), 'sans');
      ctx.fillStyle = 'rgba(60,50,40,.55)';
      const msg = rtl ? 'أضف المكوّنات من خانات القالب.' : 'Add ingredients in the template fields.';
      ctx.fillText(msg, rtl ? box.x + box.width - pad : box.x + pad, box.y + pad * 2.4);
      return;
    }
    const size = Math.round(box.width * 0.043);
    const rowH = (box.height - pad * 2.4) / Math.min(items.length, 9);
    const fontSize = Math.min(size, Math.round(rowH * 0.62));
    ctx.font = fontSpec(650, fontSize, 'sans');
    items.forEach((item, i) => {
      const y = box.y + pad * 2.1 + i * rowH;
      const markerR = Math.round(fontSize * 0.62);
      const markerCy = y + fontSize * 0.52;
      const markerX = rtl ? box.x + box.width - pad - markerR : box.x + pad + markerR;
      ctx.beginPath();
      ctx.arc(markerX, markerCy, markerR, 0, Math.PI * 2);
      ctx.fillStyle = palette.accent;
      ctx.fill();
      ctx.strokeStyle = palette.card;
      ctx.lineWidth = Math.max(2, markerR * 0.28);
      ctx.beginPath();
      ctx.moveTo(markerX - markerR * 0.45, markerCy);
      ctx.lineTo(markerX - markerR * 0.05, markerCy + markerR * 0.45);
      ctx.lineTo(markerX + markerR * 0.55, markerCy - markerR * 0.45);
      ctx.stroke();
      ctx.fillStyle = palette.ink;
      ctx.textAlign = rtl ? 'right' : 'left';
      const textX = rtl ? box.x + box.width - pad - markerR * 2 - 12 : box.x + pad + markerR * 2 + 12;
      ctx.fillText(item.length > 46 ? `${item.slice(0, 45)}…` : item, textX, y, box.width - pad * 2 - markerR * 2 - 12);
    });
  }

  // Numbered horizontal rows for the "listicle" template.
  function drawListRow(ctx, slot, image, row, index, palette, rtl, plan, size) {
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,20,.14)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    roundRectPath(ctx, row.x, row.y, row.width, row.height, 18);
    ctx.fillStyle = palette.card;
    ctx.fill();
    ctx.restore();
    drawPhoto(ctx, image, row.thumb, row.thumb.radius, (slot && slot.focusY) || 0.5);
    const badgeR = Math.round(row.height * 0.21);
    const bcx = row.thumb.x + row.thumb.width - badgeR * 0.2;
    const bcy = row.thumb.y + badgeR * 0.9;
    ctx.beginPath();
    ctx.arc(bcx, bcy, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = palette.accent;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = fontSpec(900, Math.round(badgeR * 1.15), 'display');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), bcx, bcy + 1);
    const textX = rtl ? row.x + row.width - row.thumb.width - badgeR - 22 : row.x + row.thumb.width + badgeR + 22;
    const textBox = { x: rtl ? row.x + 14 : textX, y: row.y + row.height * 0.16, width: row.width - row.thumb.width - badgeR * 2 - 42, height: row.height * 0.72 };
    drawBlock(ctx, slot.label || `Recipe ${index + 1}`, textBox, { color: palette.ink, max: Math.round(row.height * 0.24), min: 18, maxLines: 2, rtl, weight: 900, family: 'display', align: plan.layout.headlineAlign });
    const items = (slot.ingredients || []).slice(0, 2);
    if (items.length) {
      ctx.font = fontSpec(600, Math.round(row.height * 0.1), 'sans');
      ctx.fillStyle = 'rgba(60,50,40,.66)';
      ctx.textBaseline = 'middle';
      ctx.textAlign = rtl ? 'right' : 'left';
      const line = items.join('  ·  ');
      ctx.fillText(line.length > 42 ? `${line.slice(0, 41)}…` : line, textBox.x, textBox.y + textBox.height - 6, textBox.width);
    }
  }

  // Numbered preparation steps for the "steps" template.
  function drawStepsPanel(ctx, slot, rows, palette, rtl) {
    const steps = (slot && slot.steps || []).slice(0, 4);
    rows.forEach((row, i) => {
      const step = steps[i];
      const numberR = Math.round(row.height * 0.26);
      const numberCy = row.y + Math.min(numberR + 4, row.height * 0.4);
      const numberX = rtl ? row.x + row.width - numberR : row.x + numberR;
      ctx.beginPath();
      ctx.arc(numberX, numberCy, numberR, 0, Math.PI * 2);
      ctx.fillStyle = step ? palette.accent : palette.soft;
      ctx.fill();
      ctx.fillStyle = step ? '#fff' : 'rgba(80,70,60,.55)';
      ctx.font = fontSpec(900, Math.round(numberR), 'display');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), numberX, numberCy + 1);
      if (step) {
        ctx.font = fontSpec(650, Math.round(row.height * 0.24), 'sans');
        ctx.fillStyle = palette.ink;
        ctx.textBaseline = 'middle';
        ctx.textAlign = rtl ? 'right' : 'left';
        const textX = rtl ? row.x + row.width - numberR * 2 - 16 : row.x + numberR * 2 + 16;
        const width = row.width - numberR * 2 - 32;
        const fitted = fitText(ctx, step, { maxWidth: width, maxHeight: row.height * 0.8, max: Math.round(row.height * 0.26), min: 15, weight: 650, family: 'sans', lineHeightRatio: 1.2, maxLines: 2 });
        ctx.font = fontSpec(650, fitted.size, 'sans');
        fitted.lines.forEach((line, k) => {
          ctx.fillText(line, textX, numberCy - (fitted.lines.length - 1) * fitted.lineHeight / 2 + k * fitted.lineHeight, width);
        });
      }
    });
  }

  function drawCirclePhoto(ctx, image, circle, focusY = 0.5) {
    const { cx, cy, r } = circle;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    if (image) {
      const rect = coverRect(image.width || image.naturalWidth, image.height || image.naturalHeight, r * 2, r * 2, focusY);
      ctx.drawImage(image, cx - r + rect.x, cy - r + rect.y, rect.width, rect.height);
    } else {
      ctx.fillStyle = '#e7e2d6';
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = Math.round(r * 0.07);
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();
  }

  function renderPro(canvas, images, plan) {
    const ctx = canvas.getContext('2d');
    const palette = PALETTES[plan.palette] || PALETTES[DEFAULT_PALETTE];
    const size = { width: canvas.width, height: canvas.height };
    const rtl = isRtl(plan.headline + plan.subline + (plan.photos[0] && plan.photos[0].label ? plan.photos[0].label : ''));
    const slots = plan.photos || [];
    const headAlign = (plan.layout && plan.layout.headlineAlign) || 'start';
    const slotImage = (index) => {
      const slot = slots[index];
      if (!slot || !images || !images.slots) return null;
      return images.slots[slot.id] || images.slots[index] || null;
    };
    const layout = proLayout(plan.template, size, slots.length);

    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = palette.paper;
    ctx.fillRect(0, 0, size.width, size.height);

    if (plan.template === 'ways') {
      const head = laidHeadBox(layout.header, plan, size);
      drawBlock(ctx, plan.headline || 'Recipes', head, { color: palette.ink, max: Math.round(size.width * 0.09 * plan.textScale), min: 38, maxLines: 2, rtl, weight: 900, family: 'display', align: headAlign });
      const accentW = Math.round(head.width * 0.34);
      const accentX = headAlign === 'center' ? head.x + (head.width - accentW) / 2 : headAlign === 'end' ? head.x + head.width - accentW : (rtl ? head.x + head.width - accentW : head.x);
      ctx.fillStyle = palette.accent;
      roundRectPath(ctx, accentX, head.y + Math.round(size.height * 0.135), accentW, 12, 6);
      ctx.fill();
      if (plan.subline) {
        drawBlock(ctx, plan.subline, laidHeadBox({ x: head.x, y: head.y + Math.round(size.height * 0.15), width: head.width, height: 54 }, plan, size), { color: palette.ink, max: 26, min: 16, maxLines: 2, weight: 600, rtl, align: headAlign });
      }
      layout.cards.forEach((box, i) => drawWaysCard(ctx, slots[i] || {}, slotImage(i), box, palette, i, rtl));
      if (plan.cta) drawPillLaid(ctx, plan.cta, size.width / 2, size.height - Math.round(size.height * 0.032), Math.round(size.height * 0.047), palette.accent, '#fff', plan, size, layout.pad);
    }

    if (plan.template === 'checklist') {
      const { band, photo, paper, cta } = layout;
      ctx.fillStyle = palette.ribbon;
      roundRectPath(ctx, band.x, band.y, band.width, band.height + 40, 40);
      ctx.fill();
      const headBox = laidHeadBox({ x: band.x + layout.pad * 1.4, y: band.y + layout.pad, width: band.width - layout.pad * 2.8, height: band.height * 0.72 }, plan, size);
      drawBlock(ctx, plan.headline || '', headBox, { color: '#fff', max: Math.round(size.width * 0.085 * plan.textScale), min: 36, maxLines: 3, rtl, weight: 900, family: 'display', align: headAlign });
      if (plan.subline) drawBlock(ctx, plan.subline, { x: band.x + layout.pad * 1.4, y: band.y + band.height * 0.72, width: band.width - layout.pad * 2.8, height: band.height * 0.24 }, { color: 'rgba(255,255,255,.9)', max: 24, min: 15, maxLines: 2, weight: 600, rtl, align: headAlign });
      ctx.save();
      ctx.shadowColor = 'rgba(40,25,10,.3)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 10;
      drawPhoto(ctx, slotImage(0), photo, 28, (slots[0] && slots[0].focusY) || 0.5);
      ctx.restore();
      drawChecklist(ctx, slots[0] || {}, paper, palette, rtl);
      if (plan.cta) drawPillLaid(ctx, plan.cta, size.width / 2, cta.y + cta.height / 2, Math.round(size.height * 0.052), palette.accent, '#fff', plan, size, layout.pad);
    }

    if (plan.template === 'banner') {
      const { photo, panel, pad } = layout;
      drawPhoto(ctx, slotImage(0), photo, 0, (slots[0] && slots[0].focusY) || 0.5);
      const gradient = ctx.createLinearGradient(0, photo.y + photo.height * 0.55, 0, photo.y + photo.height);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, 'rgba(0,0,0,.34)');
      ctx.fillStyle = gradient;
      ctx.fillRect(photo.x, photo.y, photo.width, photo.height);
      if (plan.brand) {
        const h = 44;
        ctx.font = fontSpec(700, 24, 'sans');
        const w = Math.ceil(ctx.measureText(plan.brand).width) + 40;
        roundRectPath(ctx, pad, pad, w, h, h / 2);
        ctx.fillStyle = 'rgba(0,0,0,.4)';
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(plan.brand, pad + 20, pad + h / 2 + 1);
      }
      ctx.fillStyle = panel.color || palette.card;
      ctx.fillRect(panel.x, panel.y, panel.width, panel.height);
      const inner = { x: pad * 1.4, width: size.width - pad * 2.8 };
      drawBlock(ctx, plan.headline || '', laidHeadBox({ ...inner, y: panel.y + 34, height: Math.round(panel.height * 0.42) }, plan, size), { color: palette.accent, max: Math.round(size.width * 0.078 * plan.textScale), min: 34, maxLines: 2, rtl, weight: 900, family: 'display', align: headAlign });
      const firstItems = (slots[0] && slots[0].ingredients || []).slice(0, 3);
      if (firstItems.length) {
        ctx.font = fontSpec(600, 26, 'sans');
        ctx.fillStyle = palette.ink;
        ctx.textBaseline = 'top';
        ctx.textAlign = rtl ? 'right' : 'left';
        const joined = firstItems.map((item) => `✓ ${item}`).join('   ·   ');
        ctx.fillText(joined.length > 78 ? `${joined.slice(0, 77)}…` : joined, rtl ? inner.x + inner.width : inner.x, panel.y + Math.round(panel.height * 0.52), inner.width);
      }
      if (plan.cta) drawPillLaid(ctx, plan.cta, size.width / 2, panel.y + panel.height - Math.round(panel.height * 0.2), Math.round(size.height * 0.05), palette.accent, '#fff', plan, size, pad);
    }

    if (plan.template === 'duo') {
      const { top, band, bottom, pad } = layout;
      drawPhoto(ctx, slotImage(0), top, 0, (slots[0] && slots[0].focusY) || 0.5);
      drawPhoto(ctx, slotImage(1), bottom, 0, (slots[1] && slots[1].focusY) || 0.5);
      ctx.fillStyle = palette.card;
      ctx.fillRect(band.x, band.y, band.width, band.height);
      drawBlock(ctx, plan.headline || '', laidHeadBox({ x: pad * 1.3, y: band.y + Math.round(band.height * 0.12), width: size.width - pad * 2.6, height: Math.round(band.height * 0.5) }, plan, size), { color: palette.ink, max: Math.round(size.width * 0.082 * plan.textScale), min: 32, maxLines: 2, rtl, weight: 900, family: 'display', align: headAlign });
      if (plan.cta) drawPillLaid(ctx, plan.cta, size.width / 2, band.y + band.height - Math.round(band.height * 0.2), Math.round(size.height * 0.046), palette.accent, '#fff', plan, size, pad);
      if (slots[0] && slots[0].label) {
        const h = 48;
        ctx.font = fontSpec(800, 24, 'sans');
        const w = Math.ceil(ctx.measureText(slots[0].label).width) + 44;
        roundRectPath(ctx, pad, top.y + top.height - h - 24, w, h, h / 2);
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(slots[0].label, pad + 22, top.y + top.height - h / 2 - 24 + 1);
      }
    }

    if (plan.template === 'listicle') {
      const head = laidHeadBox(layout.header, plan, size);
      drawBlock(ctx, plan.headline || '', head, { color: palette.ink, max: Math.round(size.width * 0.088 * plan.textScale), min: 36, maxLines: 2, rtl, weight: 900, family: 'display', align: headAlign });
      if (plan.subline) {
        drawBlock(ctx, plan.subline, { x: head.x, y: head.y + Math.round(size.height * 0.115), width: head.width, height: 44 }, { color: palette.ink, max: 24, min: 15, maxLines: 1, weight: 600, rtl, align: headAlign });
      }
      layout.rows.forEach((row, i) => drawListRow(ctx, slots[i] || {}, slotImage(i), row, i, palette, rtl, plan, size));
      if (plan.cta) drawPillLaid(ctx, plan.cta, size.width / 2, size.height - Math.round(size.height * 0.03), Math.round(size.height * 0.046), palette.accent, '#fff', plan, size, layout.pad);
    }

    if (plan.template === 'steps') {
      const { photo, panel, title, stepRows, cta } = layout;
      drawPhoto(ctx, slotImage(0), photo, 0, (slots[0] && slots[0].focusY) || 0.5);
      const gradient = ctx.createLinearGradient(0, photo.y, 0, photo.y + photo.height);
      gradient.addColorStop(0, 'rgba(0,0,0,.12)');
      gradient.addColorStop(1, 'rgba(0,0,0,.66)');
      ctx.fillStyle = gradient;
      ctx.fillRect(photo.x, photo.y, photo.width, photo.height);
      const photoTitleBox = { x: title.x, y: Math.round(photo.y + photo.height * 0.62), width: title.width, height: Math.round(photo.height * 0.32) };
      drawBlock(ctx, plan.headline || '', photoTitleBox, { color: '#fff', max: Math.round(size.width * 0.085 * plan.textScale), min: 34, maxLines: 2, rtl, weight: 900, family: 'display', align: headAlign });
      ctx.fillStyle = palette.card;
      ctx.fillRect(panel.x, panel.y, panel.width, panel.height);
      const heading = rtl ? 'طريقة التحضير' : 'HOW TO MAKE IT';
      ctx.font = fontSpec(800, Math.round(size.width * 0.042), 'display');
      ctx.fillStyle = palette.accent;
      ctx.textBaseline = 'top';
      ctx.textAlign = rtl ? 'right' : 'left';
      ctx.fillText(heading, rtl ? title.x + title.width : title.x, title.y - 6);
      drawStepsPanel(ctx, slots[0] || {}, stepRows, palette, rtl);
      if (plan.cta) drawPillLaid(ctx, plan.cta, size.width / 2, cta.y, Math.round(size.height * 0.05), palette.accent, '#fff', plan, size, layout.pad);
    }

    if (plan.template === 'quote') {
      const { card, pad } = layout;
      drawPhoto(ctx, slotImage(0), layout.photo, 0, (slots[0] && slots[0].focusY) || 0.5);
      ctx.fillStyle = 'rgba(10,10,12,.28)';
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.save();
      ctx.shadowColor = 'rgba(20,14,6,.3)';
      ctx.shadowBlur = 34;
      ctx.shadowOffsetY = 12;
      roundRectPath(ctx, card.x, card.y, card.width, card.height, 26);
      ctx.fillStyle = 'rgba(255,252,246,.96)';
      ctx.fill();
      ctx.restore();
      const markRtl = isRtl(plan.headline);
      ctx.font = fontSpec(900, Math.round(card.width * 0.16), 'serif');
      ctx.fillStyle = palette.accent;
      ctx.textAlign = markRtl ? 'right' : 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(markRtl ? '”' : '“', markRtl ? card.x + card.width - 28 : card.x + 28, card.y + 4);
      drawBlock(ctx, plan.headline || '', { x: card.x + pad, y: card.y + pad * 1.4, width: card.width - pad * 2, height: card.height * 0.56 }, { color: palette.ink, max: Math.round(size.width * 0.078 * plan.textScale), min: 32, maxLines: 4, rtl, weight: 900, family: 'display', align: headAlign });
      if (plan.subline) {
        drawBlock(ctx, plan.subline, { x: card.x + pad, y: card.y + card.height * 0.66, width: card.width - pad * 2, height: card.height * 0.18 }, { color: palette.ink, max: 25, min: 16, maxLines: 2, weight: 600, rtl, align: headAlign });
      }
      if (plan.brand) {
        ctx.fillStyle = palette.accent;
        const lineW = 46;
        ctx.fillRect(markRtl ? card.x + card.width - pad - lineW : card.x + pad, card.y + card.height - pad, lineW, 4);
        ctx.font = fontSpec(800, 24, 'sans');
        ctx.fillStyle = palette.ink;
        ctx.textAlign = markRtl ? 'right' : 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(plan.brand, markRtl ? card.x + card.width - pad - lineW - 14 : card.x + pad + lineW + 14, card.y + card.height - pad + 2);
      }
      if (plan.cta) drawPillLaid(ctx, plan.cta, size.width / 2, size.height - Math.round(size.height * 0.05), Math.round(size.height * 0.052), '#ffffff', palette.accent, plan, size, pad);
    }

    if (plan.template === 'circle') {
      const { circle, title, cta } = layout;
      drawBlob(ctx, circle.cx, circle.cy, circle.r * 1.12, circle.r * 1.12, palette.soft, 0.1, 4);
      drawCirclePhoto(ctx, slotImage(0), circle, (slots[0] && slots[0].focusY) || 0.5);
      drawBlock(ctx, plan.headline || '', laidHeadBox(title, plan, size), { color: palette.ink, max: Math.round(size.width * 0.085 * plan.textScale), min: 32, maxLines: 3, rtl, weight: 900, family: 'display', align: headAlign });
      const items = (slots[0] && slots[0].ingredients || []).slice(0, 3);
      if (items.length) {
        ctx.font = fontSpec(650, 26, 'sans');
        ctx.fillStyle = 'rgba(60,50,40,.72)';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';
        const joined = items.join('  ·  ');
        ctx.fillText(joined.length > 64 ? `${joined.slice(0, 63)}…` : joined, size.width / 2, title.y + title.height - 6, title.width);
      }
      if (plan.cta) drawPillLaid(ctx, plan.cta, size.width / 2, cta.y, Math.round(size.height * 0.052), palette.accent, '#fff', plan, size, layout.pad);
    }
    return layout;
  }

  /** Draw the pin. `image` may be null: the pin then renders as text only. */
  function render(canvas, image, design) {
    const ctx = canvas.getContext('2d');
    const plan = normalizeDesign(design);
    const size = { width: canvas.width, height: canvas.height };
    if (PRO_TEMPLATES.includes(plan.template)) {
      const images = image && typeof image === 'object' && !image.naturalWidth && !image.nodeName ? image : { background: image, slots: {} };
      return renderPro(canvas, images, plan);
    }
    const box = layout(plan, size);
    const onDark = plan.template !== 'card';
    const transform = plan.uppercase ? (value) => value.toUpperCase() : (value) => value;

    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = '#f4efe7';
    ctx.fillRect(0, 0, size.width, size.height);
    if (image) drawCover(ctx, image, size, plan.focusY);

    if (plan.template === 'card') drawCard(ctx, plan, box);
    else drawScrim(ctx, plan, box);

    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    drawChips(ctx, plan, box);

    const classicRtl = isRtl(plan.headline + plan.subline);
    const hAlign = (plan.layout && plan.layout.headlineAlign) || 'start';
    const stackShift = Math.round(((plan.layout && plan.layout.headlineShiftY) || 0) * size.height / 100);
    const anchorFor = (rect) => {
      if (hAlign === 'center') return { x: rect.x + rect.width / 2, align: 'center' };
      if (hAlign === 'end') return { x: classicRtl ? rect.x : rect.x + rect.width, align: classicRtl ? 'right' : 'left' };
      return { x: classicRtl ? rect.x + rect.width : rect.x, align: classicRtl ? 'right' : 'left' };
    };

    const headlineBox = { ...box.headline, y: box.headline.y + stackShift };
    const headline = fitText(ctx, plan.headline, {
      maxWidth: headlineBox.width,
      maxHeight: headlineBox.height,
      max: Math.round(size.width * 0.105 * plan.textScale),
      min: Math.round(size.width * 0.05),
      weight: 800,
      family: plan.font,
      lineHeightRatio: 1.06,
      maxLines: 4,
      transform,
    });
    ctx.font = fontSpec(800, headline.size, plan.font);
    ctx.fillStyle = onDark ? '#fff' : INK;
    const headAnchor = anchorFor(headlineBox);
    withShadow(ctx, onDark, size.width, () => {
      ctx.textAlign = headAnchor.align;
      headline.lines.forEach((line, index) => {
        ctx.fillText(line, headAnchor.x, headlineBox.y + index * headline.lineHeight);
      });
    });

    const sublineBox = { ...box.subline, y: box.subline.y + stackShift };
    const subline = fitText(ctx, plan.subline, {
      maxWidth: sublineBox.width,
      maxHeight: sublineBox.height,
      max: Math.round(size.width * 0.045 * plan.textScale),
      min: Math.round(size.width * 0.026),
      weight: 500,
      family: plan.font,
      lineHeightRatio: 1.34,
      maxLines: 3,
    });
    ctx.font = fontSpec(500, subline.size, plan.font);
    ctx.fillStyle = onDark ? 'rgba(255,255,255,.92)' : 'rgba(32,36,47,.8)';
    const subAnchor = anchorFor(sublineBox);
    withShadow(ctx, onDark, size.width, () => {
      ctx.textAlign = subAnchor.align;
      subline.lines.forEach((line, index) => {
        ctx.fillText(line, subAnchor.x, sublineBox.y + index * subline.lineHeight);
      });
    });
    ctx.textAlign = 'left';

    drawFooter(ctx, plan, box);
    return box;
  }

  return {
    PIN_SIZE,
    TEMPLATES,
    CLASSIC_TEMPLATES,
    PRO_TEMPLATES,
    PALETTES,
    FONTS,
    clamp,
    domainOf,
    isRtl,
    normalizeDesign,
    normalizeSlot,
    defaultDesign,
    defaultSlots,
    slotCountFor,
    recipeChips,
    pinText,
    layout,
    proLayout,
    coverRect,
    fitRect,
    fitImage,
    imageSize,
    wrapLines,
    fitText,
    fontSpec,
    render,
  };
}));

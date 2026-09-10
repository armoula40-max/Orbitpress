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
  const TEMPLATES = ['scrim', 'card', 'top'];
  const FONTS = {
    sans: '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
  };
  const ACCENT = '#f07f68';
  const INK = '#20242f';

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

  function normalizeDesign(input) {
    const raw = input && typeof input === 'object' ? input : {};
    const template = TEMPLATES.includes(raw.template) ? raw.template : 'scrim';
    return {
      template,
      headline: String(raw.headline || '').trim().slice(0, 120),
      subline: String(raw.subline || '').trim().slice(0, 200),
      brand: String(raw.brand || '').trim().slice(0, 60),
      cta: String(raw.cta || '').trim().slice(0, 40),
      chips: Array.isArray(raw.chips) ? raw.chips.map((chip) => String(chip || '').trim()).filter(Boolean).slice(0, 3) : [],
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

  function recipeChips(recipe, recipeCount) {
    const chips = [];
    if (recipe) {
      if (recipe.prepTime) chips.push(`${recipe.prepTime} prep`);
      if (recipe.cookTime) chips.push(`${recipe.cookTime} cook`);
      if (recipe.recipeYield) chips.push(`Serves ${recipe.recipeYield}`);
    }
    if (!chips.length && recipeCount > 1) chips.push(`${recipeCount} recipes`);
    return chips.slice(0, 3);
  }

  function defaultDesign(context) {
    const data = context || {};
    const recipes = Array.isArray(data.recipes) ? data.recipes : [];
    const recipe = data.recipe || (data.contentType === 'recipe' ? recipes[0] : null);
    const title = String(data.title || '').split(/\||–|—/)[0].trim();
    return normalizeDesign({
      template: 'scrim',
      headline: title.slice(0, 90),
      subline: String(data.metaDescription || '').trim().slice(0, 150),
      brand: String(data.siteName || domainOf(data.publishedUrl || data.wordpressBaseUrl || '') || '').slice(0, 60),
      cta: data.contentType === 'recipe' ? 'Full recipe' : 'Read more',
      chips: recipeChips(recipe, recipes.length || (recipe ? 1 : 0)),
    });
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
    const rowY = box.footer.y + Math.round((box.footer.height - size * 1.7) / 2);
    let cursor = box.footer.x;
    if (plan.cta) {
      ctx.font = fontSpec(800, size, plan.font);
      const label = plan.uppercase ? plan.cta.toUpperCase() : plan.cta;
      const width = Math.ceil(ctx.measureText(label).width) + Math.round(size * 1.6);
      const height = Math.round(size * 1.7);
      ctx.fillStyle = ACCENT;
      roundRect(ctx, cursor, rowY, width, height, height / 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cursor + Math.round(size * 0.8), rowY + height / 2 + 1);
      cursor += width + Math.round(size * 0.9);
    }
    if (!plan.brand) return;
    ctx.font = fontSpec(700, size, plan.font);
    ctx.fillStyle = onDark ? 'rgba(255,255,255,.86)' : 'rgba(32,36,47,.66)';
    ctx.textBaseline = 'middle';
    ctx.fillText(plan.brand, cursor, rowY + Math.round(size * 0.85) + 1);
  }

  /** Draw the pin. `image` may be null: the pin then renders as text only. */
  function render(canvas, image, design) {
    const ctx = canvas.getContext('2d');
    const plan = normalizeDesign(design);
    const size = { width: canvas.width, height: canvas.height };
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

    const headline = fitText(ctx, plan.headline, {
      maxWidth: box.headline.width,
      maxHeight: box.headline.height,
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
    withShadow(ctx, onDark, size.width, () => {
      headline.lines.forEach((line, index) => {
        ctx.fillText(line, box.headline.x, box.headline.y + index * headline.lineHeight);
      });
    });

    const subline = fitText(ctx, plan.subline, {
      maxWidth: box.subline.width,
      maxHeight: box.subline.height,
      max: Math.round(size.width * 0.045 * plan.textScale),
      min: Math.round(size.width * 0.026),
      weight: 500,
      family: plan.font,
      lineHeightRatio: 1.34,
      maxLines: 3,
    });
    ctx.font = fontSpec(500, subline.size, plan.font);
    ctx.fillStyle = onDark ? 'rgba(255,255,255,.92)' : 'rgba(32,36,47,.8)';
    withShadow(ctx, onDark, size.width, () => {
      subline.lines.forEach((line, index) => {
        ctx.fillText(line, box.subline.x, box.subline.y + index * subline.lineHeight);
      });
    });

    drawFooter(ctx, plan, box);
    return box;
  }

  return {
    PIN_SIZE,
    TEMPLATES,
    FONTS,
    clamp,
    domainOf,
    normalizeDesign,
    defaultDesign,
    recipeChips,
    pinText,
    layout,
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

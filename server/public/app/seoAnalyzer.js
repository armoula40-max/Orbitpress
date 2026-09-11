/* global define, module, window */
/**
 * seoAnalyzer.js — Rank Math / Yoast content-analysis, in Arabic and English.
 *
 * Pure functions only (no DOM, no network) so the exact same checks run:
 *   - in the browser review screen (live traffic-light score), and
 *   - on the Node server (pre-publish gate + stored SEO score).
 *
 * Reading tests that Yoast/Rank Math do not support for Arabic (Flesch,
 * passive voice, transition words, consecutive-sentence beginnings) are
 * intentionally excluded for Arabic content instead of penalising it.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.OrbitPressSeo = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ARABIC_RE = /[\u0600-\u06FF]/;

  function normalizeArabic(value) {
    return String(value || '')
      .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '') // tashkeel / harakat
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[ًٌٍَُِّْ]/g, '');
  }

  function norm(value) {
    return normalizeArabic(String(value || '').toLowerCase()).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  }

  const ARABIC_STOPWORDS = 'في من على الى إلى عن مع هذا هذه تلك الذي التي التي كيف ما ماذا هل قد كان كانت يتم يكون واو ثم او أو لقد لك به فيها فيه عند كل بعض غير كيفية طريقة عمل افضل أحسن أجمل';
  const ENGLISH_STOPWORDS = 'the a an of for and or to in on at with how make recipe easy best your you is are was were this that it its do does';
  function stopwords(rtl) {
    return new Set((rtl ? ARABIC_STOPWORDS : ENGLISH_STOPWORDS).split(/\s+/));
  }

  function tokens(value, rtl) {
    const words = norm(value).split(' ').filter(Boolean);
    const stop = stopwords(rtl);
    return words.filter((w) => w.length >= (rtl ? 2 : 3) && !stop.has(w));
  }

  function isRtl(value) { return ARABIC_RE.test(String(value || '')); }

  function htmlToText(html) {
    return String(html || '')
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|h[1-6]|li|br|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#?[a-z0-9]+;/gi, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  function wordCount(value) {
    const text = htmlToText(value);
    return text ? text.split(' ').filter(Boolean).length : 0;
  }

  function headings(html) {
    const out = [];
    const re = /<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
    let m;
    while ((m = re.exec(String(html || '')))) out.push({ level: Number(m[1]), text: htmlToText(m[2]) });
    return out;
  }

  function countOccurrences(haystack, needle) {
    const h = norm(haystack);
    const n = norm(needle);
    if (!n) return 0;
    let count = 0;
    let idx = h.indexOf(n);
    while (idx !== -1) { count += 1; idx = h.indexOf(n, idx + n.length); }
    return count;
  }

  function containsAllTokens(text, keyphrase, rtl) {
    const ks = tokens(keyphrase, rtl);
    if (!ks.length) return false;
    const t = norm(text);
    // Multi-word keyphrases match as a phrase; otherwise every content word must appear.
    if (ks.length >= 2) return t.includes(norm(keyphrase));
    return ks.every((w) => t.includes(w));
  }

  /**
   * Build an SEO title that keeps Rank Math's "keyphrase at the start" rule:
   * "<keyphrase>: <post title>" truncated on a word boundary within 60 chars.
   */
  function buildSeoTitle({ keyphrase, title, siteName, rtl } = {}) {
    const k = String(keyphrase || '').trim();
    const t = String(title || '').trim();
    const useRtl = rtl != null ? rtl : isRtl(`${k} ${t}`);
    let candidate = k && !norm(t).startsWith(norm(k)) && !norm(t).includes(norm(k))
      ? (useRtl ? `${t} – ${k}` : `${k}: ${t}`)
      : t;
    if (siteName && candidate.length < 45) {
      candidate = `${candidate} ${useRtl ? '|' : '|'} ${siteName}`;
    }
    if (candidate.length <= 60) return candidate;
    if (k.length >= 55) return k.slice(0, 60);
    const limit = 60;
    const body = candidate;
    const cut = body.slice(0, limit);
    const lastSpace = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('–'));
    return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim();
  }

  function buildSeoDescription({ keyphrase, metaDescription, title, rtl } = {}) {
    const k = String(keyphrase || '').trim();
    let d = String(metaDescription || '').trim();
    const useRtl = rtl != null ? rtl : isRtl(`${k} ${d} ${title}`);
    if (!d && title) d = useRtl ? `${k} ${title}`.trim() : `${k} ${title}`.trim();
    if (k && !norm(d).includes(norm(k))) d = `${k} – ${d}`;
    if (d.length <= 156) return d;
    const cut = d.slice(0, 155);
    const lastSpace = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('،'), cut.lastIndexOf(','));
    return `${lastSpace > 60 ? cut.slice(0, lastSpace) : cut}…`;
  }

  /**
   * Main analysis. `input` fields:
   *   keyphrase, secondaryKeyphrases[], seoTitle, seoDescription, slug,
   *   contentHtml (post body WITH recipe card and figures), wordTarget,
   *   altTexts[], internalLinkCount, externalLinkCount, keyphraseUsedBefore,
   *   contentType ('recipe'|'article'), recipe (normalized), recipes (roundup),
   *   schemaValid (bool), pinterestRecipe (bool)
   */
  function analyze(input) {
    const d = input || {};
    const keyphrase = String(d.keyphrase || '').trim();
    const rtl = isRtl([keyphrase, d.seoTitle, d.contentHtml].filter(Boolean).join(' '));
    const checks = [];
    const add = (id, label, status, detail) => checks.push({ id, label, status, detail: detail || '' });
    const text = htmlToText(d.contentHtml || '');
    const words = text ? text.split(' ').filter(Boolean).length : 0;
    const target = Number(d.wordTarget) || (d.contentType === 'recipe' ? 900 : 1200);

    // ---- Focus keyphrase -------------------------------------------------
    const kpTokens = tokens(keyphrase, rtl);
    add('kp', 'الكلمة المفتاحية الأساسية محددة', keyphrase ? (kpTokens.length <= 4 ? 'good' : 'warn') : 'bad',
      keyphrase ? (kpTokens.length > 4 ? 'الأفضل أن تكون 2–4 كلمات (long tail)' : `${kpTokens.length} كلمات مفتاحية`) : 'لم تُحدَّد كلمة التركيز');

    if (keyphrase) {
      const seoTitle = String(d.seoTitle || '');
      const titleN = norm(seoTitle);
      const kN = norm(keyphrase);
      add('seo-title', 'عنوان SEO يحوي الكلمة المفتاحية في بدايته',
        titleN.startsWith(kN) || (rtl && kpTokens.length && kpTokens.every((w) => titleN.slice(0, Math.round(kN.length * 1.4)).includes(w))) ? 'good'
          : titleN.includes(kN) ? 'warn' : 'bad',
        seoTitle ? `${seoTitle.length} حرف` : 'فارغ');
      add('seo-title-length', 'طول عنوان SEO بين 30 و60 حرفًا',
        seoTitle.length >= 30 && seoTitle.length <= 60 ? 'good' : seoTitle.length ? 'warn' : 'bad',
        seoTitle ? `${seoTitle.length}/60` : '');
      const desc = String(d.seoDescription || '');
      add('meta-desc', 'وصف Meta يحوي الكلمة المفتاحية',
        desc && norm(desc).includes(kN) ? 'good' : 'bad', desc ? `${desc.length} حرف` : 'فارغ');
      add('meta-desc-length', 'طول الوصف بين 50 و160 حرفًا',
        desc.length >= 50 && desc.length <= 160 ? 'good' : desc.length ? 'warn' : 'bad', desc ? `${desc.length}/160` : '');
      const slugN = norm(String(d.slug || '').replace(/-/g, ' '));
      const slugWords = kpTokens;
      const inSlug = slugWords.filter((w) => slugN.includes(w)).length;
      add('slug', 'الكلمة المفتاحية في رابط المقال (slug)',
        slugWords.length && inSlug === slugWords.length ? 'good' : inSlug >= Math.ceil(slugWords.length / 2) ? 'warn' : 'bad', d.slug || '');
      add('previous', 'الكلمة المفتاحية غير مستعملة في مقال سابق',
        d.keyphraseUsedBefore ? 'bad' : 'good', d.keyphraseUsedBefore ? 'مكررة' : 'فريدة');

      // ---- Content placement ---------------------------------------------
      const firstText = text;
      const introCut = Math.max(220, Math.round(words * 0.6));
      const intro = firstText.slice(0, introCut);
      add('intro', 'الكلمة المفتاحية في الفقرة الأولى',
        norm(intro).includes(kN) ? 'good' : 'bad', 'أول 10% من المقال');
      const occurrences = countOccurrences(text, keyphrase);
      const density = words ? (occurrences * kpTokens.length / words) * 100 : 0;
      add('density', 'كثافة الكلمة المفتاحية بين 0.5% و2.5%',
        density >= 0.5 && density <= 2.5 ? 'good' : density > 2.5 ? 'warn' : 'bad',
        `${occurrences} مرة · ${density.toFixed(2)}%`);
      const hs = headings(d.contentHtml || '');
      const matching = hs.filter((h) => containsAllTokens(h.text, keyphrase, rtl)).length;
      const ratio = hs.length ? matching / hs.length : 0;
      add('subheadings', 'الكلمة في 30–75% من العناوين الفرعية',
        hs.length >= 2 && ratio >= 0.3 && ratio <= 0.75 ? 'good' : matching > 0 ? 'warn' : 'bad',
        hs.length ? `${matching}/${hs.length} عناوين` : 'لا توجد عناوين H2/H3');
      const alts = Array.isArray(d.altTexts) ? d.altTexts : [];
      const altHit = alts.some((a) => containsAllTokens(a, keyphrase, rtl));
      add('img-alt', 'الكلمة في النص البديل لإحدى الصور',
        altHit ? 'good' : 'warn', alts.length ? `${alts.length} صورة` : 'لا صور بعد');
      add('length', `طول المحتوى ${target >= 1200 ? '1200+' : '900+'} كلمة (الحد الأدنى لـ Rank Math 600)`,
        words >= target ? 'good' : words >= 600 ? 'warn' : 'bad', `${words} كلمة`);
      add('internal', 'رابط داخلي واحد على الأقل',
        Number(d.internalLinkCount) >= 1 ? 'good' : 'bad', d.internalLinkCount ? `${d.internalLinkCount} روابط` : 'لا روابط داخلية');
      add('external', 'رابط خارجي موثوق واحد على الأقل',
        Number(d.externalLinkCount) >= 1 ? 'good' : 'warn', d.externalLinkCount ? `${d.externalLinkCount} روابط` : 'غير متوفر');
      add('h2-count', 'توزيع جيد للعناوين (3–8 عناوين H2/H3)',
        hs.length >= 3 && hs.length <= 12 ? 'good' : hs.length ? 'warn' : 'bad', `${hs.length} عناوين`);

      // ---- Recipe + Pinterest recipe rich pin ----------------------------
      if (d.contentType === 'recipe' || Number(d.recipesCount) > 0) {
        const list = Number(d.recipesCount) > 0 ? (Array.isArray(d.recipes) ? d.recipes : []) : [d.recipe].filter(Boolean);
        const valid = list.every((r) => r && Array.isArray(r.ingredients) && r.ingredients.length >= 4
          && Array.isArray(r.instructions) && r.instructions.length >= 4
          && r.prepTime && r.cookTime && r.recipeYield);
        add('recipe-data', 'بيانات الوصفة كاملة (المكوّنات، الخطوات، الأوقات، الكمية)',
          valid ? 'good' : 'bad', list.length ? `${list.length} وصفة` : 'لا بيانات');
        add('recipe-schema', 'مخطط Recipe (JSON-LD) صالح لبينترست وجوجل',
          d.schemaValid ? 'good' : 'bad', d.schemaValid ? 'مولّد مع المقال' : 'غير مولّد');
      } else {
        add('article-schema', 'مخطط Article (JSON-LD) صالح', d.schemaValid ? 'good' : 'bad', d.schemaValid ? 'مولّد' : 'غير مولّد');
      }
    }

    // Score: green = 1, warn = 0.55, bad/info = 0; only "graded" checks count.
    const weights = { warn: 0.55, good: 1, bad: 0 };
    const graded = checks.filter((c) => c.status === 'good' || c.status === 'warn' || c.status === 'bad');
    const score = graded.length
      ? Math.round(graded.reduce((sum, c) => sum + (weights[c.status] || 0), 0) / graded.length * 100)
      : 0;
    const status = score >= 85 ? 'good' : score >= 60 ? 'warn' : 'bad';
    return {
      score,
      status,
      checks,
      stats: { words, target, rtl },
      bad: checks.filter((c) => c.status === 'bad').length,
      warn: checks.filter((c) => c.status === 'warn').length,
      good: checks.filter((c) => c.status === 'good').length,
    };
  }

  /**
   * Match internal-link anchor suggestions to real published posts.
   * suggestions: [{anchor, reason}], posts: [{id,title,link,slug}]
   * Returns [{anchor, url, title}] for verified matches only (never invents).
   */
  function matchInternalLinks(suggestions, posts, selfId) {
    const out = [];
    const seen = new Set();
    (Array.isArray(posts) ? posts : []).forEach((p) => {
      if (!p || String(p.id) === String(selfId || '')) return;
      const title = norm(p.title);
      const slug = norm(String(p.slug || '').replace(/-/g, ' '));
      (Array.isArray(suggestions) ? suggestions : []).forEach((s) => {
        if (!s || !s.anchor || seen.has(s.anchor)) return;
        const anchor = norm(s.anchor);
        const anchorTokensList = tokens(s.anchor, isRtl(s.anchor)).filter((w) => w.length > 3);
        const score = (anchor && (title.includes(anchor) || slug.includes(anchor)) ? 3 : 0)
          + anchorTokensList.filter((w) => title.includes(w) || slug.includes(w)).length;
        if (score >= 2) {
          seen.add(s.anchor);
          out.push({ anchor: String(s.anchor).trim(), url: p.link || p.url, title: p.title });
        }
      });
    });
    return out.slice(0, 3);
  }

  /** Insert internal/external links into text nodes of the body HTML only. */
  function injectLinks(html, links) {
    let body = String(html || '');
    (Array.isArray(links) ? links : []).slice(0, 4).forEach((link) => {
      if (!link || !link.anchor || !link.url || body.includes(`href="${link.url}"`)) return;
      const anchor = link.anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let done = false;
      body = body.replace(/(<[^>]+>)|([^<]+)/g, (whole, tag, textNode) => {
        if (done || tag || !textNode) return whole;
        const re = new RegExp(anchor.replace(/\s+/g, '\\s+'), 'i');
        if (re.test(textNode)) {
          done = true;
          return textNode.replace(re, (m) => `<a href="${link.url}"${link.external ? ' target="_blank" rel="noopener"' : ''}>${m}</a>`);
        }
        return whole;
      });
    });
    return body;
  }

  return {
    isRtl,
    normalizeArabic,
    norm,
    tokens,
    htmlToText,
    wordCount,
    headings,
    buildSeoTitle,
    buildSeoDescription,
    analyze,
    matchInternalLinks,
    injectLinks,
  };
}));

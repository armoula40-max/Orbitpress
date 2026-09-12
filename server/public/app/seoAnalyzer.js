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
      checks[checks.length - 1].blocking = false; // Rank Math recommendation only, and network-verified
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

    // ---- Deterministic readability checks (suggestions, non-blocking) ----
    const paragraphs = String(d.contentHtml || '').match(/<p\b[^>]*>([\s\S]*?)<\/p>/gi) || [];
    const pLengths = paragraphs.map((p) => wordCount(p));
    const longestParagraph = pLengths.reduce((m, n) => Math.max(m, n), 0);
    add('readability-paragraphs', 'فقرات قصيرة قابلة للقراءة (لا توجد كتلة نصية طويلة جدًا)',
      longestParagraph === 0 || longestParagraph <= 120 ? 'good' : 'warn',
      longestParagraph ? `أطول فقرة ${longestParagraph} كلمة` : '');
    checks[checks.length - 1].blocking = false;
    const hasList = /<(ul|ol)\b/i.test(String(d.contentHtml || ''));
    add('readability-lists', 'قوائم نقطية/مرقمة حيثما يكون ذلك مناسبًا', hasList ? 'good' : 'warn', '');
    checks[checks.length - 1].blocking = false;
    // every embedded <img> must carry an alt attribute
    const imgTags = String(d.contentHtml || '').match(/<img\b[^>]*>/gi) || [];
    const missingAlt = imgTags.filter((tag) => !/\balt\s*=/.test(tag) || /\balt\s*=\s*(""|'')/.test(tag)).length;
    add('img-alt-required', 'لكل صورة داخل المقال نص بديل (alt) غير فارغ',
      missingAlt === 0 ? 'good' : 'bad', imgTags.length ? `${imgTags.length - missingAlt}/${imgTags.length} صورة` : 'لا صور داخل المتن');

    // Score: green = 1, warn = 0.55, bad/info = 0. Checks flagged non-blocking
    // (recommendations like an outbound reference link) are displayed but
    // never stop the post reaching 100.
    const weights = { warn: 0.55, good: 1, bad: 0 };
    const graded = checks.filter((c) => c.status !== 'info' && c.blocking !== false);
    const score = graded.length
      ? Math.round(graded.reduce((sum, c) => sum + (weights[c.status] || (c.status === 'warn' ? 0.55 : 0)), 0) / graded.length * 100)
      : 0;

    // Detailed scorecard: Technical / On-page / Readability / Media / Schema.
    const GROUP_DEFS = [
      { id: 'technical', label: 'SEO التقني', max: 25, ids: ['kp', 'seo-title', 'seo-title-length', 'meta-desc', 'meta-desc-length', 'slug', 'previous'] },
      { id: 'onpage', label: 'تحسين الصفحة', max: 25, ids: ['intro', 'density', 'subheadings', 'h2-count', 'length', 'internal', 'external'] },
      { id: 'readability', label: 'سهولة القراءة', max: 20, ids: ['readability-paragraphs', 'readability-lists'] },
      { id: 'media', label: 'الصور والوسائط', max: 15, ids: ['img-alt', 'img-alt-required'] },
      { id: 'schema', label: 'المخطط (Schema)', max: 15, ids: ['recipe-data', 'recipe-schema', 'article-schema'] },
    ];
    const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
    const groups = GROUP_DEFS.map((g) => {
      const present = g.ids.map((id) => byId[id]).filter(Boolean);
      const ratio = present.length
        ? present.reduce((sum, c) => sum + (weights[c.status] || (c.status === 'warn' ? 0.55 : 0)), 0) / present.length
        : 1;
      return { id: g.id, label: g.label, max: g.max, score: Math.round(ratio * g.max), ratio: Math.round(ratio * 100) };
    });

    const status = score >= 85 ? 'good' : score >= 60 ? 'warn' : 'bad';
    const blockers = graded.filter((c) => c.status === 'bad');
    return {
      score,
      status,
      checks,
      groups,
      blockers,
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
          out.push({ id: p.id, anchor: String(s.anchor).trim(), url: p.link || p.url, title: p.title });
        }
      });
    });
    return out.slice(0, 3);
  }

  function escapeAttr(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * Build a tolerant regex SOURCE from a raw phrase: Arabic letter variants
   * (alef/ya/ta-marbuta), dropped tashkeel, flexible whitespace and
   * punctuation — so "طَرِيقَة عَمَل" still matches "طريقة عمل" in a body.
   */
  function phrasePatternSource(phrase) {
    let out = '';
    for (const ch of String(phrase || '')) {
      if (/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/u.test(ch)) continue; // tashkeel/harakat: match zero-width
      if ('أإآٱا'.includes(ch)) out += '[أإآٱا]';
      else if ('ىيئ'.includes(ch)) out += '[ىيئ]';
      else if ('ؤو'.includes(ch)) out += '[ؤو]';
      else if ('ةه'.includes(ch)) out += '[ةه]';
      else if (/\s/.test(ch)) out += '\\s+';
      else if (/[،,.;:!؟?()\-–—]/.test(ch)) out += '\\s*[.,;:،؟?!\\-–—]*\\s*';
      else if (/[\p{L}\p{N}]/u.test(ch)) out += ch.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return out;
  }

  // Filler prefixes whose removal still leaves a usable post-title phrase.
  const TITLE_PREFIXES = {
    ar: ['طريقه', 'طريقة', 'عمل', 'وصفه', 'وصفة', 'كيفيه', 'كيفية', 'كيف', 'اسهل', 'أسهل', 'افضل', 'أفضل',
      'احسن', 'أحسن', 'اجمل', 'أجمل', 'اشهى', 'أشهى', 'الذ', 'ألذ', 'انواع', 'أنواع', 'اهم', 'أهم',
      'نصائح', 'خطوات', 'دليل', 'اسرار', 'أسرار', 'سر', 'كل', 'ما', 'هو', 'هي', 'حول', 'لعمل', 'تحضير'],
    en: ['how', 'to', 'make', 'recipe', 'for', 'the', 'best', 'easy', 'quick', 'guide', 'tips', 'ultimate'],
  };

  /** Full title plus meaningful variants (prefix stripped) as raw phrases. */
  function titlePhraseVariants(title, rtl) {
    const raw = String(title || '').trim().replace(/\s+/g, ' ');
    const variants = [raw];
    const prefixes = rtl ? TITLE_PREFIXES.ar : TITLE_PREFIXES.en;
    let words = raw.split(/\s+/);
    for (let i = 0; i < Math.min(3, words.length - 1); i += 1) {
      const first = normalizeArabic(words[0] || '').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
      if (!prefixes.some((p) => normalizeArabic(p) === first || first.startsWith(normalizeArabic(p)))) break;
      words = words.slice(1);
      if (words.length) variants.push(words.join(' '));
    }
    // Keep variants with at least 2 content tokens (or a long single token).
    return variants.filter((v) => {
      const t = tokens(v, rtl);
      return t.length >= 2 || (t.length === 1 && t[0].length >= 6);
    });
  }

  /**
   * Reverse direction of matchInternalLinks: scan the body for REAL published
   * post titles that already occur in the text and link the first occurrence
   * in place. Never links inside an existing anchor; one link per post.
   * Returns { html, links:[{id,anchor,url,title,inline:true}] }.
   */
  function autolinkPosts(html, posts, { selfId = null, max = 3, skipIds = null } = {}) {
    const links = [];
    const usedPosts = new Set();
    let body = String(html || '');
    const skip = skipIds instanceof Set ? skipIds : new Set(Array.isArray(skipIds) ? skipIds : []);
    const candidates = [];
    (Array.isArray(posts) ? posts : []).forEach((p) => {
      if (!p || !(p.link || p.url) || !p.title) return;
      if (String(p.id) === String(selfId == null ? '' : selfId) && selfId != null) return;
      if (skip.has(String(p.id))) return;
      const rtl = isRtl(p.title);
      titlePhraseVariants(p.title, rtl).forEach((phrase) => candidates.push({ p, phrase, rtl }));
    });
    // Longest/most-specific phrases first.
    candidates.sort((a, b) => norm(b.phrase).length - norm(a.phrase).length);
    for (const cand of candidates) {
      if (links.length >= max) break;
      if (usedPosts.has(String(cand.p.id))) continue;
      const source = phrasePatternSource(cand.phrase);
      if (norm(cand.phrase).length < 6) continue;
      const re = new RegExp(source, 'i');
      let matchedText = '';
      let inAnchor = 0;
      body = body.replace(/(<\/?a\b[^>]*>)|(<[^>]+>)|([^<]+)/gi, (whole, anchorTag, otherTag, textNode) => {
        if (matchedText || anchorTag === undefined && otherTag === undefined && textNode === undefined) return whole;
        if (anchorTag) {
          if (/^<a\b/i.test(anchorTag)) inAnchor += 1;
          else if (/^<\/a/i.test(anchorTag)) inAnchor = Math.max(0, inAnchor - 1);
          return whole;
        }
        if (otherTag || !textNode || inAnchor > 0) return whole;
        const m = textNode.match(re);
        if (!m) return whole;
        const idx = m.index;
        const before = textNode[idx - 1] || '';
        const after = textNode[idx + m[0].length] || '';
        if (/[\p{L}\p{N}]/u.test(before) || /[\p{L}\p{N}]/u.test(after)) return whole; // no partial-word links
        matchedText = m[0];
        return textNode.slice(0, idx)
          + `<a href="${cand.p.link || cand.p.url}" data-orbitpress-internal="1" title="${escapeAttr(cand.p.title)}">${m[0]}</a>`
          + textNode.slice(idx + m[0].length);
      });
      if (matchedText) {
        usedPosts.add(String(cand.p.id));
        links.push({ id: cand.p.id, anchor: matchedText.trim(), url: cand.p.link || cand.p.url, title: cand.p.title, inline: true });
      }
    }
    return { html: body, links };
  }

  /** Rank real posts by how their title overlaps the draft's context text. */
  function rankPostsForContext(posts, contextText, { selfId = null } = {}) {
    const rtl = isRtl(contextText || '');
    const wanted = new Set(tokens(contextText || '', rtl));
    return (Array.isArray(posts) ? posts : [])
      .filter((p) => p && p && (p.link || p.url) && p.title
        && (selfId == null || String(p.id) !== String(selfId)))
      .map((p) => {
        const titleTokens = tokens(`${p.title} ${String(p.slug || '').replace(/-/g, ' ')}`, rtl);
        let score = 0;
        titleTokens.forEach((t) => { if (wanted.has(t)) score += t.length >= 4 ? 2 : 1; });
        return { p, score };
      })
      .sort((a, b) => b.score - a.score);
  }

  /** A real "related posts" section; every URL comes from REST, never invented. */
  function relatedPostsHtml(links, rtl) {
    const items = (Array.isArray(links) ? links : [])
      .filter((l) => l && l.url && l.title)
      .map((l) => `<li><a href="${l.url}" data-orbitpress-internal="1"${l.title ? ` title="${escapeAttr(l.title)}"` : ''}>${escapeHtml(l.title)}</a></li>`)
      .join('');
    if (!items) return '';
    const heading = rtl ? 'مقالات ذات صلة' : 'Related articles';
    return `<h2>${heading}</h2><ul>${items}</ul>`;
  }

  function escapeHtml(value) {
    return escapeAttr(value);
  }

  /** Insert internal/external links into text nodes of the body HTML only. */
  function injectLinks(html, links) {
    let body = String(html || '');
    (Array.isArray(links) ? links : []).slice(0, 4).forEach((link) => {
      if (!link || !link.anchor || !link.url || body.includes(`href="${link.url}"`)) return;
      const anchor = link.anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let done = false;
      const externalAttrs = link.external
        ? ` target="_blank" rel="${escapeAttr(link.rel || 'noopener')}"${link.className ? ` class="${escapeAttr(link.className)}"` : ''}`
        : (link.className ? ` class="${escapeAttr(link.className)}"` : '');
      body = body.replace(/(<\/?a\b[^>]*>)|(<[^>]+>)|([^<]+)/g, (whole, anchorTag, otherTag, textNode) => {
        if (done || (anchorTag === undefined && otherTag === undefined && textNode === undefined)) return whole;
        if (anchorTag || otherTag || !textNode) {
          if (anchorTag && /^<a\b/i.test(anchorTag)) done = true; // never nest links
          if (anchorTag && /^<\/a/i.test(anchorTag)) done = false;
          return whole;
        }
        const re = new RegExp(anchor.replace(/\s+/g, '\\s+'), 'i');
        if (re.test(textNode)) {
          done = true;
          return textNode.replace(re, (m) => `<a href="${link.url}"${externalAttrs}>${m}</a>`);
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
    autolinkPosts,
    rankPostsForContext,
    relatedPostsHtml,
    phrasePatternSource,
    injectLinks,
  };
}));

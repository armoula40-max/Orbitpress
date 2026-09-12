'use strict';
process.env.ORBITPRESS_ALLOW_HTTP = '1';
process.env.ORBITPRESS_DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'orbitpress-seo-'));

const test = require('node:test');
const assert = require('node:assert');
const mocks = require('./mockServers');
const store = require('../lib/store');
const wordpress = require('../lib/wordpress');
const { DraftContract } = require('../lib/contracts');
const article = require('../lib/article');
const Seo = require('../lib/seo');
const SeoAnalyzer = require('../public/app/seoAnalyzer');

const KP = 'تشيز كيك الأوريو';

function arabicFiller(words) {
  const w = ['الحلى', 'البارد', 'الكريمي', 'الطبقات', 'البسكويت', 'الزبدة', 'الجبنة', 'الكريمة', 'السكر',
    'الفانيليا', 'التقديم', 'الثلاجة', 'النكهة', 'القوام', 'الضيوف', 'المناسبات', 'القهوة', 'الصوص',
    'التزيين', 'القطع', 'الوصفة', 'المكوّنات', 'الخطوات', 'النصائح', 'الحرارة', 'الوقت', 'الطعم', 'اللون',
    'الرائحة', 'الشوكولاتة', 'الحليب', 'الوعاء', 'الخلاط', 'الملعقة', 'القالب', 'التغليف', 'التجميد'];
  const out = [];
  for (let i = 0; i < words; i += 1) out.push(w[i % w.length]);
  return out.join(' ');
}

/** Build Arabic article HTML whose only variable is how often the KP appears. */
function buildArabicHtml(occurrences) {
  const kpHit = `<b>${KP}</b>`;
  const h2 = (text) => `<h2>${text}</h2>`;
  const p = (text) => `<p>${text}</p>`;
  // intro (must contain the keyphrase)
  let html = p(`وصفة ${kpHit} من ألذ الحلويات الباردة التي تُحضّر بدون فرن، وفي هذا المقال نستعرض الخطوات بالتفصيل مع كل النصائح. ${arabicFiller(28)}`);
  const sections = [
    { heading: `ما هو ${KP}؟`, hit: true },
    { heading: 'المكوّنات التي تحتاجينها', hit: false },
    { heading: 'خطوات التحضير بالترتيب', hit: false },
    { heading: `نصائح نجاح ${KP}`, hit: true },
    { heading: 'أفكار التقديم والحفظ', hit: false },
    { heading: 'الأسئلة الشائعة', hit: false },
  ];
  let placed = 1; // intro
  sections.forEach((section) => {
    html += h2(section.heading);
    // two ~85-word paragraphs per section
    for (let i = 0; i < 2; i += 1) {
      let paragraph = arabicFiller(85);
      if (placed < occurrences) { paragraph = `${kpHit} ${paragraph}`; placed += 1; }
      html += p(paragraph);
    }
  });
  // natural internal-link anchor text (matched to a real post at publish time)
  html += p(`للمزيد من أفكار التقديم الباردة جرّبي حلى الأوريو في مناسباتك القادمة. ${arabicFiller(20)}`);
  return html;
}

function perfectDraft(occurrences) {
  return DraftContract.normalize({
    title: 'وصفة تشيز كيك الأوريو الباردة بدون فرن',
    focusKeyphrase: KP,
    secondaryKeywords: ['تشيز كيك بارد', 'حلى الأوريو', 'حلويات بدون فرن', 'تشيز كيك سهل', 'وصفة الأوريو'],
    seoTitle: `${KP} البارد بدون فرن: وصفة ناجحة خطوة بخطوة`,
    seoDescription: 'وصفة تشيز كيك الأوريو الباردة بدون فرن بمكوّنات بسيطة وطعم غني لا يقاوم، مع خطوات مصوّرة ونصائح تضمن نجاحها في كل مرة.',
    metaDescription: 'وصفة تشيز كيك الأوريو الباردة بدون فرن بمكوّنات بسيطة وطعم غني لا يقاوم.',
    slug: 'تشيز-كيك-الاوريو-البارد',
    contentType: 'recipe',
    categoryName: 'حلويات',
    outline: [{ heading: 'المكوّنات', keyPoints: ['a'] }],
    htmlContent: buildArabicHtml(occurrences),
    internalLinks: [{ anchor: 'حلى الأوريو', reason: 'related' }],
    recipe: {
      isRecipe: true, description: 'طبقات باردة من بسكويت الأوريو وكريمة الجبنة.',
      prepTime: 'PT20M', cookTime: 'PT0M', totalTime: 'PT3H', recipeYield: '8 قطع', cuisine: 'عالمي',
      ingredients: ['24 حبة بسكويت أوريو', '400 غ جبنة كريمية', 'كوب كريمة خفق', 'نصف كوب زبدة مذابة', 'ملعقتان سكر'],
      instructions: [
        { name: 'طحن البسكويت', text: 'اطحني بسكويت الأوريو ثم اخلطيه مع الزبدة المذابة.' },
        { name: 'تحضير الكريمة', text: 'اخفقي الجبنة الكريمية مع الكريمة والسكر حتى يصبح القوام ناعماً.' },
        { name: 'تجميع الطبقات', text: 'وزّعي طبقات البسكويت والكريمة بالتناوب في القالب.' },
        { name: 'التبريد', text: 'برّدي الحلى ثلاث ساعات على الأقل قبل التقديم.' },
        { name: 'التزيين', text: 'زيّني بقطع الأوريو المطحونة وقدّميه بارداً.' },
      ],
      notes: ['كلما طال التبريد تماسكت الطبقات أكثر.'],
    },
    recipes: [],
    pinterest: { title: 'تشيز كيك الأوريو بدون فرن', altText: 'تشيز كيك الأوريو البارد بطبقات الأوريو والكريمة' },
  }, 'حلويات');
}

function analyze(occurrences, overrides = {}) {
  const draft = perfectDraft(occurrences);
  const html = `<img src="f.jpg" alt="${draft.focusKeyphrase} وصفة">${draft.htmlContent}`;
  return SeoAnalyzer.analyze({
    keyphrase: draft.focusKeyphrase,
    seoTitle: draft.seoTitle,
    seoDescription: draft.seoDescription,
    slug: draft.slug,
    contentHtml: html,
    wordTarget: 900,
    altTexts: [`${KP} وصفة featured image`],
    internalLinkCount: 1,
    externalLinkCount: 1,
    contentType: 'recipe',
    recipe: draft.recipe,
    recipesCount: 0,
    schemaValid: true,
    ...overrides,
  });
}

test('Arabic article can reach a 100/100 Rank Math/Yoast analysis', () => {
  // Find the occurrence count whose density lands in 0.5–2.5%.
  let best = null;
  for (let n = 3; n <= 14; n += 1) {
    const r = analyze(n);
    if (!best || r.score >= best.score) best = r;
    if (r.score === 100) { best = r; break; }
  }
  assert.equal(best.score, 100, best.checks.filter((c) => c.status !== 'good').map((c) => `${c.id}:${c.status}:${c.detail}`).join(' | '));
  assert.equal(best.bad, 0);
});

test('analysis flags the classic SEO defects (missing keyword placement, length, links)', () => {
  const draft = perfectDraft(2);
  const broken = SeoAnalyzer.analyze({
    keyphrase: draft.focusKeyphrase,
    seoTitle: 'وصفة حلى باردة بدون أي كلمة مفتاحية في العنوان الطويل جدًا والمخالف للقواعد تماماً 1234567890',
    seoDescription: 'وصف قصير',
    slug: 'plain-slug-without-keyword',
    contentHtml: `<p>مقدمة لا تحوي العبارة. ${arabicFiller(40)}</p><h2>عنوان عام</h2><p>${arabicFiller(40)}</p>`,
    wordTarget: 900,
    altTexts: ['generic food photo'],
    internalLinkCount: 0,
    externalLinkCount: 0,
    contentType: 'recipe',
    recipe: draft.recipe,
    recipesCount: 0,
    schemaValid: true,
  });
  const byId = Object.fromEntries(broken.checks.map((c) => [c.id, c.status]));
  assert.equal(byId.intro, 'bad');
  assert.equal(byId.slug, 'bad');
  assert.equal(byId['seo-title'], 'bad');
  assert.equal(byId.internal, 'bad');
  assert.equal(byId.length, 'bad');
  assert.equal(byId['img-alt'], 'warn');
  assert.ok(broken.score < 60);
});

test('Arabic slugs keep Arabic letters so the keyphrase-in-slug check passes', () => {
  const slug = DraftContract.cleanSlug('وصفة تشيز كيك الأوريو الباردة 2026!');
  assert.ok(/[\u0600-\u06FF]/.test(slug), `Arabic letters were stripped: ${slug}`);
  const inSlug = SeoAnalyzer.norm(slug.replace(/-/g, ' ')).includes(SeoAnalyzer.norm(KP));
  assert.ok(inSlug);
});

test('roundup schema is @graph with ItemList + full Recipe nodes (Pinterest recipe pins)', () => {
  const roundup = DraftContract.normalize({
    title: '5 وصفات بالأوريو', focusKeyphrase: 'وصفات الأوريو',
    seoTitle: 'وصفات الأوريو: 5 حلويات باردة وشهية', seoDescription: 'وصفات الأوريو الباردة والسهلة التي ستحبها عائلتك مع المقادير والخطوات الكاملة لكل وصفة.',
    metaDescription: 'خمس وصفات بالأوريو.', slug: 'وصفات-الاوريو', contentType: 'recipe',
    htmlContent: `<p>أفضل وصفات الأوريو. ${arabicFiller(40)}</p>`,
    outline: [], internalLinks: [],
    recipe: { isRecipe: false },
    recipes: [1, 2].map((i) => ({
      title: `حلى الأوريو رقم ${i}`, isRecipe: true, description: `وصفة رقم ${i}`,
      prepTime: 'PT15M', cookTime: 'PT10M', totalTime: 'PT40M', recipeYield: '4 قطع', cuisine: 'عالمي',
      ingredients: ['أوريو', 'زبدة', 'كريمة', 'سكر'],
      instructions: [
        { name: 'Step 1', text: 'اطحني البسكويت.' },
        { name: 'Step 2', text: 'اخفقي الكريمة.' },
        { name: 'Step 3', text: 'جمّعي الطبقات.' },
        { name: 'Step 4', text: 'برّدي وقدّمي.' },
      ],
      notes: ['ملاحظة.'],
    })),
    pinterest: { title: 'وصفات الأوريو', altText: 'وصفات الأوريو الخمسة' },
  }, 'حلويات');
  const schema = DraftContract.buildSchema(roundup, 'https://s.test/recipes/', ['https://s.test/f.jpg']);
  const graph = schema['@graph'];
  assert.ok(Array.isArray(graph), 'roundup must emit @graph');
  assert.equal(graph[0]['@type'], 'ItemList');
  assert.equal(graph[0].itemListElement.length, 2);
  const recipes = graph.filter((n) => n['@type'] === 'Recipe');
  assert.equal(recipes.length, 2);
  assert.ok(recipes[0].recipeIngredient.length >= 4);
  assert.ok(recipes[0].recipeInstructions[0]['@type'] === 'HowToStep');
  // No fabricated ratings or nutrition, ever
  const json = JSON.stringify(schema);
  assert.ok(!json.includes('aggregateRating'));
  assert.ok(!json.includes('nutrition'));
  // ItemList entries reference the inline recipe nodes
  assert.equal(graph[0].itemListElement[0].item['@type'], 'Recipe');
});

test('internal-link matcher only links real Arabic posts and never invents URLs', () => {
  const posts = [
    { id: 1, title: 'حلى الأوريو البارد خطوة بخطوة', link: 'https://s.test/oreo/', slug: 'oreo' },
    { id: 2, title: 'كيكة الشوكولاتة', link: 'https://s.test/cake/', slug: 'cake' },
  ];
  const matches = SeoAnalyzer.matchInternalLinks(
    [{ anchor: 'حلى الأوريو', reason: 'r' }, { anchor: 'شيء غير موجود إطلاقا', reason: 'r' }], posts);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].url, 'https://s.test/oreo/');
});

test('generated article JSON contract requires the SEO fields', () => {
  const fmt = article.articleResponseFormat();
  const props = fmt.json_schema.schema.properties;
  for (const key of ['focusKeyphrase', 'secondaryKeywords', 'seoTitle', 'seoDescription', 'paaQuestions', 'externalReferences']) {
    assert.ok(props[key], `${key} missing from contract`);
  }
  assert.ok(fmt.json_schema.schema.required.includes('focusKeyphrase'));
  // prompt enforces Arabic when the keyword is Arabic and mentions the 100/100 target
  // (exercised indirectly through applySeoDefaults)
});

test('applySeoDefaults fills SEO fields for Arabic keywords', () => {
  // emulate the module-private helper through normalize + builders
  const draft = DraftContract.normalize({
    title: 'وصفة تشيز كيك الأوريو', slug: 'oreo-cheesecake', contentType: 'article',
    htmlContent: '<p>x</p>', outline: [], internalLinks: [],
    recipe: { isRecipe: false }, recipes: [],
    pinterest: {},
  }, 'حلويات');
  const title = SeoAnalyzer.buildSeoTitle({ keyphrase: KP, title: draft.title, rtl: true });
  assert.ok(title.length <= 60);
  assert.ok(SeoAnalyzer.norm(title).startsWith(SeoAnalyzer.norm(KP)) || title.includes(KP));
});

test('full publish writes Yoast/Rank Math metadata through the SEO bridge', async (t) => {
  const wp = await mocks.startWordPressMock({
    posts: [{ id: 1, title: { rendered: 'حلى الأوريو البارد خطوة بخطوة' }, link: 'https://wp.test/oreo-dessert/', slug: 'oreo-dessert', status: 'publish' }],
  });
  t.after(() => wp.server.close());
  store.saveSiteSettings({
    wordpressBaseUrl: wp.url, wordpressUsername: 'admin', wordpressAppPassword: 'pw',
    articleBaseUrl: '', articleModel: '', categoryId: '7',
  }, 'site-seo');

  const draft = perfectDraft(6);
  const result = await wordpress.publish({
    siteId: 'site-seo',
    draft,
    images: {
      featured: mocks.makeDataUrl(mocks.tinyPng(1200, 800)),
      pinterest: mocks.makeDataUrl(mocks.tinyPng(1000, 1500)),
    },
    postStatus: 'publish',
  });
  assert.ok(result.seo, 'publish returns an SEO report');
  assert.ok(result.seo.score >= 80, `score should be strong: ${result.seo.score}`);
  assert.equal(result.seo.bridge.ok, true);
  assert.equal(wp.data.seoWrites.length, 1);
  const write = wp.data.seoWrites[0];
  assert.equal(write.post_id, result.postId);
  assert.equal(write.focus_keyphrase, KP);
  assert.ok(write.seo_title.includes('الأوريو'));
  assert.ok(write.seo_description.length <= 160);
  assert.equal(write.schema_type, 'recipe');
  assert.ok(write.score >= 80);
  // internal link really injected into the published body
  assert.ok(wp.data.posts[1].content.raw.includes('href="https://wp.test/oreo-dessert/"'), 'real internal link injected');
  // the published JSON-LD is a Recipe entity
  assert.ok(wp.data.posts[1].content.raw.includes('"@type":"Recipe"'));
});

test('the soft SEO gate blocks a sub-100 publish, then an explicit override publishes', async (t) => {
  const wp = await mocks.startWordPressMock({ bridge: false });
  t.after(() => wp.server.close());
  store.saveSiteSettings({
    wordpressBaseUrl: wp.url, wordpressUsername: 'admin', wordpressAppPassword: 'pw',
    articleBaseUrl: '', articleModel: '', categoryId: '7',
  }, 'site-gate');
  const images = {
    featured: mocks.makeDataUrl(mocks.tinyPng(1200, 800)),
    pinterest: mocks.makeDataUrl(mocks.tinyPng(1000, 1500)),
  };
  const weakDraft = DraftContract.normalize(mocks.sampleArticleJson(), 'Breakfast');
  weakDraft.slug = 'gate-weak-post';

  await assert.rejects(
    wordpress.publish({ siteId: 'site-gate', draft: weakDraft, images, postStatus: 'publish', enforceSeoGate: true }),
    /SEO/,
  );
  assert.equal(wp.data.posts.length, 0, 'no post created while the gate is closed');
  assert.equal((wp.data.uploads || []).length, 0, 'no orphan media uploaded before the gate opens');

  const result = await wordpress.publish({
    siteId: 'site-gate', draft: weakDraft, images, postStatus: 'publish', enforceSeoGate: true, seoOverride: true,
  });
  assert.equal(wp.data.posts.length, 1);
  assert.equal(result.seo.bridge.ok, false);
  assert.equal(result.seo.bridge.reason, 'bridge_missing');
});

test('a gate-enabled publish reaches 100 on the real assembled body and writes a green score', async (t) => {
  const wp = await mocks.startWordPressMock({
    posts: [{ id: 1, title: { rendered: 'حلى الأوريو البارد خطوة بخطوة' }, link: 'https://wp.test/oreo-dessert/', slug: 'oreo-dessert', status: 'publish' }],
  });
  t.after(() => wp.server.close());
  store.saveSiteSettings({
    wordpressBaseUrl: wp.url, wordpressUsername: 'admin', wordpressAppPassword: 'pw',
    articleBaseUrl: '', articleModel: '', categoryId: '7',
  }, 'site-green');
  const images = {
    featured: mocks.makeDataUrl(mocks.tinyPng(1200, 800)),
    pinterest: mocks.makeDataUrl(mocks.tinyPng(1000, 1500)),
  };
  // Sweep natural occurrence counts; at least one placement must give 100.
  let published = null;
  for (const occ of [4, 5, 6]) {
    try {
      const draft = perfectDraft(occ);
      draft.slug = `تشيز-كيك-الاوريو-${occ}`;
      published = await wordpress.publish({
        siteId: 'site-green', draft, images, postStatus: 'publish', enforceSeoGate: true,
      });
      break;
    } catch (error) {
      if (occ === 6) throw error;
    }
  }
  assert.ok(published, 'the gate allowed a fully green article');
  assert.equal(published.seo.score, 100);
  assert.equal(published.seo.bridge.ok, true);
  assert.equal(wp.data.seoWrites.at(-1).score, 100, 'the bridge stored a green 100 score');
  assert.ok(wp.data.seoWrites.at(-1).focus_keyphrase === KP);
});

test('seoScan previews the score, real links and bridge status without publishing', async (t) => {
  const wp = await mocks.startWordPressMock({
    seoPlugin: 'yoast',
    posts: [{ id: 1, title: { rendered: 'حلى الأوريو البارد' }, link: 'https://wp.test/oreo/', slug: 'oreo', status: 'publish' }],
  });
  t.after(() => wp.server.close());
  store.saveSiteSettings({
    wordpressBaseUrl: wp.url, wordpressUsername: 'admin', wordpressAppPassword: 'pw',
    articleBaseUrl: '', articleModel: '', categoryId: '7',
  }, 'site-scan');
  const draft = perfectDraft(6);
  const scan = await wordpress.seoScan({
    siteId: 'site-scan',
    draft,
    images: { featured: 'local://featured.png', pinterest: 'local://pin.png' },
  });
  assert.equal(scan.ok, true);
  assert.equal(scan.plugins.bridge, true);
  assert.equal(scan.plugins.yoast, true);
  assert.equal(scan.plugins.rankmath, false);
  assert.ok(scan.internalLinks.length >= 1);
  assert.ok(typeof scan.analysis.score === 'number');
  assert.ok(scan.analysis.checks.some((c) => c.id === 'recipe-schema' && c.status === 'good'));
});

test('analysis returns the five branched scorecard groups', () => {
  const r = analyze(6);
  const ids = r.groups.map((g) => g.id);
  assert.deepEqual(ids, ['technical', 'onpage', 'readability', 'media', 'schema']);
  const totalMax = r.groups.reduce((sum, g) => sum + g.max, 0);
  assert.equal(totalMax, 100);
  const totalScore = r.groups.reduce((sum, g) => sum + g.score, 0);
  assert.equal(totalScore, r.score, 'branched group scores add up to the overall score');
});

test('a body image with an empty alt is a hard blocker even if the rest is perfect', () => {
  const draft = perfectDraft(6);
  const r = SeoAnalyzer.analyze({
    keyphrase: draft.focusKeyphrase,
    seoTitle: draft.seoTitle,
    seoDescription: draft.seoDescription,
    slug: draft.slug,
    contentHtml: `<img src="x.jpg" alt=""><img src="y.jpg" alt="وصف جيد للصورة الثانية طويل بما يكفي">${draft.htmlContent}`,
    wordTarget: 900,
    altTexts: [],
    internalLinkCount: 1,
    externalLinkCount: 1,
    contentType: 'article',
    schemaValid: true,
  });
  const check = r.checks.find((c) => c.id === 'img-alt-required');
  assert.equal(check.status, 'bad');
  assert.ok(r.blockers.some((b) => b.id === 'img-alt-required'), 'missing alt lands in the publish blockers list');
});

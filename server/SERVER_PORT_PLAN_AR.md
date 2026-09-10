# خطة منفذ السيرفر — OrbitPress Web (نسخة السيرفر)

## الهدف

تحويل OrbitPress من تطبيق Android محلي إلى **تطبيق ويب يعمل على سيرفر** مع:

1. واجهة ويب هي نفس واجهة التطبيق الحالية (بدون إعادة بناء من الصفر).
2. **سكرابر مدمج داخل السيرفر** (هجين: HTTP سريع أولاً ثم Playwright عند الحاجة).
   لا حاجة لأي API خارجي ولا رفع كوكيز. تسجيل الدخول إلى Facebook/Pinterest يتم
   عبر متصفح خادم مخفي يحفظ الجلسة تلقائياً.
3. محلل **Facebook + Pinterest بأسلوب FeedSpy**: فلترة بفترة زمنية، ترتيب حسب
   التفاعل/الوقت، بحث بالكلمات، كشف المنشورات الفيروسية، إخفاء المشاهَد، تصدير
   CSV، رسم أفضل أوقات النشاط، وتقرير ذكاء اصطناعي عربي.

## البنية

```
server/
  index.js              — خادم Express: يقدّم الواجهة + REST API
  lib/
    contracts.js        — ترحيل كل عقود Kotlin (Draft/Publishing/SEO/LongForm/…)
    store.js            — تخزين JSON مع تشفير AES-256-GCM للأسرار لكل موقع
    http.js             — طبقة HTTPS صارمة (سياسة إعادة التوجيه كما في Android)
    wordpress.js        — الفئات، اختبار الاتصال، النشر، الإصلاح، المزامنة
    images.js           — تخزين/قراءة الصور + التحقق من الأبعاد بنسبة Pinterest 2:3
    article.js          — توليد المقال (json_schema مع fallback) + تحليلات AI
    scheduler.js        — جدولة خادمية دائمة (إعداد المسودات تلقائياً)
    scraper/
      index.js          — واجهة موحدة scanFacebook/scanPinterest/scanReddit
      sessions.js       — جلسات تسجيل دخول دائمة (Playwright persistent context)
      pinterest.js      — HTTP: __PWS_DATA__ + resource API → سقوط إلى Playwright
      facebook.js       — mbasic/m.facebook parsing → سقوط إلى Playwright بجلسة
      reddit.js         — Reddit العام عبر JSON endpoints
      analyzer.js       — منطق FeedSpy: viral score، فلاتر، أفضل الأوقات، CSV
  public/
    index.html          — واجهة OrbitPress (نفس ملف Android مع تعديلات طفيفة)
    app/bridge.js       — بديل window.Native فوق HTTP
    app/feedspy.js      — أدوات FeedSpy تُحقن في شاشتي Facebook وPinterest
    app/feedspy.css
  data/                 — workspace + settings مشفرة + جلسات (gitignored)
  test/                 — اختبارات node:test بخوادم وهمية (mocks)
  Dockerfile
```

## قرارات

- **Node.js 20+ (CommonJS)** — يعيد استخدام واجهة index.html الحالية كما هي.
- الجلسات: مجلد profile دائم لكل منصة تحت `server/data/sessions/`.
- الماسحات لا تتجاوز CAPTCHA أو 2FA؛ عند حاجز تحقق يُبلَّغ المستخدم برسالة واضحة.
- `ORBITPRESS_TOKEN`: رمز اختياري لحماية الواجهة على السيرفرات العامة.

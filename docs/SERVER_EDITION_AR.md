# OrbitPress Server Edition — دليل سريع

> التفاصيل الكاملة في [`server/README_AR.md`](../server/README_AR.md).

نسخة السيرفر تحوّل تطبيق Android المحلي إلى تطبيق ويب يعمل على VPS مع:

- **نفس الواجهة** (`server/public/index.html` منسوقة عن `app/src/main/assets/index.html`) — الجسر `window.Native` يُحاكَى عبر `server/public/app/bridge.js` فوق HTTP.
- **سكرابر مدمج** (`server/lib/scraper/`) بوضع هجين: HTTP مع استخراج JSON المدمج أولاً ثم متصفح Playwright دائم عند الحاجة — بدون API خارجي وبدون رفع كوكيز، وتسجيل دخول Facebook/Pinterest من صفحة الإعدادات (`server/lib/scraper/sessions.js`).
- **محلل FeedSpy** (`server/public/app/feedspy.js` + `server/lib/scraper/analyzer.js`): فلترة فترة، ترتيب، بحث، حد أدنى/أقصى، إخفاء المشاهَد، أفضل توقيت، CSV، تقرير AI عربي.
- **ترحيل كامل للعقود**: كل قواعد Kotlin (Draft, Publishing, LongForm, Provider, Lock…) منقولة بحذافيرها إلى `server/lib/contracts.js`.

## تشغيل محلي

```bash
cd server
npm install
npm run install-browser   # Chromium للماسح (مرة واحدة)
npm start                 # http://localhost:8080
```

## اختبارات

```bash
cd server && npm test     # 77 اختباراً: عقود + WordPress + تحويل صور + Pinterest (جلسة وظيفية + رفع S3 + استيراد كوكيز) + توليد + ماسح + FeedSpy + جسر + إقلاع الواجهة
```

# فحص تطبيق OrbitPress — تقرير

- تاريخ الفحص: 2026-09-06
- الفرع المحلي: `arena/01a077f6-orbitpress`
- آخر commit في الريبو: `173e8b1` — `fix: reject Facebook comments from VPS scan`
- المستودع: `https://github.com/armoula40-max/Orbitpress` (public)

## 1. الخلاصة

التطبيق هو **مشروع Android (Kotlin + WebView)** يهدف إلى توليد مقالات ووصفات، إدارة صور Featured و Pinterest، إدارة مواقع WordPress متعددة، وفهرسة محتوى من Facebook / Reddit / Pinterest.

النتيجة العامة:

- ✅ **البنية صحيحة في GitHub Actions**: آخر تشغيل على `main` هو **نجاح** (`Build OrbitPress APK`, run `34000612992`, job `101398685054`, المدة ~58 ثانية، أنتج artifact باسم `OrbitPress-debug-apk`).
- ✅ **لا توجد مفاتيح أو أسرار مدمجة في الكود** (تم البحث عن أنماط `sk-`, `ghp_`, `AKIA`, مفاتيح خاصة، Tokens طويلة، إلخ).
- ❗ **ثغرات/نقاط ضعف أمنية** رئيسية: تعريض `JavascriptInterface` داخل صفحات ويب خارجية، السماح بـ `http://` لخادم VPS scraper، وتفعيل `usesCleartextTraffic` بشكل عام.
- ❗ **اختبارات الوحدات لا تعمل داخل CI**: الـ workflow الحالي يبني APK فقط ولا يشغّل `:app:testDebugUnitTest`.
- ⚠️ **خلل منطقي** محتمل في خيار Pinterest API scan عند عدم وجود Board ID.

---

## 2. ما تم فحصه

- ملفات Kotlin الرئيسية:
  - `app/src/main/java/com/askinz/publisher/MainActivity.kt` — الجسر، التخزين المشفر، Network، النشر.
  - `PinterestScanActivity.kt`, `SocialScanActivity.kt` — ماسحات WebView للمنصات الخارجية.
  - العقود/التحقق: `DraftContract`, `PublishingContracts`, `ProviderCompatibilityContract`, `SettingsPersistenceContract`, `SettingsLockContract`, `SocialApiContracts`, `MediaPublishingContract`, `FeatureContracts`, `NotificationContracts`, `RecipeRequestContract`, `LongFormCompletenessContract`, `CategorySyncContracts`.
- `app/src/main/AndroidManifest.xml`
- `app/src/main/assets/index.html` (حوالي 130KB، 76KB JavaScript inline)
- الاختبارات: 6 ملفات تحت `app/src/test/...`
- `gradle` files و `.github/workflows/build-apk.yml`
- GitHub Actions: `gh run list`, `gh run view`, `gh api` على `check-runs`

---

## 3. نتائج GitHub / CI

| العنصر | الحالة |
|---|---|
| آخر run على `main` | ✅ success |
| run ID | `34000612992` |
| commit | `173e8b1` |
| job | `101398685054` |
| المدة | ~58s |
| Artifact | `OrbitPress-debug-apk` |
| خطوات البناء | `assembleDebug` فقط |
| الاختبارات | ❌ غير مشغّلة |

ملاحظات GitHub Actions ظهرت في الـ run:

1. `actions/checkout@v4`, `actions/setup-java@v4`, `actions/upload-artifact@v4`, `android-actions/setup-android@v3` ما زالت تستهدف Node.js 20، والمنصة تحوّلها الآن إلى Node.js 24.
2. `actions/setup-java@v4` deprecated — يُنصح بالانتقال إلى `actions/setup-java@v5`.

---

## 4. نقاط قوة موجودة

- **تخزين أسرار** في `EncryptedSharedPreferences` مع `MasterKey` (AES256-GCM) لكل الموقع. جيد.
- **الأسرار لا تُعاد للواجهة**: `loadSettings()` تُرجع فقط `configured` flags وليس القيم السرية.
- **لا يوجد نسخ احتياطي يضم الأسرار**: `android:allowBackup="false"` وزر Export local backup مستثنى منه الأسرار.
- **HTTPS مُفروض** في معظم المسارات: Article API، WordPress، صور Cloudflare/OpenAI-compatible، Pinterest API، وروابط social.
- **فحص نوع الصور الحقيقي** قبل الرفع (PNG/JPEG/WebP) وفحص نسبة Pinterest 2:3 تمامًا.
- **إزالة HTML خطر من محتوى الذكاء الاصطناعي** عبر `DraftContract.sanitizeHtml` (script/style/iframe/object/embed + `on*` + `javascript:`).
- **رفض redirect إلى HTTP** داخل `http()` ورفض POST/غير GET redirects في WordPress (يمنع تسريب Basic Auth).
- **الإشعارات** تكون بعد نتيجة النشر، ولا تُرسل إلا بإذن المستخدم.
- **فحص تكرار slug قبل النشر**، وبناء JSON-LD بدون rating/review مفبركة.
- **حماية Settings بـ PIN** اختيارية وليس منفذًا لبناء المقال.

---

## 5. المخاطر / توصيات

### 5.1 عالية — `addJavascriptInterface` على صفحات خارجية

- الملفات:
  - `MainActivity.kt:77` → `webView.addJavascriptInterface(NativeBridge(...), "Native")`
  - `PinterestScanActivity.kt:45` → `addJavascriptInterface(ResultBridge(), "OrbitPressScan")`
  - `SocialScanActivity.kt:103` → `addJavascriptInterface(ResultBridge(), "OrbitPressSocial")`

السبب:
- `MainActivity` يحمّل `file:///android_asset/index.html` فقط، فالخطر محدود إذا لم يوجد XSS.
- لكن `PinterestScanActivity` و `SocialScanActivity` يحمّلان **صفحات إنترنت خارجية** (Facebook/Pinterest/Reddit) وتوجد فيهما واجهة JavaScript كاملة. أي صفحة خارجية (أو صفحة يتم حقنها بـ XSS/اعتراضها) يمكنها استدعاء `OrbitPressScan.done(...)` / `OrbitPressSocial.done(...)` وتزوير نتيجة الفحص أو إنهاء الـ activity ببيانات غير موثوقة.

**التوصية:**
- لا تستخدم `addJavascriptInterface` على صفحات بعيدة. اجعل النظام الأصلي هو من يحقن JavaScript ويقرأ النتيجة عبر `evaluateJavascript` فقط.
- أو قيّد الواجهة: لا تعرّضها قبل التحقق من أن `loadedUrl` هو بالضبط `https://www.pinterest.com/...`/`facebook.com/...`، ثم `removeJavascriptInterface` عند مغادرة النطاق.
- أضف `setAllowFileAccess(false)`, `setJavaScriptCanOpenWindowsAutomatically(false)` (موجود بالفعل).

### 5.2 عالية — Cookies مفعّلة في وسيط لمصادر خارجية وتُرسل إلى `VPS Scraper`

- `SocialScanActivity.kt:106`: `CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)`
- `MainActivity.kt:276`: `scraperScan(...)` يقرأ cookies من `CookieManager` للفيس بوك/بينترست ويرسلها إلى `scraperApiBaseUrl` مع `x-orbitpress-key`.

السبب:
- إذا كان الخادم الخارجي (VPS) غير موثوق أو مصاب، يمكن أن يستلم cookies قد تحتوي جلسات/توكنز تسجيل دخول داخل WebView.
- الواجهة نفسها تقترح في placeholder داخل `index.html`: `http://23.95.186.208:8080`.

**التوصية:**
- اجعل `scraperApiBaseUrl` **HTTPS فقط** مثل بقية المسارات.
- لا ترسل cookies كاملة دخيلة؛ أرسل فقط الـ cookies الضرورية ومرّره عبر HTTPS.
- انقل الـ cookies collection إلى طبقة تُبقيها في الذاكرة ولا تعرضها للـ UI.
- أوقف `setAcceptThirdPartyCookies` ما لم تكن بحاجة فعلية له.

### 5.3 متوسطة — `usesCleartextTraffic="true"` على مستوى التطبيق

- `AndroidManifest.xml:12`

**التوصية:**
- أزل `usesCleartextTraffic="true"` واستخدم `network_security_config.xml` يسمح فقط بالخوادم التي تحتاج فعلاً HTTP، أو افرض HTTPS على كل شيء.
- إذا بقي دعم أدوات قديمة، ضع قائمة واضحة ومقيدة.

### 5.4 متوسطة — Hash PIN بلغة SHA-256 مباشرة

- `SettingsLockContract.hashPin` يستخدم SHA-256 فقط.
- PIN رقمي من 4–12 خانة له entropy قليل جدًا؛ SHA-256 غير مخصص لهذا الغرض ويمكن فحصه بسرعة إذا تم الوصول للتخزين المشفر.

**التوصية:**
- استخدم PBKDF2 / bcrypt / Argon2 مع Salt عشوائي.
- لا تُعدّ الـ PIN حماية حقيقية للأسرار؛ فهي طبقة UX فقط حسب التوثيق.

### 5.5 متوسطة — مكتبة `androidx.security:security-crypto:1.1.0-alpha06`

- `app/build.gradle.kts` يعتمد على version **alpha** ومن المنتظر أن تنتقل Google إلى بديل.

**التوصية:**
- اعتمد على Android Keystore مباشرة (AES-GCM) أو `androidx.security:security-crypto` النسخة stable إن وُجدت، مع خطة ترحيل.
- على الأقل لا تستخدم alpha في إنتاج رسمي.

### 5.6 متوسطة — خيار Pinterest API بدون Board ID

- `MainActivity.kt:318` `pinterestApiScan(...)`
- عند `boardId` فارغ: يستدعي `pinterestBoards()` ثم يعالج `items` كأنها Pins عبر `normalizePinterestPin(...)`.
- النتيجة: سيعرض كائنات **Boards** (اسم، وصف، id) في واجهة "Pins" وكأنها Pins، وهو غير صحيح وظيفيًا.

**التوصية:**
- إما طلب Board ID إلزامي لدخول الـ scan.
- أو فصل المسار: عند عدم وجود Board ID، عرض Boards منفصلة ثم اختيار Board قبل جلب Pins.

### 5.7 منخفضة — جدولة `WorkManager` ليست إنتاجية

- `OrbitPressScheduleWorker` يخزّن فقط `last_ready_operation` ولا ينفّذ عملية شبكة حقيقية.
- هذا متوافق مع التوثيق، لكن أي مستخدم يتوقع "جدولة نشر فعلي" سيجد أن الوظيفة غير مفعّلة.

**التوصية:**
- أظهر بوضوح في الواجهة أن الجدولة "جاهزة تقنيًا" لكنها لا تنفّذ حتى يتم ربط Task/queue و OAuth refresh.
- أو أتمم التنفيذ قبل عرض الخيار للمستخدم.

### 5.8 منخفضة — CI لا يشغّل اختبارات الوحدات

- `.github/workflows/build-apk.yml` يشغّل `assembleDebug` فقط.
- الاختبارات موجودة: `DraftContractTest`, `ProviderCompatibilityContractTest`, `SettingsLockContractsTest`, `SettingsPersistenceContractTest`, `LongFormCompletenessContractTest`, `RecipeRequestContractTest`.

**التوصية:**
- أضف `./gradlew :app:testDebugUnitTest` قبل `assembleDebug`.
- أضف أيضاً `warning` أو `continue-on-error` لاختبارات تتعلق بمنصات خارجية ليس فيها أذونات.

### 5.9 منخفضة — اختلاف توثيق/أدوات

- `SOURCE_README_AR.md` يقول AGP `8.10.2`، بينما `build.gradle.kts` يستخدم `8.7.3`.
- `gradle/wrapper/gradle-wrapper.properties` يستخدم `9.6.1`، وAGP 8.7 يتطلب كحد أدنى Gradle 8.9.

**ملاحظة:** CI نجح رغم ذلك، لذا لا أقول أن البناء مكسور، لكن التوثيق والأدوات غير متطابقة وقد يسبب مشاكل في Android Studio المحلي.

**التوصية:**
- وحّد التوثيق مع `build.gradle.kts` أو حدّث AGP، وثبّت أن `gradle-wrapper.properties` متوافق مع AGP المختار.

### 5.10 منخفضة — تحسين repo عام

- لا يوجد `README.md` على مستوى الجذر (يوجد فقط `SOURCE_README_AR.md`).
- لا يوجد `LICENSE` (`licenseInfo: null` في GitHub).
- الـ workflow يستخدم Actions قديمة (`checkout@v4`, `setup-java@v4`, `upload-artifact@v4`).
- `gradle.properties` ما زال يحمل `android.enableJetifier=true` — إذا لم تكن هناك مكتبات دعم قديمة، يمكن إزالته.

---

## 6. تغطية الاختبارات الحالية

| الملف | يغطي |
|---|---|
| `DraftContractTest.kt` | تطبيع الوصفة، slug، Sanitize HTML، JSON-LD، roundup |
| `LongFormCompletenessContractTest.kt` | اكتمال المقالات متعددة الوصفات |
| `ProviderCompatibilityContractTest.kt` | HTTPS، Structured output fallback |
| `RecipeRequestContractTest.kt` | عدد الوصفات المطلوب |
| `SettingsLockContractsTest.kt` | PIN rules + hash + access policy |
| `SettingsPersistenceContractTest.kt` | merge بدون مسح الأسرار، canonical siteId |

**لا تغطي**:
- `PublishingContracts` (HTTPS/MIME/tags/status/alt text)
- `SocialApiContracts` (بناء URLs، normalizers)
- `CategorySyncContracts`
- `MediaPublishingContract`, `FeatureContracts`, `NotificationContracts`, `ScheduleContract`
- `MainActivity`, `ScraperScan`, `WordPressMarkup`, `OrbitPressScheduleWorker`
- أي سلوك WebView / JavaScript

---

## 7. حدود هذا الفحص

- لا يوجد في بيئة العمل الحالية JDK 17 ولا Android SDK، ولا يمكن الوصول إلى Google Maven / Debian repos (الوصول الفعلي من sandbox إلى internet كان محدودًا).
- لذلك **لم أتمكن من تشغيل `gradlew :app:testDebugUnitTest` أو `assembleDebug` محليًا**.
- `gh workflow run ...` لفرعنا رُفض بـ HTTP 403 (`Resource not accessible by integration`)، لأن التوكن الذي نعمل به لا يملك إذن إطلاق Actions workflows.
- تم الاعتماد على:
  - قراءة المصدر كاملاً.
  - `node --check` لفحص JavaScript inline في `index.html` → **نجح**.
  - فحص أنماط الأسرار → **لم توجد أسرار مدمجة**.
  - نتائج GitHub Actions على `main` → **نجاح البناء**.

---

## 8. خطوات مقترحة فورية

1. إزالة/تقييد `addJavascriptInterface` في `SocialScanActivity` و `PinterestScanActivity`.
2. إضافة `usesCleartextTraffic` Network Security Config أو إزالته.
3. فرض HTTPS على `scraperApiBaseUrl`.
4. تشغيل `testDebugUnitTest` في GitHub Actions.
5. ترقية `actions/setup-java@v4` → `v5`، ومواءمة توثيق AGP/Gradle.
6. إضافة اختبارات `PublishingContracts`, `SocialApiContracts`, `NotificationContracts` على الأقل.

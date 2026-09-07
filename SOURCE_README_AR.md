# مصدر OrbitPress 4.0.0

هذه الحزمة هي **مصدر تطبيق Android** وليست APK فقط. يمكنك فتحها وتعديل Kotlin وHTML/CSS/JavaScript ثم تشغيلها خارج Manus باستخدام Android Studio.

## المتطلبات

استخدم Android Studio حديثًا مع Android SDK Platform 35 وBuild Tools مناسبة، وJDK 17. المشروع يستخدم Android Gradle Plugin 8.7.3 مع Gradle Wrapper 9.6.1. لا تحتاج إلى Manus أو إلى الموقع التجريبي لتشغيل التطبيق محليًا.

## فتح المشروع

افتح Android Studio، اختر **Open**، ثم اختر المجلد الذي يحتوي على `settings.gradle.kts`. انتظر انتهاء Gradle Sync. إذا طلب Android Studio تحديد JDK، اختر JDK 17. لا تنسخ ملف `local.properties` من جهاز آخر؛ Android Studio ينشئه تلقائيًا ويضع فيه مسار SDK المحلي.

## أهم أماكن التعديل

| المسار | الوظيفة |
|---|---|
| `app/src/main/java/com/askinz/publisher/MainActivity.kt` | جسر Android، التخزين المشفر، طلبات Article API وWordPress، والتنسيق العام |
| `app/src/main/assets/index.html` | واجهة WebView، Content Studio، Review، Settings، CSS وJavaScript |
| `app/src/main/java/com/askinz/publisher/DraftContract.kt` | تطبيع المسودات وHTML وبيانات الوصفات وJSON-LD |
| `app/src/main/java/com/askinz/publisher/LongFormCompletenessContract.kt` | فحص اكتمال المقالات الطويلة متعددة الوصفات |
| `app/src/main/java/com/askinz/publisher/ProviderCompatibilityContract.kt` | توافق Article API وJSON Schema وحدود الإخراج وfallback |
| `app/src/test/` | اختبارات Kotlin المحلية للعقود وسلوك النشر والحماية |

## التشغيل والبناء

من Android Studio شغّل التطبيق على Emulator أو هاتف Android مفعّل عليه USB debugging. أو من الطرفية داخل المشروع نفّذ:

```bash
gradle :app:testDebugUnitTest
gradle :app:assembleRelease
```

قد تحتاج إلى استخدام مسار Gradle المثبت على جهازك بدل الأمر `gradle`. سيظهر APK الناتج داخل `app/build/outputs/apk/release/`.

## الإعداد داخل التطبيق

أدخل عنوان Article API المتوافق مع OpenAI، اسم النموذج، مفتاح API، ثم عنوان WordPress واسم المستخدم وApplication Password. ويمكن إعداد مزود توليد الصور (Cloudflare Workers AI أو واجهة OpenAI Images متوافقة) وإعدادات Pinterest اختيارياً. يدعم محرر المراجعة الوسوم وحالة WordPress (`draft` أو `pending` أو `publish`) وCanonical وحقول Open Graph. تُحفظ الأسرار في تخزين Android مشفر لكل موقع، ولا توجد مفاتيح حقيقية داخل هذه الحزمة.

يستطيع التطبيق توليد صور Featured وPinterest عبر مزود الصور المحدد، وحفظها محلياً وإضافتها إلى المقال، كما يدعم إنشاء Pin عبر Pinterest API بعد إعداد OAuth وBoard ID. أضيف حد WorkManager وجدولة محلية مقاومة لإعادة تشغيل التطبيق؛ أما تنفيذ توليد أو نشر شبكي كامل من الخلفية فيحتاج استكمال ربط طابور Room وتجديد OAuth قبل تفعيله في الإنتاج. التحديث والمزامنة والتوليد ورفع الصور والنشر إجراءات يطلقها المستخدم صراحة. صورة Pinterest يجب أن تكون JPEG أو PNG أو WebP بنسبة عمودية exact 2:3، بينما يتحقق مسار WordPress من نوع البايت الحقيقي قبل الرفع.

## قيم VPS Scraper الافتراضية أثناء البناء (`.env`)

يمكن تضمين عنوان ومفتاح خادم Scraper داخل الـ APK وقت البناء بدل إدخالهما يدوياً في كل تثبيت. انسخ `.env.example` إلى `.env` في جذر المشروع (الملف مستثنى من Git) واملأ:

```ini
ORBITPRESS_SCRAPER_URL=https://23.95.186.208.sslip.io
ORBITPRESS_SCRAPER_KEY=<المفتاح من .env على السيرفر>
```

يقرأ `app/build.gradle.kts` القيمتين (من `.env` ثم من خاصية Gradle `-P` ثم من متغيرات البيئة) ويضعهما في `BuildConfig.SCRAPER_DEFAULT_URL` و`BuildConfig.SCRAPER_DEFAULT_KEY`. القاعدة داخل التطبيق (`ScraperDefaultsContract`): ما يكتبه المستخدم في الإعدادات له الأولوية دائماً، وتُستخدم قيم البناء فقط عندما يكون الحقل فارغاً. يُرفض أي عنوان غير HTTPS عند البناء وعند التشغيل.

**مهلة الفحص (timeout):** فحوصات Playwright على الـ VPS قد تستغرق أكثر من دقيقة، لذلك تنتظر التطبيق افتراضياً **300 ثانية** لرد الـ scraper (كانت 60 ثانية سابقاً). يمكن تغييرها من **Settings → VPS Scraper API → Scraper timeout** بين 30 و900 ثانية. تُرسل القيمة نفسها للسيرفر في حقل `timeoutSeconds` داخل الطلب، فإن كان لديك حد أقصى على الـ VPS (مثل `proxy_read_timeout` في nginx أو مهلة داخل خدمة Playwright) اجعله مساوياً أو أكبر.

**خطأ `Unable to resolve host "…sslip.io"`:** بعض شبكات الهاتف (خاصة بيانات الجوال) ترفض حلّ نطاقات sslip.io/nip.io. العنوان من الشكل `x.x.x.x.sslip.io` يحمل عنوان IP داخله، لذلك يستخرجه التطبيق (`EmbeddedIpHostContract`) ويتصل بالـ IP مباشرة عبر `DirectTlsHttpClient` مع إبقاء SNI والتحقق من الشهادة وترويسة `Host` على اسم النطاق الأصلي — فلا حاجة لـ DNS ولا تنازل عن HTTPS. زر **Test scraper connection** في الإعدادات يجرّب `GET /health` بنفس المسار ويعرض سبب الفشل بدقة (DNS، اتصال، TLS، مفتاح مرفوض).

على GitHub Actions يكتب الـ workflow ملف `.env` تلقائياً: العنوان من مدخل `scraper_url` عند التشغيل اليدوي أو من متغير المستودع `ORBITPRESS_SCRAPER_URL` (وإلا العنوان الافتراضي أعلاه)، والمفتاح من السر `ORBITPRESS_SCRAPER_KEY` فقط. إن لم يُضبط السر يُبنى الـ APK بدون مفتاح ويكفي لصق المفتاح مرة واحدة في الإعدادات — وهو الخيار الموصى به للمستودعات العامة لأن أي مفتاح مضمّن في APK يمكن استخراجه.

## ما تم استبعاده عمدًا

تم استبعاد `local.properties` و`.gradle` وملفات `build` وملفات التوقيع والمفاتيح وأي أسرار وAPKات كبيرة من نسخة المصدر. كما أن مفتاح توقيع الإصدار الموجود على جهاز البناء ليس جزءًا من الحزمة. استخدم مفتاح توقيعك الخاص عند توزيع نسخة إنتاجية.

## ملاحظة مهمة

هذه الحزمة مخصصة للتعديل المحلي. إذا غيّرت Serializer أو SEO أو HTML المنشور، أعد تشغيل اختبارات Gradle قبل تثبيت النسخة على الهاتف، لأن هذه الأجزاء مرتبطة بعقود النشر الأصلية.

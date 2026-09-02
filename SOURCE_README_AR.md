# مصدر OrbitPress 4.0.0

هذه الحزمة هي **مصدر تطبيق Android** وليست APK فقط. يمكنك فتحها وتعديل Kotlin وHTML/CSS/JavaScript ثم تشغيلها خارج Manus باستخدام Android Studio.

## المتطلبات

استخدم Android Studio حديثًا مع Android SDK Platform 35 وBuild Tools مناسبة، وJDK 17. المشروع يستخدم Android Gradle Plugin 8.10.2. لا تحتاج إلى Manus أو إلى الموقع التجريبي لتشغيل التطبيق محليًا.

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

## ما تم استبعاده عمدًا

تم استبعاد `local.properties` و`.gradle` وملفات `build` وملفات التوقيع والمفاتيح وأي أسرار وAPKات كبيرة من نسخة المصدر. كما أن مفتاح توقيع الإصدار الموجود على جهاز البناء ليس جزءًا من الحزمة. استخدم مفتاح توقيعك الخاص عند توزيع نسخة إنتاجية.

## ملاحظة مهمة

هذه الحزمة مخصصة للتعديل المحلي. إذا غيّرت Serializer أو SEO أو HTML المنشور، أعد تشغيل اختبارات Gradle قبل تثبيت النسخة على الهاتف، لأن هذه الأجزاء مرتبطة بعقود النشر الأصلية.

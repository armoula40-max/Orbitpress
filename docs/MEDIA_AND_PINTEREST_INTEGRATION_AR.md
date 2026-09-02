# تكامل توليد الصور وPinterest في OrbitPress 4.0.0

## توليد الصور

يدعم التطبيق مزودين:

| المزود | الإعدادات المطلوبة | شكل الاستجابة |
|---|---|---|
| Cloudflare Workers AI | `imageProvider=cloudflare`، و`imageAccountId`، و`imageApiToken`، واسم النموذج | حقل `image` بصيغة Base64 من Workers AI. |
| OpenAI-compatible Images API | `imageProvider=openai-compatible`، و`imageBaseUrl`، و`imageApiToken`، واسم النموذج | `data[0].b64_json` بصيغة Base64. |

المسار الأصلي هو `generateImage`. يرسل التطبيق مطالبة لا تحتوي نصاً داخل الصورة، ثم يتحقق من نوع الملف وحجمه قبل حفظه داخل مساحة التطبيق المحلية. صورة Featured تستخدم للمقال، بينما صورة Pinterest تخضع لنسبة عمودية exact 2:3.

نموذج Cloudflare الافتراضي هو `@cf/black-forest-labs/flux-1-schnell`. يطلب التطبيق أربع خطوات توليد. يجب تفعيل صلاحية Workers AI المناسبة في حساب Cloudflare، وعدم وضع بيانات الحساب أو التوكن داخل المصدر.

## Pinterest

يستخدم المسار `publishPinterest` نقطة النهاية `POST https://api.pinterest.com/v5/pins`. يلزم OAuth access token بصلاحيات:

- `boards:read`
- `boards:write`
- `pins:read`
- `pins:write`

يلزم أيضاً إدخال `Pinterest Board ID`. يرسل التطبيق العنوان والوصف والرابط والنص البديل والصورة Base64 داخل `media_source`. يرسل الحقل `ai_disclosures.values` بقيمة `AI_MODIFIED` لأن الصورة قد تكون مولدة بالذكاء الاصطناعي.

لا يحاول التطبيق تنفيذ OAuth داخل WebView في هذه المرحلة. يجب الحصول على access token من تطبيق Pinterest مسجل لدى المستخدم ثم إدخاله في Settings. يظل التوكن داخل التخزين المشفر ولا يدخل النسخة الاحتياطية.

## مسار الاستخدام

1. افتح Settings.
2. اختر مزود الصور.
3. أدخل بيانات Cloudflare أو Images API.
4. أدخل Pinterest Board ID وOAuth access token عند الحاجة.
5. افتح مسودة من Review.
6. اضغط Generate with AI للصورة البارزة.
7. اضغط Generate Pinterest image للصورة العمودية.
8. راجع المسودة والصور.
9. انشر المقال إلى WordPress.
10. اضغط Publish image to Pinterest بعد توفر رابط المقال.

## حدود أمان مهمة

يجب عدم تحويل توليد الصور إلى نشر تلقائي دون إضافة تأكيد مستقل. رفع الصور إلى WordPress وتكوين Pin عمليتان خارجيتان، ولذلك يظل كل منهما مرتبطاً بزر واضح. لا ينبغي تسجيل التوكنات أو محتويات Authorization في Activity.

يحتوي التطبيق حالياً على عميل مباشر من الهاتف إلى المزود. في بيئة إنتاج متعددة المستخدمين يفضل نقل هذه الاتصالات إلى خادم وسيط يحمي المفاتيح ويطبق حدود الاستخدام، لكن ذلك يتطلب خدمة خلفية وحسابات وصلاحيات منفصلة.

## التحقق

لم يتم تنفيذ طلب حقيقي إلى Cloudflare أو Pinterest أثناء تعديل المصدر. يجب اختبار ذلك على جهاز التطوير بعد إدخال بيانات المستخدم، مع تشغيل اختبارات Android وبناء Release من Android Studio أو من بيئة تحتوي على JDK 17 وGradle متوافق.

## مصادر التوثيق

[1]: https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/ "Cloudflare FLUX.1 schnell Workers AI documentation"
[2]: https://developers.pinterest.com/docs/api/v5/pins-create/ "Pinterest API v5 Create Pin documentation"

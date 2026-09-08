# تحديث خادم السحب (orbitpress-scraper-api) إلى 1.2.0

هذا المجلد يحمل رقعة Git جاهزة لمستودع **`armoula40-max/orbitpress-scraper-api`** (وكيل Arena لا يملك صلاحية الدفع إلى ذلك المستودع، لذلك الرقعة هنا).

الرقعة تعالج السبب الجذري لرسالة `Facebook returned no accessible public article elements` التي يعرضها التطبيق مع كل VPS scan:

| السبب في الخادم 1.1 | الإصلاح في 1.2 |
| --- | --- |
| Playwright يشغّل «headless shell» الذي يعرّف نفسه `HeadlessChrome` → Facebook يرد بجدار تسجيل دخول بلا أي `[role="article"]` | Chromium الكامل بوضع headless الجديد (`BROWSER_CHANNEL=chromium`) + User-Agent كروم عادي بنفس الإصدار + إخفاء `navigator.webdriver` + منطقة زمنية ولغة ثابتتان (مع fallback تلقائي) |
| cookies جلسة التطبيق كانت تُحقن بلا `expires` فلا تُحفظ في ملف الجلسة، ولا تُستبدل الجلسة القديمة | صلاحية 30 يوماً، تحقق من النطاق، جلسة `c_user`+`xs` جديدة تمسح القديمة؛ الاستجابة تعيد `cookiesForwarded` / `sessionForwarded` / `sessionAccepted` |
| `JOB_TIMEOUT_MS=90000` بينما ينتظر التطبيق 300 ثانية | الافتراضي 180 ثانية، ويُحترم `timeoutSeconds` من الطلب حتى `JOB_TIMEOUT_MAX_MS` (600 ثانية) |
| تحذير عام واحد لكل نتيجة فارغة | `outcome` ∈ `login_wall / session_rejected / checkpoint / unavailable / unsupported_browser / no_posts` + `loginRequired` + جملة `warning` قابلة للتنفيذ (التطبيق 4.1.5 يعرضها كما هي) |

## التطبيق على الخادم (VPS)

```bash
# 1) على الخادم داخل مجلد المستودع
cd ~/orbitpress-scraper-api
git pull                                  # يجب أن تكون على main النظيف (1.1.0)

# 2) انسخ الرقعة إلى الخادم (من هذا المستودع) ثم طبّقها
git am 0001-scraper-api-1.2.0-facebook-session-fix.patch
# أو بدون التزام: git apply --3way 0001-scraper-api-1.2.0-facebook-session-fix.patch

# 3) متغيرات البيئة الجديدة (اختيارية — الافتراضيات مضبوطة داخل الكود)
grep -q '^BROWSER_CHANNEL=' .env || echo 'BROWSER_CHANNEL=chromium' >> .env
sed -i 's/^JOB_TIMEOUT_MS=90000/JOB_TIMEOUT_MS=180000/' .env

# 4) إعادة البناء والتشغيل
sudo docker compose up -d --build
curl -s http://127.0.0.1:8080/health
# متوقع: {"ok":true,"service":"orbitpress-scraper-api","version":"1.2.0","browserChannel":"chromium",...}
```

بديل: ادفع الرقعة إلى فرع على GitHub وافتح Pull Request هناك (`git am` ثم `git push origin HEAD:arena/scraper-1.2.0`)؛ CI المستودع (`node --check` + `npm test`) يمر — 11 اختباراً.

## بعد التحديث — من التطبيق (4.1.5)

1. بطاقة Facebook → **Visible scan** → سجّل الدخول داخل النافذة (مرة واحدة).
2. **Check login** → يجب أن تظهر «This phone: Facebook login cookies present» — وإن كان الخادم بلا جلسة فسيقول «VPS browser: NOT logged in … Run one VPS scan now».
3. **VPS scan** → التطبيق يرسل cookies الجلسة، الخادم يحفظها في `./sessions/facebook`؛ الطلبات التالية تعمل حتى لو لم تُرسل cookies.
4. إن بقيت النتيجة فارغة، اقرأ السطر التقني تحت الحالة: `outcome=session_rejected` أو `checkpoint` يعني أن Facebook رفض الجلسة من عنوان IP الخادم — عندها سجّل الدخول على الخادم نفسه عبر المتصفح المرئي (`docker compose --profile login up browser-login` ثم noVNC على `127.0.0.1:6080` عبر نفق SSH) كما في `SESSION_LOGIN_AR.md`.

# نگهداری قاب‌چین وب

- منبع اولیه: بستهٔ محلی `comic-page-studio-v26.zip`؛ نسخه‌های اصلی دست‌نخورده‌اند.
- خروجی سایت عمومی فقط کد، آیکون و فونت آزاد است. هیچ پروژه یا تصویر شخصی وارد خروجی ساخت نمی‌شود.
- مخزن خصوصی سینک مستقل از مخزن عمومی برنامه است؛ کلیدهای کاربران در GitHub Actions لازم نیستند.
- فرمت محلی کتاب با فایل JSON نسخهٔ ۱۰ سازگار است. پوشش ابری `schema: 1` شامل متادیتا و نشانی تصویرهای تغییرناپذیر است.
- انتشار: push به main → بررسی هسته و ذخیره‌سازی → آزمون مرورگر → GitHub Pages.
- برای برگشت انتشار، از یک commit قبلی در GitHub یک revert معمولی بسازید؛ تاریخچه را بازنویسی نکنید.
- خرابی شبکه، انقضای کلید، سهمیهٔ GitHub یا تداخل نسخه نباید به‌عنوان سینک موفق نمایش داده شوند.
- پروژه‌ها در IndexedDB هستند. Cache Storage فقط پوستهٔ برنامه را نگه می‌دارد؛ ارتقای PWA نباید IndexedDB را پاک کند.
- کلید ذخیره‌شده با رمز محلی کاربر رمز می‌شود؛ رمز و کلید بازشده روی دیسک نگهداری نمی‌شوند.
- برای آزمون زنده، فقط دادهٔ مصنوعی در مخزن خصوصی بفرستید و پس از بررسی، فایل‌های مصنوعی ایجادشده را پاک کنید.

مستندات سرویس‌ها:

- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- GitHub Contents API: https://docs.github.com/en/rest/repos/contents
- Fine-grained tokens: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens

// Cookie consent + optional Google Tag Manager (Consent Mode v2).
// Nothing is loaded until the visitor accepts. Set GTM_ID below when the container exists.
(function () {
    var GTM_ID = ''; // e.g. 'GTM-XXXXXXX' (leave empty: banner works, no tracking script is loaded)
    var KEY = 'geConsent'; // 'granted' | 'denied'
    var base = (document.currentScript && document.currentScript.src || '').replace(/frontend\/js\/consent\.js.*$/, '');

    function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
    function save(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    // Default: everything denied until the visitor chooses
    gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied', wait_for_update: 500 });

    var loaded = false;
    function apply(v) {
        gtag('consent', 'update', { analytics_storage: v, ad_storage: v, ad_user_data: v, ad_personalization: v });
        if (v === 'granted' && GTM_ID && !loaded) {
            loaded = true;
            window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
            var s = document.createElement('script');
            s.async = true;
            s.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(GTM_ID);
            document.head.appendChild(s);
        }
    }

    function hide() { var b = document.getElementById('geConsent'); if (b) b.remove(); }

    function show() {
        if (document.getElementById('geConsent')) return;
        var b = document.createElement('div');
        b.id = 'geConsent';
        b.className = 'ge-consent';
        b.setAttribute('role', 'dialog');
        b.setAttribute('aria-label', 'Cookie sozlamalari');
        b.innerHTML = '<p>Saytni yaxshilash uchun statistika cookie\'laridan foydalanamiz. Tanlov o\'zingizda. <a href="' + base + 'legal/cookies.html">Batafsil</a></p>' +
            '<div class="ge-consent-btns"><button type="button" data-v="denied">Rad etish</button><button type="button" data-v="granted" class="primary">Qabul qilish</button></div>';
        b.addEventListener('click', function (e) {
            var v = e.target.getAttribute && e.target.getAttribute('data-v');
            if (!v) return;
            save(v); apply(v); hide();
        });
        document.body.appendChild(b);
    }

    // Footer link "Cookie sozlamalari" can call window.geConsentOpen()
    window.geConsentOpen = show;

    var saved = read();
    if (saved === 'granted' || saved === 'denied') apply(saved);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { if (!saved) show(); });
    } else if (!saved) { show(); }
})();

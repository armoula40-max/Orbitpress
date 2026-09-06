package com.askinz.publisher

import android.app.Activity
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject

class PinterestScanActivity : Activity() {
  private lateinit var webView: WebView
  private var scanStarted = false
  private var resultBridge: ResultBridge? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val url = intent.getStringExtra(EXTRA_URL).orEmpty().trim()
    if (!isPinterestUrl(url)) return finishWithError("Only public Pinterest HTTPS URLs are supported.")
    webView = WebView(this).apply {
      settings.javaScriptEnabled = true
      settings.domStorageEnabled = true
      settings.allowFileAccess = false
      settings.allowContentAccess = false
      settings.javaScriptCanOpenWindowsAutomatically = false
      webChromeClient = WebChromeClient()
      webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
          val target = request?.url?.toString().orEmpty()
          if (target.isNotBlank() && target.startsWith("http")) {
            if (!isAllowedPinterestUrl(target)) removeResultBridge()
            return false
          }
          removeResultBridge()
          return true
        }
        @Suppress("DEPRECATION")
        override fun shouldOverrideUrlLoading(view: WebView?, target: String?): Boolean {
          val urlTarget = target.orEmpty()
          if (urlTarget.isNotBlank() && urlTarget.startsWith("http")) {
            if (!isAllowedPinterestUrl(urlTarget)) removeResultBridge()
            return false
          }
          removeResultBridge()
          return true
        }
        override fun onPageFinished(view: WebView?, loadedUrl: String?) {
          super.onPageFinished(view, loadedUrl)
          val url = loadedUrl.orEmpty()
          if (!isAllowedPinterestUrl(url)) {
            removeResultBridge()
            return
          }
          if (!scanStarted) {
            scanStarted = true
            installResultBridge()
            view?.postDelayed({ collectVisiblePins() }, 3500)
          }
        }
      }
    }
    setContentView(webView)
    webView.loadUrl(url)
  }

  private fun isPinterestUrl(url: String): Boolean {
    val parsed = runCatching { android.net.Uri.parse(url) }.getOrNull() ?: return false
    val host = parsed.host.orEmpty().lowercase()
    return url.startsWith("https://") && (host == "pinterest.com" || host.endsWith(".pinterest.com"))
  }

  override fun onDestroy() {
    removeResultBridge()
    if (::webView.isInitialized) {
      webView.stopLoading()
      webView.destroy()
    }
    super.onDestroy()
  }

  private fun isAllowedPinterestUrl(url: String): Boolean = isPinterestUrl(url)

  private fun installResultBridge() {
    if (resultBridge != null) return
    val bridge = ResultBridge()
    resultBridge = bridge
    webView.addJavascriptInterface(bridge, "OrbitPressScan")
  }

  private fun removeResultBridge() {
    resultBridge = null
    if (::webView.isInitialized) webView.removeJavascriptInterface("OrbitPressScan")
  }

  private fun collectVisiblePins() {
    val maxPins = intent.getIntExtra(EXTRA_MAX_PINS, 20).coerceIn(1, 40)
    val maxScrolls = intent.getIntExtra(EXTRA_SCROLLS, 6).coerceIn(1, 10)
    val script = """
      (() => {
        let pass = 0;
        const maxPins = $maxPins;
        const maxScrolls = $maxScrolls;
        const clean = value => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, 1800);
        const pinUrl = value => { try { const u = new URL(value, location.href); return u.pathname.includes('/pin/') ? u.href.split('?')[0] : ''; } catch (_) { return ''; } };
        const extract = () => {
          const found = new Map();
          const anchors = Array.from(document.querySelectorAll('a[href*="/pin/"], [data-test-id="pin"] a, [data-test-id="pin"]'));
          anchors.forEach(anchor => {
            const url = pinUrl(anchor.href || anchor.getAttribute('href') || '');
            if (!url || found.has(url)) return;
            const card = anchor.closest('[data-test-id="pin"], [data-test-id="pinWrapper"], [data-test-id*="pin"], article, [role="listitem"]') || anchor.parentElement || anchor;
            const image = card.querySelector('img');
            const heading = card.querySelector('h1,h2,h3,[role="heading"],[data-test-id*="title"],[title]');
            const metaTitle = card.querySelector('meta[property="og:title"],meta[name="title"]');
            const rawText = card.innerText || card.textContent || '';
            const lines = rawText.split('\\n').map(clean).filter(line => line && line.toLowerCase() !== 'pin' && !/^open pin$/i.test(line));
            const text = clean(rawText || image?.alt || '');
            const title = clean(anchor.getAttribute('aria-label') || anchor.getAttribute('title') || heading?.textContent || heading?.getAttribute('title') || metaTitle?.content || image?.alt || lines[0] || 'Pinterest Pin');
            const description = clean(card.querySelector('[data-test-id*="description"],meta[property="og:description"]')?.textContent || card.querySelector('meta[property="og:description"]')?.content || lines.slice(1,3).join(' '));
            const combinedText = clean([title, description, text].filter(Boolean).join(' '));
            found.set(url, {url, title, text:combinedText, description, imageUrl: image?.currentSrc || image?.src || image?.getAttribute('src') || null, publishedAt:null, saves:null, comments:null, shares:null, viralScore:null});
          });
          return Array.from(found.values());
        };
        const all = [];
        const merge = rows => rows.forEach(pin => { if (!all.some(item => item.url === pin.url) && all.length < maxPins) all.push(pin); });
        const tick = () => {
          merge(extract());
          if (pass++ < maxScrolls) { window.scrollTo(0, document.body.scrollHeight); window.setTimeout(tick, 900); }
          else { OrbitPressScan.done(JSON.stringify({ok:true, source:document.title || location.hostname, posts:all, collectionMethod:'visible_webview', completeness:all.length?'partial':'empty', diagnostics:{anchors:document.querySelectorAll('a[href*="/pin/"], [data-test-id="pin"]').length, pageUrl:location.href, fields:'Pinterest profile pages may expose Pin URLs without title or analytics; open individual Pins or use API for complete metadata.'}})); }
        };
        tick();
      })();
    """.trimIndent()
    webView.evaluateJavascript(script, null)
  }

  private fun finishWithError(message: String) {
    setResult(RESULT_OK, intent.putExtra(EXTRA_RESULT, JSONObject().put("ok", false).put("message", message).toString()))
    finish()
  }

  inner class ResultBridge {
    @JavascriptInterface
    fun done(json: String) {
      if (resultBridge == null || isFinishing) return
      resultBridge = null
      setResult(RESULT_OK, intent.putExtra(EXTRA_RESULT, json))
      finish()
    }
  }

  companion object {
    const val EXTRA_URL = "url"
    const val EXTRA_MAX_PINS = "maxPins"
    const val EXTRA_SCROLLS = "scrolls"
    const val EXTRA_RESULT = "result"
  }
}

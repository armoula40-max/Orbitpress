package com.askinz.publisher

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
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
      setLayerType(View.LAYER_TYPE_HARDWARE, null)
      settings.apply {
        javaScriptEnabled = true
        domStorageEnabled = true
        databaseEnabled = false
        allowFileAccess = false
        allowContentAccess = false
        javaScriptCanOpenWindowsAutomatically = false
        cacheMode = WebSettings.LOAD_NO_CACHE
        mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
      }
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
          val loaded = loadedUrl.orEmpty()
          if (!isAllowedPinterestUrl(loaded)) {
            removeResultBridge()
            return
          }
          if (!scanStarted) {
            scanStarted = true
            installResultBridge()
            view?.postDelayed({ collectVisiblePins() }, 3000)
          }
        }

        override fun onRenderProcessGone(view: WebView?, detail: android.webkit.RenderProcessGoneDetail?): Boolean {
          finishWithError("Renderer crashed, please retry.")
          return true
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
      try {
        webView.stopLoading()
        webView.destroy()
      } catch (_: Exception) {}
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
        const clean = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 1800);
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
            const rawText = card.innerText || card.textContent || '';
            const lines = rawText.split('\n').map(clean).filter(line => line && line.toLowerCase() !== 'pin' && !/^open pin$/i.test(line));
            const text = clean(rawText || image?.alt || '');
            const title = clean(anchor.getAttribute('aria-label') || anchor.getAttribute('title') || heading?.textContent || image?.alt || lines[0] || 'Pinterest Pin');
            found.set(url, {url, title, text, imageUrl: image?.currentSrc || image?.src || null, viralScore:null});
          });
          return Array.from(found.values());
        };
        const all = [];
        const merge = rows => rows.forEach(pin => { if (!all.some(item => item.url === pin.url) && all.length < maxPins) all.push(pin); });
        const tick = () => {
          merge(extract());
          if (pass++ < maxScrolls) { window.scrollTo(0, document.body.scrollHeight); window.setTimeout(tick, 800); }
          else { try { OrbitPressScan.done(JSON.stringify({ok:true, source:document.title || location.hostname, posts:all, collectionMethod:'visible_webview'})); } catch(e) {} }
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

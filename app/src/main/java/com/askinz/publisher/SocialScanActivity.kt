package com.askinz.publisher

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject

class SocialScanActivity : Activity() {
  private lateinit var webView: WebView
  private lateinit var statusView: TextView
  private lateinit var scanButton: Button
  private lateinit var platform: String
  private var scanStarted = false
  private var pageReady = false
  private var facebookDeepLinkSeen = false
  private var scanGeneration = 0
  private var resultBridge: ResultBridge? = null

  override fun onCreate(state: Bundle?) {
    super.onCreate(state)
    platform = intent.getStringExtra(EXTRA_PLATFORM).orEmpty().lowercase()
    val requestedUrl = intent.getStringExtra(EXTRA_URL).orEmpty().trim()
    if (platform !in setOf("facebook", "reddit")) return finishWithError("Unsupported social platform.")
    val httpsUrl = normalizeStartUrl(platform, requestedUrl)
      ?: return finishWithError("Enter a valid public HTTPS URL for this platform.")

    statusView = TextView(this).apply {
      text = "Loading ${platform.replaceFirstChar { it.uppercase() }}…"
      setTextColor(Color.parseColor("#475569"))
      setPadding(24, 18, 24, 18)
      textSize = 14f
    }
    scanButton = Button(this).apply {
      text = if (platform == "facebook") "Page loaded — start scan" else "Start scan"
      isEnabled = false
      setOnClickListener {
        if (!pageReady || scanStarted) return@setOnClickListener
        scanStarted = true
        scanButton.isEnabled = false
        statusView.text = "Scanning visible content…"
        collectVisiblePosts()
      }
    }
    val controls = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(Color.WHITE)
      addView(statusView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
      addView(scanButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }

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
        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean = handleNavigation(request?.url?.toString().orEmpty(), view)
        @Suppress("DEPRECATION")
        override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean = handleNavigation(url.orEmpty(), view)
        override fun onPageFinished(view: WebView?, loadedUrl: String?) {
          super.onPageFinished(view, loadedUrl)
          val url = loadedUrl.orEmpty()
          if (!url.startsWith("http")) {
            removeResultBridge()
            return
          }
          if (!isAllowedSocialUrl(url)) {
            pageReady = false
            scanButton.isEnabled = false
            removeResultBridge()
            statusView.text = "Navigation outside ${platform.replaceFirstChar { it.uppercase() }} was blocked."
            return
          }
          pageReady = true
          scanButton.isEnabled = true
          installResultBridge()
          CookieManager.getInstance().flush()
          val loggedIn = platform != "facebook" || hasFacebookSession()
          statusView.text = if (!loggedIn) {
            "Not logged in to Facebook. Log in on this page first (the session stays on this phone and is reused by VPS scans), then start the scan."
          } else if (facebookDeepLinkSeen) {
            "Page loaded. Facebook app-link was blocked; you can now start the scan."
          } else {
            "Page ready. Review or sign in, then start the scan."
          }
          if (platform == "reddit" && !scanStarted) {
            val generation = ++scanGeneration
            view?.postDelayed({
              if (generation == scanGeneration && pageReady && !scanStarted) scanButton.performClick()
            }, 3000)
          }
        }
        override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
          if (request?.isForMainFrame == true) {
            pageReady = false
            scanButton.isEnabled = false
            statusView.text = "Page could not be loaded: ${error?.description ?: "network error"}"
          }
        }
        override fun onRenderProcessGone(view: WebView?, detail: android.webkit.RenderProcessGoneDetail?): Boolean {
          finishWithError("Renderer crashed, please retry.")
          return true
        }
      }
    }

    CookieManager.getInstance().setAcceptCookie(true)
    CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(Color.WHITE)
      addView(controls, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
      addView(webView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
    }
    setContentView(root)
    webView.loadUrl(httpsUrl)
  }

  private fun handleNavigation(target: String, view: WebView?): Boolean {
    if (target.startsWith("fb://") || target.startsWith("intent://")) {
      facebookDeepLinkSeen = true
      removeResultBridge()
      statusView.text = "Facebook app-link blocked. Remain in the browser view and start the scan when ready."
      return true
    }
    if (target.isNotBlank() && target.startsWith("http")) {
      if (!isAllowedSocialUrl(target)) removeResultBridge()
      return false
    }
    removeResultBridge()
    return true
  }

  private fun hasFacebookSession(): Boolean {
    val manager = CookieManager.getInstance()
    val names = listOf("https://www.facebook.com/", "https://facebook.com/", "https://m.facebook.com/")
      .flatMap { manager.getCookie(it).orEmpty().split(';') }
      .mapNotNull { part -> part.substringBefore('=', "").trim().takeIf { it.isNotBlank() } }
      .toSet()
    return "c_user" in names && "xs" in names
  }

  private fun normalizeStartUrl(source: String, url: String): String? {
    val parsed = runCatching { android.net.Uri.parse(url) }.getOrNull() ?: return null
    val host = parsed.host.orEmpty().lowercase()
    if (!url.startsWith("https://")) return null
    val allowed = when (source) {
      "facebook" -> host == "facebook.com" || host.endsWith(".facebook.com")
      "reddit" -> host == "reddit.com" || host.endsWith(".reddit.com")
      else -> false
    }
    return url.takeIf { allowed }
  }

  private fun isAllowedSocialUrl(url: String): Boolean {
    if (!url.startsWith("https://")) return false
    val host = runCatching { android.net.Uri.parse(url).host?.lowercase() }.getOrNull().orEmpty()
    return when (platform) {
      "facebook" -> host == "facebook.com" || host.endsWith(".facebook.com")
      "reddit" -> host == "reddit.com" || host.endsWith(".reddit.com")
      else -> false
    }
  }

  private fun installResultBridge() {
    if (resultBridge != null) return
    val bridge = ResultBridge()
    resultBridge = bridge
    webView.addJavascriptInterface(bridge, "OrbitPressSocial")
  }

  private fun removeResultBridge() {
    resultBridge = null
    if (::webView.isInitialized) webView.removeJavascriptInterface("OrbitPressSocial")
  }

  override fun onDestroy() {
    scanGeneration++
    removeResultBridge()
    CookieManager.getInstance().flush()
    if (::webView.isInitialized) {
      try {
        webView.stopLoading()
        webView.destroy()
      } catch (_: Exception) {}
    }
    super.onDestroy()
  }

  private fun collectVisiblePosts() {
    if (resultBridge == null) {
      statusView.text = "The source page is not ready yet. Wait for it to finish loading."
      scanStarted = false
      scanButton.isEnabled = true
      return
    }
    val maxPosts = intent.getIntExtra(EXTRA_MAX, 20).coerceIn(1, 40)
    val maxScrolls = intent.getIntExtra(EXTRA_SCROLLS, 6).coerceIn(1, 10)
    val script = """
      (() => {
        let pass = 0;
        const maxPosts = $maxPosts;
        const maxScrolls = $maxScrolls;
        const clean = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 2200);
        const selectors = '$platform' === 'facebook'
          ? '[role="article"],div[data-pagelet*="FeedUnit"]'
          : 'shreddit-post,a[data-testid="post-title"],a[data-click-id="body"],article';
        const extract = () => Array.from(document.querySelectorAll(selectors)).map(node => {
          const anchor = node.matches('a') ? node : node.querySelector('a[href]');
          const text = clean(node.innerText || node.textContent);
          const title = clean(node.getAttribute('aria-label') || node.getAttribute('data-title') || (anchor && anchor.innerText) || text.split('\n')[0]);
          const url = anchor && anchor.href ? anchor.href : location.href;
          return { title, text, url, publishedAt: null, metrics: [], comments: null, reactions: null, saves: null, viralScore: null };
        }).filter(item => item.title && item.text.length > 12 && item.url);
        const posts = [];
        const merge = rows => rows.forEach(item => {
          if (!posts.some(existing => existing.url === item.url || existing.title === item.title) && posts.length < maxPosts) posts.push(item);
        });
        const tick = () => {
          merge(extract());
          if (pass++ < maxScrolls) {
            window.scrollTo(0, document.body.scrollHeight);
            window.setTimeout(tick, 750);
          } else {
            try { OrbitPressSocial.done(JSON.stringify({ok:true, platform:'$platform', source:document.title || location.hostname, posts, collectionMethod:'visible_webview'})); } catch(e) {}
          }
        };
        tick();
      })();
    """.trimIndent()
    webView.evaluateJavascript(script, null)
  }

  private fun finishWithError(message: String) {
    setResult(RESULT_OK, intent.putExtra(EXTRA_RESULT, JSONObject().put("ok", false).put("platform", platform).put("message", message).toString()))
    finish()
  }

  inner class ResultBridge {
    @JavascriptInterface
    fun done(raw: String) {
      runOnUiThread {
        if (resultBridge == null || isFinishing) return@runOnUiThread
        resultBridge = null
        statusView.text = "Scan complete. Returning results…"
        setResult(RESULT_OK, intent.putExtra(EXTRA_RESULT, raw))
        finish()
      }
    }
  }

  companion object {
    const val EXTRA_PLATFORM = "platform"
    const val EXTRA_URL = "url"
    const val EXTRA_MAX = "maxPosts"
    const val EXTRA_SCROLLS = "scrolls"
    const val EXTRA_RESULT = "result"
  }
}

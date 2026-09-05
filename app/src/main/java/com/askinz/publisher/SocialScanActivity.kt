package com.askinz.publisher

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
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

  override fun onCreate(state: Bundle?) {
    super.onCreate(state)
    platform = intent.getStringExtra(EXTRA_PLATFORM).orEmpty().lowercase()
    val requestedUrl = intent.getStringExtra(EXTRA_URL).orEmpty().trim()
    if (platform !in setOf("facebook", "reddit")) return finishWithError("Unsupported social platform.")
    val httpsUrl = normalizeStartUrl(platform, requestedUrl)
      ?: return finishWithError("Enter a valid public HTTPS URL for this platform.")

    statusView = TextView(this).apply {
      text = "Loading ${platform.replaceFirstChar { it.uppercase() }}…"
      setTextColor(Color.DKGRAY)
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
      settings.javaScriptEnabled = true
      settings.domStorageEnabled = true
      settings.allowFileAccess = false
      settings.allowContentAccess = false
      settings.javaScriptCanOpenWindowsAutomatically = false
      webChromeClient = WebChromeClient()
      webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean = handleNavigation(request?.url?.toString().orEmpty(), view)

        @Suppress("DEPRECATION")
        override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean = handleNavigation(url.orEmpty(), view)

        override fun onPageFinished(view: WebView?, loadedUrl: String?) {
          super.onPageFinished(view, loadedUrl)
          if (loadedUrl.orEmpty().startsWith("http")) {
            pageReady = true
            scanButton.isEnabled = true
            statusView.text = if (facebookDeepLinkSeen) {
              "Page loaded. Facebook app-link was blocked; you can now start the scan."
            } else {
              "Page ready. Review or sign in, then start the scan."
            }
            if (platform == "reddit" && !scanStarted) {
              val generation = ++scanGeneration
              view?.postDelayed({
                if (generation == scanGeneration && pageReady && !scanStarted) scanButton.performClick()
              }, 3500)
            }
          }
        }

        override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
          if (request?.isForMainFrame == true) {
            pageReady = false
            scanButton.isEnabled = false
            statusView.text = "Page could not be loaded: ${error?.description ?: "network error"}"
          }
        }
      }
      addJavascriptInterface(ResultBridge(), "OrbitPressSocial")
    }

    CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

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
      statusView.text = "Facebook app-link blocked. Remain in the browser view and start the scan when ready."
      return true
    }
    return target.isNotBlank() && !target.startsWith("http://") && !target.startsWith("https://")
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

  override fun onDestroy() {
    scanGeneration++
    if (::webView.isInitialized) {
      webView.stopLoading()
      webView.removeJavascriptInterface("OrbitPressSocial")
      webView.destroy()
    }
    super.onDestroy()
  }

  private fun collectVisiblePosts() {
    val maxPosts = intent.getIntExtra(EXTRA_MAX, 20).coerceIn(1, 40)
    val maxScrolls = intent.getIntExtra(EXTRA_SCROLLS, 6).coerceIn(1, 10)
    val script = """
      (() => {
        let pass = 0;
        const maxPosts = $maxPosts;
        const maxScrolls = $maxScrolls;
        const clean = value => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, 2200);
        const selectors = '$platform' === 'facebook'
          ? '[role="article"],div[data-pagelet*="FeedUnit"]'
          : 'shreddit-post,a[data-testid="post-title"],a[data-click-id="body"],article';
        const extract = () => Array.from(document.querySelectorAll(selectors)).map(node => {
          const anchor = node.matches('a') ? node : node.querySelector('a[href]');
          const text = clean(node.innerText || node.textContent);
          const title = clean(node.getAttribute('aria-label') || node.getAttribute('data-title') || (anchor && anchor.innerText) || text.split('\\n')[0]);
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
            window.setTimeout(tick, 850);
          } else {
            OrbitPressSocial.done(JSON.stringify({ok:true, platform:'$platform', source:document.title || location.hostname, posts, collectionMethod:'visible_webview', completeness:'partial'}));
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

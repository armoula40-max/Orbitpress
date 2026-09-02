package com.askinz.publisher

import android.app.Activity
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONArray
import org.json.JSONObject

class PinterestScanActivity : Activity() {
  private lateinit var webView: WebView
  private var maxPins = 20
  private var scrolls = 6
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val url = intent.getStringExtra(EXTRA_URL).orEmpty()
    maxPins = intent.getIntExtra(EXTRA_MAX_PINS, 20).coerceIn(1, 40)
    scrolls = intent.getIntExtra(EXTRA_SCROLLS, 6).coerceIn(1, 10)
    if (!url.startsWith("https://www.pinterest.com/")) return finishWithError("Only Pinterest HTTPS URLs are supported.")
    webView = WebView(this).apply {
      settings.javaScriptEnabled = true
      settings.domStorageEnabled = true
      settings.allowFileAccess = false
      settings.allowContentAccess = false
      webChromeClient = WebChromeClient()
      webViewClient = object : WebViewClient() {
        override fun onPageFinished(view: WebView?, loadedUrl: String?) {
          super.onPageFinished(view, loadedUrl)
          view?.postDelayed({ collectVisiblePins() }, 1800)
        }
      }
      addJavascriptInterface(ResultBridge(), "OrbitPressScan")
    }
    setContentView(webView)
    webView.loadUrl(url)
  }
  private fun collectVisiblePins() {
    val script = """
      (() => {
        let n=0; const max=$maxPins, scrolls=$scrolls;
        const clean=v=>String(v||'').replace(/\\s+/g,' ').trim().slice(0,1200);
        const extract=()=>Array.from(document.querySelectorAll('a[href*="/pin/"]')).map(a=>{
          const card=a.closest('[data-test-id],article,div')||a;
          const text=clean(card.innerText||a.innerText); const url=a.href;
          const title=clean(a.getAttribute('aria-label')||a.getAttribute('title')||text.split('\\n')[0]);
          return {url,title,text,publishedAt:null,saves:null,comments:null,shares:null};
        }).filter(x=>x.url&&x.title);
        const all=[]; const merge=rows=>rows.forEach(x=>{if(!all.some(y=>y.url===x.url)&&all.length<max)all.push(x)});
        const tick=()=>{merge(extract());if(n++<$scrolls){scrollTo(0,document.body.scrollHeight);setTimeout(tick,700)}else{all.forEach(x=>x.viralScore=null);OrbitPressScan.done(JSON.stringify({ok:true,source:document.title||location.hostname,posts:all,collectionMethod:'visible_webview',completeness:'partial'}))}};
        tick();
      })();
    """.trimIndent()
    webView.evaluateJavascript(script, null)
  }
  private fun finishWithError(message: String) { setResult(RESULT_OK, intent.putExtra(EXTRA_RESULT, JSONObject().put("ok",false).put("message",message).toString())); finish() }
  inner class ResultBridge { @JavascriptInterface fun done(json: String) { setResult(RESULT_OK, intent.putExtra(EXTRA_RESULT,json)); finish() } }
  companion object { const val EXTRA_URL="url"; const val EXTRA_MAX_PINS="maxPins"; const val EXTRA_SCROLLS="scrolls"; const val EXTRA_RESULT="result" }
}

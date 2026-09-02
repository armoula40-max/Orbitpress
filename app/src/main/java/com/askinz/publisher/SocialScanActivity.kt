package com.askinz.publisher
import android.app.Activity
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
class SocialScanActivity: Activity(){
 private lateinit var web:WebView
 override fun onCreate(state:Bundle?){super.onCreate(state);val platform=intent.getStringExtra(EXTRA_PLATFORM).orEmpty();val url=intent.getStringExtra(EXTRA_URL).orEmpty();if(platform !in setOf("facebook","reddit"))return fail("Unsupported platform.");if(!url.startsWith("https://"))return fail("Only HTTPS URLs are supported.");web=WebView(this).apply{settings.javaScriptEnabled=true;settings.domStorageEnabled=true;settings.allowFileAccess=false;settings.allowContentAccess=false;webChromeClient=WebChromeClient();webViewClient=object:WebViewClient(){override fun onPageFinished(v:WebView?,u:String?){v?.postDelayed({scan(platform)},1800)}};addJavascriptInterface(Bridge(platform),"OrbitPressSocial")};setContentView(web);web.loadUrl(url)}
 private fun scan(platform:String){val max=intent.getIntExtra(EXTRA_MAX,20).coerceIn(1,40);val scrolls=intent.getIntExtra(EXTRA_SCROLLS,6).coerceIn(1,10);val selector=if(platform=="reddit")"a[data-click-id='body'],a[href*='/comments/']" else "a[href*='/posts/'],a[href*='/permalink/'],[role='article']";val selectorJson=JSONObject.quote(selector);val js="""(()=>{let n=0,all=[];const clean=v=>String(v||'').replace(/\\s+/g,' ').trim().slice(0,1600);const get=()=>Array.from(document.querySelectorAll($selectorJson)).map(a=>{const c=a.closest('[role="article"],article,div')||a;return {url:a.href||location.href,title:clean(a.innerText||c.innerText).split('\\n')[0],text:clean(c.innerText),publishedAt:null,comments:null,reactions:null,score:null}}).filter(x=>x.title);const tick=()=>{get().forEach(x=>{if(!all.some(y=>y.url===x.url)&&all.length<$max)all.push(x)});if(n++<$scrolls){scrollTo(0,document.body.scrollHeight);setTimeout(tick,700)}else{OrbitPressSocial.done(JSON.stringify({ok:true,platform:'$platform',source:document.title||location.hostname,posts:all,collectionMethod:'visible_webview',completeness:'partial'}))}};tick()})()""";web.evaluateJavascript(js,null)}
 private fun fail(m:String){setResult(RESULT_OK,intent.putExtra(EXTRA_RESULT,JSONObject().put("ok",false).put("platform",intent.getStringExtra(EXTRA_PLATFORM)).put("message",m).toString()));finish()}
 inner class Bridge(private val platform:String){@JavascriptInterface fun done(raw:String){setResult(RESULT_OK,intent.putExtra(EXTRA_RESULT,raw));finish()}}
 companion object{const val EXTRA_PLATFORM="platform";const val EXTRA_URL="url";const val EXTRA_MAX="maxPosts";const val EXTRA_SCROLLS="scrolls";const val EXTRA_RESULT="result"}
}

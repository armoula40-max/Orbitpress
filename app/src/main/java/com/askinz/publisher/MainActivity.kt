package com.askinz.publisher

import android.Manifest
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.util.LruCache
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.File
import java.net.ConnectException
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException
import javax.net.ssl.SSLException
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.Executors

private const val PUBLISH_NOTIFICATION_CHANNEL_ID = "publish_results"
private const val PINTEREST_SCAN_REQUEST = 7101

class MainActivity : Activity() {
  private lateinit var webView: WebView
  private var fileCallback: ValueCallback<Array<Uri>>? = null
  private val ioExecutor = Executors.newFixedThreadPool(3) { r ->
    Thread(r, "OrbitPress-IO").apply { isDaemon = true }
  }
  private val ioDispatcher = ioExecutor.asCoroutineDispatcher()
  private val mainScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
  private val ioScope = CoroutineScope(SupervisorJob() + ioDispatcher)
  private val imageCache = LruCache<String, ByteArray>(8 * 1024 * 1024)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    WebView.setWebContentsDebuggingEnabled(false)

    webView = WebView(this).apply {
      setLayerType(View.LAYER_TYPE_HARDWARE, null)
      settings.apply {
        javaScriptEnabled = true
        domStorageEnabled = true
        databaseEnabled = true
        allowFileAccess = false
        allowContentAccess = true
        allowFileAccessFromFileURLs = false
        allowUniversalAccessFromFileURLs = false
        javaScriptCanOpenWindowsAutomatically = false
        mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        cacheMode = WebSettings.LOAD_DEFAULT
        useWideViewPort = true
        loadWithOverviewMode = true
        setSupportZoom(false)
        builtInZoomControls = false
        displayZoomControls = false
        setGeolocationEnabled(false)
      }
      webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
          val url = request?.url ?: return false
          if (url.scheme == "https") {
            try { startActivity(Intent(Intent.ACTION_VIEW, url)) } catch (_: Exception) {}
            return true
          }
          return url.scheme != "file"
        }
        override fun onRenderProcessGone(view: WebView?, detail: android.webkit.RenderProcessGoneDetail?): Boolean {
          view?.post { view.loadUrl("file:///android_asset/index.html") }
          return true
        }
      }
      webChromeClient = object : WebChromeClient() {
        override fun onShowFileChooser(view: WebView?, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
          fileCallback?.onReceiveValue(null)
          fileCallback = callback
          val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "image/*"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("image/jpeg", "image/png", "image/webp"))
          }
          try { startActivityForResult(intent, FILE_PICKER_REQUEST) } catch (_: Exception) { fileCallback = null; return false }
          return true
        }
      }
      addJavascriptInterface(NativeBridge(this@MainActivity, this, mainScope, ioScope, ioDispatcher, imageCache), "Native")
      loadUrl("file:///android_asset/index.html")
    }

    setContentView(webView)
    createNotificationChannel()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATION_PERMISSION_REQUEST)
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(PUBLISH_NOTIFICATION_CHANNEL_ID, "Publish results", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Results from publish actions started inside OrbitPress"
        enableLights(false)
        enableVibration(false)
        setShowBadge(false)
      }
      getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }
  }

  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode == PINTEREST_SCAN_REQUEST) {
      val raw = data?.getStringExtra(PinterestScanActivity.EXTRA_RESULT)
        ?: data?.getStringExtra(SocialScanActivity.EXTRA_RESULT)
        ?: JSONObject().put("ok", false).put("message", "Social scan returned no result.").toString()
      val platform = runCatching { JSONObject(raw).optString("platform").lowercase() }.getOrDefault("")
      val js = if (platform == "facebook" || platform == "reddit") "window.__socialScanResult(${JSONObject.quote(raw)})" else "window.__pinterestScanResult(${JSONObject.quote(raw)})"
      webView.evaluateJavascript(js, null)
      return
    }
    if (requestCode != FILE_PICKER_REQUEST) return
    val callback = fileCallback ?: return
    fileCallback = null
    callback.onReceiveValue(if (resultCode == RESULT_OK && data?.data != null) arrayOf(data.data!!) else null)
  }

  override fun onDestroy() {
    try { webView.stopLoading(); webView.removeJavascriptInterface("Native"); webView.destroy() } catch (_: Exception) {}
    try { ioExecutor.shutdownNow() } catch (_: Exception) {}
    imageCache.evictAll()
    super.onDestroy()
  }

  override fun onTrimMemory(level: Int) {
    super.onTrimMemory(level)
    if (level >= TRIM_MEMORY_MODERATE) { webView.clearCache(false); imageCache.evictAll() }
  }

  companion object {
    private const val FILE_PICKER_REQUEST = 7001
    private const val NOTIFICATION_PERMISSION_REQUEST = 7002
  }
}

private class NativeBridge(
  private val activity: Activity,
  private val webView: WebView,
  private val mainScope: CoroutineScope,
  private val ioScope: CoroutineScope,
  private val ioDispatcher: kotlinx.coroutines.CoroutineDispatcher,
  private val imageCache: LruCache<String, ByteArray>
) {
  private val preferences by lazy {
    val key = MasterKey.Builder(activity).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
    EncryptedSharedPreferences.create(activity, "askinz_secure_settings", key, EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV, EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
  }

  @JavascriptInterface fun openSocialScanner(requestJson: String) {
    val request = try { JSONObject(requestJson) } catch (_: Exception) { JSONObject() }
    val intent = Intent(activity, SocialScanActivity::class.java).apply {
      putExtra(SocialScanActivity.EXTRA_PLATFORM, request.optString("platform"))
      putExtra(SocialScanActivity.EXTRA_URL, request.optString("url"))
      putExtra(SocialScanActivity.EXTRA_MAX, request.optInt("maxPosts", 20))
      putExtra(SocialScanActivity.EXTRA_SCROLLS, request.optInt("scrolls", 6))
    }
    activity.startActivityForResult(intent, PINTEREST_SCAN_REQUEST)
  }
  @JavascriptInterface fun openPinterestScanner(requestJson: String) {
    val request = try { JSONObject(requestJson) } catch (_: Exception) { JSONObject() }
    val url = request.optString("url").trim()
    val intent = Intent(activity, PinterestScanActivity::class.java).apply {
      putExtra(PinterestScanActivity.EXTRA_URL, url)
      putExtra(PinterestScanActivity.EXTRA_MAX_PINS, request.optInt("maxPins", 20))
      putExtra(PinterestScanActivity.EXTRA_SCROLLS, request.optInt("scrolls", 6))
    }
    activity.startActivityForResult(intent, PINTEREST_SCAN_REQUEST)
  }
  @JavascriptInterface fun loadSettingsLock(): String = JSONObject().put("enabled", preferences.getString("settingsLockHash", "").orEmpty().isNotBlank()).toString()
  @JavascriptInterface fun saveSettingsLock(pin: String) {
    val normalized = SettingsLockContract.normalizePin(pin)
    val editor = preferences.edit()
    if (normalized.isBlank()) { editor.remove("settingsLockHash").apply(); return }
    require(SettingsLockContract.isValidPin(normalized)) { "Settings PIN must contain 4 to 12 digits." }
    editor.putString("settingsLockHash", SettingsLockContract.hashPin(normalized)).apply()
  }
  @JavascriptInterface fun verifySettingsLock(pin: String): Boolean = try { SettingsLockContract.matches(pin, preferences.getString("settingsLockHash", "").orEmpty()) } catch (_: Exception) { false }
  @JavascriptInterface fun loadSettings(siteId: String): String {
    val saved = storedSettings(SettingsPersistenceContract.canonicalSiteId(siteId))
    val scraper = ScraperDefaultsContract.resolve(saved, BuildConfig.SCRAPER_DEFAULT_URL, BuildConfig.SCRAPER_DEFAULT_KEY)
    return JSONObject().put("articleBaseUrl", saved.optString("articleBaseUrl")).put("articleModel", saved.optString("articleModel")).put("wordpressBaseUrl", saved.optString("wordpressBaseUrl")).put("wordpressUsername", saved.optString("wordpressUsername")).put("categoryId", saved.optString("categoryId")).put("articleApiConfigured", saved.optString("articleApiKey").isNotBlank()).put("wordpressConfigured", saved.optString("wordpressAppPassword").isNotBlank()).put("imageConfigured", saved.optString("imageApiToken").isNotBlank()).put("pinterestConfigured", saved.optString("pinterestAccessToken").isNotBlank() && saved.optString("pinterestBoardId").isNotBlank()).put("facebookConfigured", saved.optString("facebookAccessToken").isNotBlank()).put("textPrompt", saved.optString("textPrompt")).put("imagePrompt", saved.optString("imagePrompt")).put("pinterestPrompt", saved.optString("pinterestPrompt")).put("articleImageCount", saved.optInt("articleImageCount", 0)).put("scraperApiBaseUrl", saved.optString("scraperApiBaseUrl")).put("scraperApiConfigured", scraper.configured).put("scraperDefaultUrl", BuildConfig.SCRAPER_DEFAULT_URL).put("scraperUrlFromBuild", scraper.urlFromBuild).put("scraperKeyFromBuild", scraper.keyFromBuild).put("scraperTimeoutSeconds", ScraperDefaultsContract.timeoutSeconds(saved)).toString()
  }
  @JavascriptInterface fun saveSettings(json: String, siteId: String) {
    require(json.length <= 30_000) { "Settings payload is too large." }
    val incoming = JSONObject(json)
    val canonicalSiteId = SettingsPersistenceContract.canonicalSiteId(siteId)
    val saved = SettingsPersistenceContract.merge(storedSettings(canonicalSiteId), incoming)
    val profiles = try { JSONObject(preferences.getString("settingsBySite", "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
    profiles.put(canonicalSiteId, saved)
    preferences.edit().putString("settingsBySite", profiles.toString()).apply()
  }
  @JavascriptInterface fun loadWorkspace(): String = preferences.getString("workspace", "{}") ?: "{}"
  @JavascriptInterface fun saveWorkspace(json: String) {
    require(json.length <= 1_500_000) { "The local workspace is too large. Remove older drafts before adding more." }
    preferences.edit().putString("workspace", json).apply()
  }
  @JavascriptInterface fun schedule(operation: String, siteId: String, delayMinutes: Long): String {
    val safeOperation = operation.trim().lowercase()
    ScheduleContract.validate(delayMinutes, safeOperation)
    val request = OneTimeWorkRequestBuilder<OrbitPressScheduleWorker>().setInitialDelay(delayMinutes, java.util.concurrent.TimeUnit.MINUTES).setInputData(workDataOf(OrbitPressScheduleWorker.KEY_OPERATION to safeOperation, OrbitPressScheduleWorker.KEY_SITE_ID to SettingsPersistenceContract.canonicalSiteId(siteId), OrbitPressScheduleWorker.KEY_DELAY_MINUTES to delayMinutes)).build()
    WorkManager.getInstance(activity).enqueueUniqueWork("orbitpress-${safeOperation}-${SettingsPersistenceContract.canonicalSiteId(siteId)}", ExistingWorkPolicy.REPLACE, request)
    return request.id.toString()
  }
  private fun storedSettings(siteId: String = SettingsPersistenceContract.DEFAULT_SITE_ID): JSONObject = try {
    val profiles = JSONObject(preferences.getString("settingsBySite", "{}") ?: "{}")
    val scoped = profiles.optJSONObject(SettingsPersistenceContract.canonicalSiteId(siteId))
    if (scoped != null) scoped else JSONObject(preferences.getString("settings", "{}") ?: "{}")
  } catch (_: Exception) { JSONObject() }
  private fun requireStoredSettings(request: JSONObject): JSONObject {
    val settings = storedSettings(request.optString("siteId", "site-default"))
    val required = listOf("articleBaseUrl", "articleModel", "articleApiKey", "wordpressBaseUrl", "wordpressUsername", "wordpressAppPassword")
    require(required.all { settings.optString(it).isNotBlank() }) { "Complete and save the Article API and WordPress settings first." }
    PublishingContracts.requireHttpsUrl(settings.getString("articleBaseUrl"), "Article API URL")
    PublishingContracts.requireHttpsUrl(settings.getString("wordpressBaseUrl"), "WordPress URL")
    return settings
  }
  @JavascriptInterface fun call(requestJson: String) {
    val request = try { JSONObject(requestJson) } catch (_: Exception) { return }
    val id = request.optString("id", UUID.randomUUID().toString())
    ioScope.launch {
      val result = try {
        when (request.getString("type")) {
          "analyzeSocialKeywords" -> analyzeSocialKeywords(request)
          "analyzePinterestKeywords" -> analyzePinterestKeywords(request)
          "facebookGraphScan" -> facebookGraphScan(request)
          "pinterestApiScan" -> pinterestApiScan(request)
          "scraperFacebook" -> scraperScan(request, "facebook")
          "scraperPinterest" -> scraperScan(request, "pinterest")
          "scraperPing" -> scraperPing(request)
          "generate" -> generate(request)
          "categories" -> categories(request)
          "syncPublishedPosts" -> syncPublishedPosts(request)
          "testConnection" -> testConnection(request)
          "storeImage" -> storeImage(request)
          "loadImage" -> loadImage(request)
          "removeImage" -> removeImage(request)
          "repairPreview" -> repairPreview(request)
          "repairApply" -> repairApply(request)
          "generateImage" -> generateImage(request)
          "publishPinterest" -> publishPinterest(request)
          "publish" -> publish(request)
          else -> throw IllegalArgumentException("Unknown operation.")
        }
      } catch (error: Exception) { JSONObject().put("ok", false).put("message", error.message ?: "An unexpected error occurred.") }
      if (request.optString("type") == "publish") { withContext(Dispatchers.Main) { notifyPublishResult(request, result) } }
      withContext(Dispatchers.Main) { try { webView.evaluateJavascript("window.__nativeResult(${JSONObject.quote(id)}, ${JSONObject.quote(result.toString())})", null) } catch (_: Exception) {} }
    }
  }
  private fun scraperScan(request: JSONObject, platform: String): JSONObject {
    val settings = storedSettings(request.optString("siteId", SettingsPersistenceContract.DEFAULT_SITE_ID))
    val scraper = ScraperDefaultsContract.resolve(settings, BuildConfig.SCRAPER_DEFAULT_URL, BuildConfig.SCRAPER_DEFAULT_KEY)
    val endpoint = ScraperDefaultsContract.endpoint(scraper, platform)
    val key = scraper.key
    val url = request.optString("url").trim()
    require(url.startsWith("https://")) { "Only HTTPS social URLs are accepted." }
    val limit = request.optInt("limit", 20).coerceIn(1, 200)
    CookieManager.getInstance().flush()
    val cookieSources = if (platform == "facebook") listOf("https://www.facebook.com/", "https://facebook.com/", "https://m.facebook.com/", url) else listOf("https://www.pinterest.com/", "https://pinterest.com/", url)
    val cookieValues = linkedMapOf<String, String>()
    cookieSources.forEach { source -> CookieManager.getInstance().getCookie(source).orEmpty().split(';').forEach { part -> val separator = part.indexOf('='); if (separator > 0) cookieValues[part.substring(0, separator).trim()] = part.substring(separator + 1).trim() } }
    val cookies = JSONArray()
    cookieValues.forEach { (name, value) -> cookies.put(JSONObject().put("name", name).put("value", value)) }
    val timeoutSeconds = ScraperDefaultsContract.timeoutSeconds(settings)
    val body = JSONObject().put("url", url).put(if (platform == "facebook") "maxPosts" else "maxItems", limit).put("cookies", cookies).put("timeoutSeconds", timeoutSeconds)
    return JSONObject(scraperHttp(endpoint, mapOf("Content-Type" to "application/json", "Accept" to "application/json", "x-orbitpress-key" to key), body.toString().toByteArray(StandardCharsets.UTF_8), timeoutSeconds))
  }
  /**
   * POSTs to the VPS scraper. Wildcard-DNS hosts (sslip.io / nip.io) embed their IPv4 address, and some
   * carriers refuse to resolve them ("Unable to resolve host"), so those hosts are dialled directly by IP
   * while TLS SNI + certificate validation + Host header stay bound to the hostname. Other hosts use http().
   */
  private fun scraperHttp(endpoint: String, headers: Map<String, String>, body: ByteArray, timeoutSeconds: Int): String {
    val embeddedIp = EmbeddedIpHostContract.embeddedIpv4ForUrl(endpoint)
    try {
      if (embeddedIp != null) {
        val response = DirectTlsHttpClient.request(endpoint, "POST", headers, body, embeddedIp, connectTimeoutMillis = 20_000, readTimeoutMillis = timeoutSeconds * 1000)
        if (response.status !in 200..299) throw IllegalStateException("Request failed (${response.status}): ${response.body.take(280)}")
        return response.body
      }
      return http(endpoint, "POST", headers, body, readTimeoutMillis = timeoutSeconds * 1000)
    } catch (error: SocketTimeoutException) {
      if (error.message?.contains("connect", ignoreCase = true) == true) throw IllegalStateException("Cannot reach the VPS scraper${if (embeddedIp != null) " at $embeddedIp:443" else ""} (connection timed out). Check that the service and firewall allow HTTPS.")
      throw IllegalStateException("VPS scraper did not answer within $timeoutSeconds s. Lower the item count or raise the scraper timeout in Settings.")
    } catch (_: UnknownHostException) {
      throw IllegalStateException("This network cannot resolve ${runCatching { URL(endpoint).host }.getOrDefault("the scraper host")}. Check the device's internet/DNS, or use an address of the form <server-ip>.sslip.io so the app can dial the IP directly.")
    } catch (error: ConnectException) {
      throw IllegalStateException("Cannot reach the VPS scraper${if (embeddedIp != null) " at $embeddedIp:443" else ""}: ${error.message.orEmpty()}. Check that the service and firewall allow HTTPS.")
    } catch (error: SSLException) {
      throw IllegalStateException("TLS handshake with the VPS scraper failed: ${error.message.orEmpty()}. The server certificate must be valid for the scraper hostname.")
    }
  }
  /** Lets the Settings screen check the scraper before a scan: DNS-independent GET on the base URL. */
  private fun scraperPing(request: JSONObject): JSONObject {
    val settings = storedSettings(request.optString("siteId", SettingsPersistenceContract.DEFAULT_SITE_ID))
    val scraper = ScraperDefaultsContract.resolve(settings, BuildConfig.SCRAPER_DEFAULT_URL, BuildConfig.SCRAPER_DEFAULT_KEY)
    val base = if (scraper.baseUrl.isNotBlank()) PublishingContracts.requireHttpsUrl(scraper.baseUrl, "Scraper API URL") else throw IllegalArgumentException("Enter the VPS Scraper API URL first.")
    val embeddedIp = EmbeddedIpHostContract.embeddedIpv4ForUrl(base)
    val started = System.currentTimeMillis()
    val status = try {
      if (embeddedIp != null) {
        DirectTlsHttpClient.request("$base/health", "GET", mapOf("x-orbitpress-key" to scraper.key), null, embeddedIp, connectTimeoutMillis = 15_000, readTimeoutMillis = 20_000).status
      } else {
        val connection = (URL("$base/health").openConnection() as HttpURLConnection).apply { requestMethod = "GET"; connectTimeout = 15_000; readTimeout = 20_000; instanceFollowRedirects = false; setRequestProperty("x-orbitpress-key", scraper.key) }
        try { connection.responseCode } finally { connection.disconnect() }
      }
    } catch (error: UnknownHostException) {
      throw IllegalStateException("Cannot resolve ${URL(base).host} on this network. Check the device's internet/DNS.")
    } catch (error: ConnectException) {
      throw IllegalStateException("Cannot reach the VPS scraper${if (embeddedIp != null) " at $embeddedIp:443" else ""}: ${error.message.orEmpty()}.")
    } catch (error: SSLException) {
      throw IllegalStateException("TLS handshake failed: ${error.message.orEmpty()}.")
    } catch (_: SocketTimeoutException) {
      throw IllegalStateException("The VPS scraper did not answer the health check within 20 s.")
    }
    val elapsed = System.currentTimeMillis() - started
    val route = if (embeddedIp != null) ", direct IP $embeddedIp" else ""
    val verdict = when (status) {
      in 200..299 -> "Scraper reachable (HTTP $status in $elapsed ms$route)."
      401, 403 -> "Scraper reachable (HTTP $status in $elapsed ms$route) but it rejected the API key. Paste the key from the VPS .env and save."
      404 -> "Scraper reachable (no /health route, HTTP 404 in $elapsed ms$route). DNS, TCP and TLS are fine."
      else -> "Scraper reachable (HTTP $status in $elapsed ms$route)."
    }
    return JSONObject().put("ok", true).put("status", status).put("elapsedMs", elapsed).put("directIp", embeddedIp ?: JSONObject.NULL).put("keyConfigured", scraper.key.isNotBlank()).put("message", verdict)
  }
  private fun facebookGraphScan(request: JSONObject): JSONObject {
    val settings = storedSettings(request.optString("siteId", SettingsPersistenceContract.DEFAULT_SITE_ID))
    val token = settings.optString("facebookAccessToken").trim()
    require(token.isNotBlank()) { "Configure a Facebook access token before using Graph API." }
    val type = request.optString("sourceType", "page").lowercase()
    require(type == "page") { "Facebook Groups Graph API is not available in the current supported API versions." }
    val pageId = request.optString("pageId").trim()
    require(pageId.isNotBlank() && pageId.all { it.isDigit() }) { "Provide a numeric Facebook Page ID." }
    val version = settings.optString("facebookGraphVersion").trim().ifBlank { "v23.0" }
    val page = JSONObject(http(SocialApiContracts.facebookGraphUrl(version, pageId, mapOf("fields" to "id,name,username,about,category,followers_count,fan_count,link,picture.type(large)")), "GET", mapOf("Authorization" to "Bearer $token"), null))
    val feedResponse = JSONObject(http(SocialApiContracts.facebookPageFeed(version, pageId, request.optInt("limit", 25)), "GET", mapOf("Authorization" to "Bearer $token"), null))
    val posts = JSONArray()
    val rows = feedResponse.optJSONArray("data") ?: JSONArray()
    for (i in 0 until rows.length()) posts.put(SocialApiContracts.normalizeFacebookPost(rows.getJSONObject(i)))
    return JSONObject().put("ok", true).put("platform", "facebook").put("sourceType", "page").put("source", SocialApiContracts.normalizeFacebookPage(page)).put("posts", posts).put("paging", feedResponse.optJSONObject("paging") ?: JSONObject()).put("collectionMethod", "facebook_graph_api")
  }
  private fun pinterestApiScan(request: JSONObject): JSONObject {
    val settings = storedSettings(request.optString("siteId", SettingsPersistenceContract.DEFAULT_SITE_ID))
    val token = settings.optString("pinterestAccessToken").trim()
    require(token.isNotBlank()) { "Configure a Pinterest access token before using Pinterest API." }
    val boardId = request.optString("boardId").trim().ifBlank { settings.optString("pinterestBoardId").trim() }
    require(boardId.isNotBlank()) { "Select a Pinterest Board ID before using the API scan." }
    val headers = mapOf("Authorization" to "Bearer $token", "Content-Type" to "application/json")
    val account = JSONObject(http(SocialApiContracts.pinterestUserAccount(), "GET", headers, null))
    val pinsResponse = JSONObject(http(SocialApiContracts.pinterestBoardPins(boardId, request.optInt("pageSize", 50)), "GET", headers, null))
    val rawPins = pinsResponse.optJSONArray("items") ?: pinsResponse.optJSONArray("data") ?: JSONArray()
    val pins = JSONArray()
    for (i in 0 until rawPins.length()) pins.put(SocialApiContracts.normalizePinterestPin(rawPins.getJSONObject(i)))
    val analytics = if (request.optBoolean("includeAnalytics", true)) {
      val end = java.time.LocalDate.now(java.time.ZoneOffset.UTC)
      val start = end.minusDays(request.optInt("days", 30).coerceIn(1, 90).toLong())
      runCatching { SocialApiContracts.normalizePinterestAnalytics(JSONObject(http(SocialApiContracts.pinterestTopPins(start.toString(), end.toString(), request.optString("sortBy", "ENGAGEMENT"), request.optInt("topPins", 50)), "GET", headers, null))) }.getOrElse { JSONArray() }
    } else JSONArray()
    return JSONObject().put("ok", true).put("platform", "pinterest").put("source", account).put("boardId", boardId).put("posts", pins).put("analytics", analytics).put("paging", pinsResponse.optJSONObject("bookmark") ?: JSONObject()).put("collectionMethod", "pinterest_api_v5")
  }
  private fun analyzeSocialKeywords(request: JSONObject): JSONObject {
    val copy = JSONObject(request.toString()).put("task", "Analyze supplied social posts and return strict JSON with summary, reason, primaryKeywords, longTailKeywords, relatedKeywords, topics, winningPhrases, searchIntent, titlePatterns, contentAngles. Separate extracted keywords from suggestions and do not copy posts verbatim.")
    return analyzePinterestKeywords(copy)
  }
  private fun analyzePinterestKeywords(request: JSONObject): JSONObject {
    val settings = requireStoredSettings(request)
    val posts = request.optJSONArray("posts") ?: JSONArray()
    require(posts.length() in 1..20) { "Select between 1 and 20 social posts." }
    val compact = JSONArray()
    for (i in 0 until posts.length()) { val post = posts.getJSONObject(i); compact.put(JSONObject().put("title", post.optString("title").take(500)).put("text", post.optString("text").take(1800)).put("url", post.optString("url")).put("viralScore", post.optDouble("viralScore", 0.0)).put("saves", post.opt("saves")).put("comments", post.opt("comments"))) }
    val platform = request.optString("platform", "pinterest").lowercase().ifBlank { "pinterest" }
    val system = "You are a $platform content analyst. Analyze only the supplied posts. Return strict JSON with keys summary, reason, primaryKeywords, longTailKeywords, relatedKeywords, topics, winningPhrases, searchIntent, titlePatterns, contentAngles. Keep extracted keywords separate from AI suggestions. Do not copy a post verbatim."
    val user = JSONObject().put("platform", platform).put("task", "Extract keywords and explain winning content patterns from the ranked posts.").put("posts", compact).toString()
    val provider = ProviderCompatibilityContract.normalize(settings.getString("articleBaseUrl"), settings.getString("articleModel"))
    val body = JSONObject().put("model", provider.model).put("temperature", 0.2).put("response_format", JSONObject().put("type", "json_object")).put("messages", JSONArray().put(JSONObject().put("role", "system").put("content", system)).put(JSONObject().put("role", "user").put("content", user)))
    val raw = JSONObject(http(chatEndpoint(provider.baseUrl), "POST", mapOf("Authorization" to "Bearer ${settings.getString("articleApiKey")}", "Content-Type" to "application/json"), body.toString().toByteArray()))
    val content = raw.getJSONArray("choices").getJSONObject(0).getJSONObject("message").optString("content")
    val report = try { JSONObject(content) } catch (_: Exception) { JSONObject().put("summary", content).put("primaryKeywords", JSONArray()) }
    return JSONObject().put("ok", true).put("report", report)
  }
  private fun generate(request: JSONObject): JSONObject {
    val settings = requireStoredSettings(request)
    val keyword = request.getString("keyword").trim()
    require(keyword.length in 2..160) { "Enter a keyword between 2 and 160 characters." }
    val type = request.optString("requestedType", "auto")
    val niche = request.optString("niche", "food").trim().ifBlank { "food" }
    val provider = ProviderCompatibilityContract.normalize(settings.getString("articleBaseUrl"), settings.getString("articleModel"))
    val endpoint = chatEndpoint(provider.baseUrl)
    val category = request.optString("categoryName").trim()
    val existingTitles = request.optJSONArray("existingTitles") ?: JSONArray()
    val titleList = (0 until minOf(existingTitles.length(), 20)).joinToString(" | ") { existingTitles.optString(it).take(255) }
    val requestedRecipeCount = RecipeRequestContract.requestedCount(keyword)
    val customizedTextPrompt = settings.optString("textPrompt").trim().replace("{{keyword}}", keyword).replace("{{category}}", category).replace("{{niche}}", niche)
    val prompt = """
      Create a complete, long-form English article for the $niche niche from this keyword: $keyword
      Requested niche: $niche
      Requested format: $type
      Requested complete recipe count: ${if (requestedRecipeCount > 0) requestedRecipeCount else "not explicitly numbered"}
      Preferred category: ${category.ifBlank { "Choose the best existing WordPress category" }}
      Existing site titles to avoid duplicating: ${titleList.ifBlank { "None supplied" }}
      Return valid JSON only with this exact structure:
      {"title":"","metaDescription":"","slug":"","contentType":"recipe|article","categoryName":"","outline":[{"heading":"","keyPoints":[""]}],"htmlContent":"","internalLinks":[{"anchor":"","reason":""}],"recipe":{"isRecipe":false,"description":"","prepTime":"","cookTime":"","totalTime":"","recipeYield":"","cuisine":"","ingredients":[],"instructions":[{"name":"","text":""}],"notes":[]},"recipes":[{"title":"","isRecipe":true,"description":"","prepTime":"","cookTime":"","totalTime":"","recipeYield":"","cuisine":"","ingredients":[""],"instructions":[{"name":"","text":""}],"notes":[""]}],"pinterest":{"title":"","altText":""}}
      Requirements:
      - Infer practical search intent, create distinct title, concise meta under 160 chars, lower-case slug.
      - Provide 3-6 outline H2 sections. htmlContent starts with benefit-led intro, uses H2 sections.
      - For food or explicit recipe keyword, select recipe only when genuinely cookable dish.
      - For cookable dish, recipe must contain sensible ingredients, 4-9 steps, ISO 8601 durations PT15M, yield, cuisine, 1-3 notes. Do not put recipe card inside htmlContent.
      - For non-food niches such as crochet, pets, nails, furniture, home decor, DIY, beauty, gardening, select article; recipe.isRecipe false, recipes empty.
      - Offer 2-4 internal-link anchor suggestions but never invent URLs.
      - Create only concise Pinterest SEO title and alt text.
      - Do not include Markdown, CSS, scripts, iframes, ratings, reviews, calories, nutrition, image URLs, medical claims, citations, affiliate claims, ranking promises.
      ${if (customizedTextPrompt.isBlank()) "" else "\nCUSTOM EDITOR PROMPT:\n$customizedTextPrompt"}
    """.trimIndent()
    val body = JSONObject().put("model", provider.model).put("max_tokens", provider.maxOutputTokens).put("messages", JSONArray().put(JSONObject().put("role", "system").put("content", "You are Askinz's exacting English content editor and SEO strategist. Adapt vocabulary, examples, safety guidance, expertise to requested niche. Produce genuinely helpful original content; use cooking rules only when niche and keyword are food-related. Never fabricate reviews, ratings, citations, testing, nutrition, provenance, medical advice, ranking promises. Write natural English, not keyword repetition. Use only semantic HTML allowed in WordPress post body.")).put(JSONObject().put("role", "user").put("content", prompt))).put("temperature", 0.7).put("response_format", articleResponseFormat())
    val headers = mapOf("Authorization" to "Bearer ${settings.getString("articleApiKey")}", "Content-Type" to "application/json")
    val response = try { http(endpoint, "POST", headers, body.toString().toByteArray()) } catch (error: IllegalStateException) { val message = error.message.orEmpty().lowercase(); if (!(message.contains("response_format") || message.contains("json_schema") || message.contains("unsupported"))) throw IllegalStateException(ProviderCompatibilityContract.diagnostic(error.message.orEmpty())); body.remove("response_format"); http(endpoint, "POST", headers, body.toString().toByteArray()) }
    val content = JSONObject(response).getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content")
    val json = content.trim().removePrefix("```json").removePrefix("```").removeSuffix("```").trim()
    var draft = DraftContract.normalize(JSONObject(json), category)
    if (requestedRecipeCount > 0 && !LongFormCompletenessContract.validate(draft, requestedRecipeCount).valid) {
      val issue = LongFormCompletenessContract.validate(draft, requestedRecipeCount).reason
      val repairPrompt = prompt + "\nCRITICAL COMPLETENESS REPAIR: return exactly $requestedRecipeCount fully populated objects in recipes[]. Do not return summary, names only, or single recipe. Every object must include title, description, at least 4 ingredients with quantities, prep time, cook time, yield, 4-9 numbered instructions, at least one useful note. Previous problem: $issue"
      val repairBody = body.put("messages", JSONArray().put(JSONObject().put("role", "system").put("content", "You are strict recipe-roundup completion editor. Never summarize requested recipes; return every complete recipe.")).put(JSONObject().put("role", "user").put("content", repairPrompt)))
      val repairedResponse = http(endpoint, "POST", headers, repairBody.toString().toByteArray())
      val repairedContent = JSONObject(repairedResponse).getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content")
      val repairedJson = repairedContent.trim().removePrefix("```json").removePrefix("```").removeSuffix("```").trim()
      draft = DraftContract.normalize(JSONObject(repairedJson), category)
      val completeness = LongFormCompletenessContract.validate(draft, requestedRecipeCount)
      require(completeness.valid) { "The Article API returned incomplete long-form output: ${completeness.reason}." }
    }
    return JSONObject().put("ok", true).put("draft", draft)
  }
  private fun articleResponseFormat(): JSONObject {
    val schema = JSONObject("""{"type":"object","properties":{"title":{"type":"string"},"metaDescription":{"type":"string"},"slug":{"type":"string"},"contentType":{"type":"string","enum":["recipe","article"]},"categoryName":{"type":"string"},"outline":{"type":"array","items":{"type":"object","properties":{"heading":{"type":"string"},"keyPoints":{"type":"array","items":{"type":"string"}}},"required":["heading","keyPoints"],"additionalProperties":false}},"htmlContent":{"type":"string"},"internalLinks":{"type":"array","items":{"type":"object","properties":{"anchor":{"type":"string"},"reason":{"type":"string"}},"required":["anchor","reason"],"additionalProperties":false}},"recipe":{"type":"object","properties":{"isRecipe":{"type":"boolean"},"description":{"type":"string"},"prepTime":{"type":"string"},"cookTime":{"type":"string"},"totalTime":{"type":"string"},"recipeYield":{"type":"string"},"cuisine":{"type":"string"},"ingredients":{"type":"array","items":{"type":"string"}},"instructions":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"text":{"type":"string"}},"required":["name","text"],"additionalProperties":false}},"notes":{"type":"array","items":{"type":"string"}}},"required":["isRecipe","description","prepTime","cookTime","totalTime","recipeYield","cuisine","ingredients","instructions","notes"],"additionalProperties":false},"recipes":{"type":"array","maxItems":12,"items":{"type":"object","properties":{"title":{"type":"string"},"isRecipe":{"type":"boolean"},"description":{"type":"string"},"prepTime":{"type":"string"},"cookTime":{"type":"string"},"totalTime":{"type":"string"},"recipeYield":{"type":"string"},"cuisine":{"type":"string"},"ingredients":{"type":"array","items":{"type":"string"}},"instructions":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"text":{"type":"string"}},"required":["name","text"],"additionalProperties":false}},"notes":{"type":"array","items":{"type":"string"}}},"required":["title","isRecipe","description","prepTime","cookTime","totalTime","recipeYield","cuisine","ingredients","instructions","notes"],"additionalProperties":false}},"pinterest":{"type":"object","properties":{"title":{"type":"string"},"altText":{"type":"string"}},"required":["title","altText"],"additionalProperties":false}},"required":["title","metaDescription","slug","contentType","categoryName","outline","htmlContent","internalLinks","recipe","recipes","pinterest"],"additionalProperties":false}""".trimIndent())
    return JSONObject().put("type", "json_schema").put("json_schema", JSONObject().put("name", "askinz_niche_article").put("strict", true).put("schema", schema))
  }
  private fun generateImage(request: JSONObject): JSONObject {
    val settings = requireStoredSettings(request)
    val provider = settings.optString("imageProvider", "cloudflare").lowercase()
    val kind = request.optString("kind", "featured")
    val configuredPrompt = when (kind) { "pinterest" -> settings.optString("pinterestPrompt") else -> settings.optString("imagePrompt") }.trim()
    val prompt = (if (configuredPrompt.isBlank()) request.optString("prompt") else configuredPrompt).trim().replace("{{title}}", request.optString("title")).replace("{{keyword}}", request.optString("keyword"))
    require(prompt.length in 5..2048) { "Image prompt must contain between 5 and 2048 characters." }
    val width = request.optInt("width", 1024).coerceIn(512, 2048)
    val height = request.optInt("height", 1024).coerceIn(512, 2048)
    val token = settings.optString("imageApiToken").trim()
    require(token.isNotBlank()) { "Configure an image generation API token first." }
    val image = when (provider) { "cloudflare" -> generateCloudflareImage(settings, prompt) else -> generateOpenAiCompatibleImage(settings, prompt, width, height) }
    require(kind == "featured" || kind == "pinterest" || kind == "article" || kind.startsWith("recipe-")) { "Unknown generated image type." }
    val validated = validateImage(image.bytes, image.mimeType, kind == "pinterest")
    val reference = "local://${UUID.randomUUID()}.${validated.extension}"
    File(imageDirectory(request.optString("siteId", "site-default")), reference.removePrefix("local://")).writeBytes(validated.bytes)
    imageCache.put(reference, validated.bytes)
    return JSONObject().put("ok", true).put("reference", reference).put("mimeType", validated.mimeType).put("provider", provider)
  }
  private fun generateCloudflareImage(settings: JSONObject, prompt: String): ImagePayload {
    val accountId = settings.optString("imageAccountId").trim()
    require(accountId.isNotBlank()) { "Cloudflare Account ID is required." }
    val model = settings.optString("imageModel", "@cf/black-forest-labs/flux-1-schnell")
    val body = JSONObject().put("prompt", prompt).put("steps", 4)
    val response = http("https://api.cloudflare.com/client/v4/accounts/$accountId/ai/run/$model", "POST", mapOf("Authorization" to "Bearer ${settings.getString("imageApiToken")}", "Content-Type" to "application/json"), body.toString().toByteArray())
    val encoded = JSONObject(response).optString("image")
    require(encoded.isNotBlank()) { "Cloudflare returned no generated image." }
    return ImagePayload(Base64.decode(encoded, Base64.DEFAULT), "image/jpeg", "jpg")
  }
  private fun generateOpenAiCompatibleImage(settings: JSONObject, prompt: String, width: Int, height: Int): ImagePayload {
    val endpoint = PublishingContracts.requireHttpsUrl(settings.getString("imageBaseUrl"), "Image API URL")
    val body = JSONObject().put("model", settings.optString("imageModel", "gpt-image-1")).put("prompt", prompt).put("size", "${width}x$height").put("response_format", "b64_json")
    val response = http(if (endpoint.endsWith("/images/generations")) endpoint else "$endpoint/images/generations", "POST", mapOf("Authorization" to "Bearer ${settings.getString("imageApiToken")}", "Content-Type" to "application/json"), body.toString().toByteArray())
    val item = JSONObject(response).getJSONArray("data").getJSONObject(0)
    val encoded = item.optString("b64_json")
    require(encoded.isNotBlank()) { "Image provider returned no base64 image." }
    return ImagePayload(Base64.decode(encoded, Base64.DEFAULT), "image/png", "png")
  }
  private fun publishPinterest(request: JSONObject): JSONObject {
    val settings = requireStoredSettings(request)
    val token = settings.optString("pinterestAccessToken").trim()
    val boardId = settings.optString("pinterestBoardId").trim()
    require(token.isNotBlank() && boardId.isNotBlank()) { "Configure Pinterest access token and board ID first." }
    val draft = request.getJSONObject("draft")
    val image = parseImage(request.getString("image"), true, request.optString("siteId", "site-default"))
    val encoded = Base64.encodeToString(image.bytes, Base64.NO_WRAP)
    val payload = JSONObject().put("board_id", boardId).put("title", draft.optString("pinterestTitle", draft.optString("title")).take(100)).put("description", draft.optString("metaDescription").take(800)).put("alt_text", draft.optString("pinterestAltText", draft.optString("title")).take(500)).put("link", request.optString("link")).put("ai_disclosures", JSONObject().put("values", JSONArray().put("AI_MODIFIED"))).put("media_source", JSONObject().put("source_type", "image_base64").put("content_type", image.mimeType).put("data", encoded))
    val response = http("https://api.pinterest.com/v5/pins", "POST", mapOf("Authorization" to "Bearer $token", "Content-Type" to "application/json"), payload.toString().toByteArray())
    return JSONObject(response).put("ok", true)
  }
  private fun categories(request: JSONObject): JSONObject {
    val settings = requireStoredSettings(request)
    val root = wpRoot(settings.getString("wordpressBaseUrl"))
    val fetched = mutableListOf<WordPressCategoryRecord>()
    val rows = JSONArray()
    for (page in 1..100) {
      val data = try { JSONArray(http("$root/wp-json/wp/v2/categories?context=edit&per_page=100&hide_empty=false&page=$page&orderby=name&order=asc", "GET", wordpressHeaders(settings), null)) } catch (error: IllegalStateException) { if (error.message.orEmpty().contains("Request failed (400)")) break else throw error }
      for (index in 0 until data.length()) { val item = data.getJSONObject(index); fetched.add(WordPressCategoryRecord(item.getInt("id"), item.getString("name"))) }
      if (data.length() < 100) break
    }
    CategorySyncContracts.normalize(fetched).forEach { item -> rows.put(JSONObject().put("id", item.id).put("name", item.name)) }
    return JSONObject().put("ok", true).put("categories", rows)
  }
  private fun syncPublishedPosts(request: JSONObject): JSONObject {
    val settings = requireStoredSettings(request)
    val root = wpRoot(settings.getString("wordpressBaseUrl"))
    val drafts = request.optJSONArray("drafts") ?: JSONArray()
    val posts = JSONArray()
    for (index in 0 until minOf(drafts.length(), 100)) { val draft = drafts.optJSONObject(index) ?: continue; if (draft.optString("generationStatus") != "published") continue; val post = findTrackedPost(root, settings, draft); if (post == null) posts.put(JSONObject().put("draftId", draft.optString("id")).put("found", false)) else posts.put(JSONObject().put("draftId", draft.optString("id")).put("found", true).put("postId", post.optInt("id")).put("url", post.optString("link")).put("status", post.optString("status")).put("modified", post.optString("modified"))) }
    return JSONObject().put("ok", true).put("posts", posts)
  }
  private fun testConnection(request: JSONObject): JSONObject {
    val settings = requireStoredSettings(request)
    val root = wpRoot(settings.getString("wordpressBaseUrl"))
    val profile = JSONObject(http("$root/wp-json/wp/v2/users/me?context=edit", "GET", wordpressHeaders(settings), null))
    return JSONObject().put("ok", true).put("accountName", profile.optString("name", profile.optString("slug", "WordPress account")))
  }
  private fun safeSiteId(value: String): String = value.ifBlank { "site-default" }.replace(Regex("[^A-Za-z0-9_-]"), "_").take(80)
  private fun imageDirectory(siteId: String = "site-default"): File { val base = File(activity.filesDir, "askinz-images").apply { mkdirs() }; return if (siteId.isBlank() || siteId == "site-default") base else File(base, safeSiteId(siteId)).apply { mkdirs() } }
  private fun storeImage(request: JSONObject): JSONObject {
    val kind = request.optString("kind")
    require(kind == "featured" || kind == "pinterest" || kind == "article" || kind.startsWith("recipe-")) { "Unknown image type." }
    val siteId = request.optString("siteId", "site-default")
    val image = parseImage(request.getString("dataUrl"), kind == "pinterest", siteId)
    val reference = "local://${UUID.randomUUID()}.${image.extension}"
    File(imageDirectory(siteId), reference.removePrefix("local://")).writeBytes(image.bytes)
    imageCache.put(reference, image.bytes)
    return JSONObject().put("ok", true).put("reference", reference).put("mimeType", image.mimeType)
  }
  private fun loadImage(request: JSONObject): JSONObject {
    val ref = request.getString("reference")
    val cached = imageCache.get(ref)
    if (cached != null) { val ext = ref.substringAfterLast('.').lowercase(); val mime = when (ext) { "jpg", "jpeg" -> "image/jpeg"; "webp" -> "image/webp"; else -> "image/png" }; return JSONObject().put("ok", true).put("dataUrl", "data:$mime;base64," + Base64.encodeToString(cached, Base64.NO_WRAP)) }
    val image = parseImageReference(ref, false, request.optString("siteId", "site-default"))
    imageCache.put(ref, image.bytes)
    return JSONObject().put("ok", true).put("dataUrl", "data:${image.mimeType};base64," + Base64.encodeToString(image.bytes, Base64.NO_WRAP))
  }
  private fun removeImage(request: JSONObject): JSONObject { val ref = request.getString("reference"); imageCache.remove(ref); File(imageDirectory(request.optString("siteId", "site-default")), safeImageFilename(ref)).delete(); return JSONObject().put("ok", true) }
  private fun repairPreview(request: JSONObject): JSONObject {
    val settings = requireStoredSettings(request)
    val root = wpRoot(settings.getString("wordpressBaseUrl"))
    val drafts = request.optJSONArray("drafts") ?: JSONArray()
    val posts = JSONArray()
    var tracked = 0; var matched = 0; var fixable = 0
    for (index in 0 until minOf(drafts.length(), 50)) { val draft = drafts.optJSONObject(index) ?: continue; if (draft.optString("generationStatus") != "published") continue; tracked += 1; val post = findTrackedPost(root, settings, draft); if (post == null) { posts.put(JSONObject().put("draftId", draft.optString("id")).put("title", draft.optString("title")).put("matched", false).put("changed", false).put("reason", "Published WordPress post was not found.")); continue }; matched += 1; val inspection = inspectPublishedPost(post); if (inspection.getBoolean("changed")) fixable += 1; posts.put(JSONObject().put("draftId", draft.optString("id")).put("postId", post.getInt("id")).put("title", draft.optString("title")).put("link", post.optString("link")).put("matched", true).put("changed", inspection.getBoolean("changed")).put("reason", inspection.getString("reason"))) }
    return JSONObject().put("ok", true).put("trackedSystemArticles", tracked).put("matchedInWordPress", matched).put("fixablePosts", fixable).put("posts", posts)
  }
  private fun repairApply(request: JSONObject): JSONObject {
    val settings = requireStoredSettings(request)
    val root = wpRoot(settings.getString("wordpressBaseUrl"))
    val drafts = request.optJSONArray("drafts") ?: JSONArray()
    val results = JSONArray(); val failures = JSONArray(); var updated = 0
    for (index in 0 until minOf(drafts.length(), 50)) { val draft = drafts.optJSONObject(index) ?: continue; if (draft.optString("generationStatus") != "published") continue; try { val post = findTrackedPost(root, settings, draft) ?: throw IllegalStateException("Published WordPress post was not found."); val inspection = inspectPublishedPost(post); if (!inspection.getBoolean("changed")) { results.put(JSONObject().put("draftId", draft.optString("id")).put("updated", false).put("reason", "Already uses the current template.")); continue }; val raw = post.optJSONObject("content")?.optString("raw").orEmpty().ifBlank { post.optJSONObject("content")?.optString("rendered").orEmpty() }; require(raw.isNotBlank()) { "WordPress did not return editable post content." }; preferences.edit().putString("repair_backup_${post.getInt("id")}", raw).apply(); var content = raw; val featuredUrl = featuredUrl(root, settings, post); if (inspection.getBoolean("missingFeatured") && !featuredUrl.isNullOrBlank()) { content = WordPressMarkup.featuredImage(featuredUrl, featuredImageAltText(draft)) + content }; var pinterestUrl = pinterestUrlFromContent(content); if (inspection.getBoolean("missingPinterest")) { val reference = draft.optJSONObject("images")?.optString("pinterest").orEmpty(); require(reference.isNotBlank()) { "Pinterest image is missing locally, so this post cannot be repaired safely." }; val media = uploadMedia(root, settings, parseImage(reference, true, request.optString("siteId", "site-default")), "${DraftContract.cleanSlug(draft.optString("slug"))}-pinterest", pinterestImageAltText(draft)); pinterestUrl = media.getString("source_url"); val canonical = "$root/${DraftContract.cleanSlug(draft.optString("slug"))}/"; val share = "https://www.pinterest.com/pin/create/button/?url=" + java.net.URLEncoder.encode(canonical, "UTF-8") + "&media=" + java.net.URLEncoder.encode(pinterestUrl, "UTF-8") + "&description=" + java.net.URLEncoder.encode(draft.optString("pinterestTitle", draft.optString("title")), "UTF-8"); content += WordPressMarkup.pinterestSaveButton(share) }; if (inspection.getBoolean("missingSchema")) { val urls = listOfNotNull(featuredUrl, pinterestUrl); val schema = DraftContract.buildSchema(draft, "$root/${DraftContract.cleanSlug(draft.optString("slug"))}/", urls); content += WordPressMarkup.structuredData(schema.toString()) }; val updatedPost = JSONObject(http("$root/wp-json/wp/v2/posts/${post.getInt("id")}", "POST", wordpressHeaders(settings) + mapOf("Content-Type" to "application/json"), JSONObject().put("content", content).toString().toByteArray())); updated += 1; results.put(JSONObject().put("draftId", draft.optString("id")).put("updated", true).put("postId", updatedPost.getInt("id")).put("link", updatedPost.optString("link")).put("reason", "Template blocks repaired; encrypted local backup saved first.")) } catch (error: Exception) { failures.put(JSONObject().put("draftId", draft.optString("id")).put("title", draft.optString("title")).put("reason", error.message ?: "Unknown repair error.")) } }
    return JSONObject().put("ok", true).put("updatedPosts", updated).put("results", results).put("failures", failures)
  }
  private fun findTrackedPost(root: String, settings: JSONObject, draft: JSONObject): JSONObject? {
    val knownId = draft.optInt("wordpressPostId", 0)
    if (knownId > 0) { val direct = try { JSONObject(http("$root/wp-json/wp/v2/posts/$knownId?context=edit", "GET", wordpressHeaders(settings), null)) } catch (_: Exception) { null }; if (direct != null) return direct }
    val slug = DraftContract.cleanSlug(draft.optString("slug"))
    if (slug.isBlank()) return null
    val rows = JSONArray(http("$root/wp-json/wp/v2/posts?slug=${java.net.URLEncoder.encode(slug, "UTF-8")}&context=edit&per_page=1", "GET", wordpressHeaders(settings), null))
    return if (rows.length() > 0) rows.getJSONObject(0) else null
  }
  private fun inspectPublishedPost(post: JSONObject): JSONObject {
    val content = post.optJSONObject("content")?.optString("raw").orEmpty().ifBlank { post.optJSONObject("content")?.optString("rendered").orEmpty() }
    val missingFeatured = !content.contains("wp-block-image")
    val missingPinterest = !content.contains("data-askinz-pinterest-direct")
    val missingSchema = !content.contains("application/ld+json")
    val reasons = mutableListOf<String>()
    if (missingFeatured) reasons.add("featured image block")
    if (missingPinterest) reasons.add("Pinterest save button")
    if (missingSchema) reasons.add("structured data")
    return JSONObject().put("changed", reasons.isNotEmpty()).put("missingFeatured", missingFeatured).put("missingPinterest", missingPinterest).put("missingSchema", missingSchema).put("reason", if (reasons.isEmpty()) "Already uses the current template." else "Missing ${reasons.joinToString(", ")}.")
  }
  private fun featuredUrl(root: String, settings: JSONObject, post: JSONObject): String? { val mediaId = post.optInt("featured_media", 0); if (mediaId <= 0) return null; return try { JSONObject(http("$root/wp-json/wp/v2/media/$mediaId", "GET", wordpressHeaders(settings), null)).optString("source_url").ifBlank { null } } catch (_: Exception) { null } }
  private fun pinterestUrlFromContent(content: String): String? { val media = Regex("[?&]media=([^&\"']+)", RegexOption.IGNORE_CASE).find(content)?.groupValues?.getOrNull(1) ?: return null; return try { java.net.URLDecoder.decode(media, "UTF-8") } catch (_: Exception) { null } }
  private fun publish(request: JSONObject): JSONObject {
    val settings = requireStoredSettings(request)
    val draft = request.getJSONObject("draft")
    val images = request.getJSONObject("images")
    val root = wpRoot(settings.getString("wordpressBaseUrl"))
    val slug = DraftContract.cleanSlug(draft.getString("slug"))
    require(slug.isNotBlank()) { "The draft slug is invalid." }
    val duplicates = JSONArray(http("$root/wp-json/wp/v2/posts?slug=${java.net.URLEncoder.encode(slug, "UTF-8")}&context=edit&per_page=1", "GET", wordpressHeaders(settings), null))
    require(duplicates.length() == 0) { "A WordPress post with this slug already exists. Change the title or slug first." }
    val featured = parseImage(images.getString("featured"), false, request.optString("siteId", "site-default"))
    val pinterest = parseImage(images.getString("pinterest"), true, request.optString("siteId", "site-default"))
    val featuredAltText = featuredImageAltText(draft)
    val pinterestAltText = pinterestImageAltText(draft)
    val categoryId = request.optInt("categoryId", settings.optInt("categoryId", 0))
    requireExistingCategory(root, settings, categoryId)
    val featuredMedia = uploadMedia(root, settings, featured, "${slug}-featured", featuredAltText)
    val pinterestMedia = uploadMedia(root, settings, pinterest, "${slug}-pinterest", pinterestAltText)
    val extraBlocks = StringBuilder()
    val additional = images.optJSONArray("additional") ?: JSONArray()
    for (index in 0 until minOf(additional.length(), 8)) { val reference = additional.optString(index).trim(); if (reference.isBlank()) continue; val media = uploadMedia(root, settings, parseImage(reference, false, request.optString("siteId", "site-default")), "$slug-inline-${index + 1}", "${draft.optString("title")} image ${index + 1}"); extraBlocks.append(WordPressMarkup.featuredImage(media.getString("source_url"), "${draft.optString("title")} image ${index + 1}")) }
    val featuredUrl = featuredMedia.getString("source_url")
    val pinterestUrl = pinterestMedia.getString("source_url")
    val pinTitle = draft.optString("pinterestTitle", draft.optString("title")).trim()
    val share = "https://www.pinterest.com/pin/create/button/?url=" + java.net.URLEncoder.encode("$root/$slug/", "UTF-8") + "&media=" + java.net.URLEncoder.encode(pinterestUrl, "UTF-8") + "&description=" + java.net.URLEncoder.encode(pinTitle, "UTF-8")
    val featuredBlock = WordPressMarkup.featuredImage(featuredUrl, featuredAltText)
    val pinBlock = WordPressMarkup.pinterestSaveButton(share)
    val schema = DraftContract.buildSchema(draft, "$root/$slug/", listOf(featuredUrl, pinterestUrl))
    val post = JSONObject().put("title", draft.getString("title")).put("slug", slug).put("status", PublishingContracts.normalizePostStatus(request.optString("postStatus", draft.optString("postStatus", "publish")))).put("content", featuredBlock + draft.getString("htmlContent") + extraBlocks.toString() + pinBlock + WordPressMarkup.structuredData(schema.toString())).put("excerpt", draft.optString("metaDescription")).put("featured_media", featuredMedia.getInt("id"))
    post.put("categories", JSONArray().put(categoryId))
    val rawTags = draft.optJSONArray("tags") ?: JSONArray()
    post.put("tags", resolveTagIds(root, settings, PublishingContracts.normalizeTags((0 until minOf(rawTags.length(), 20)).map { rawTags.optString(it) })))
    val meta = JSONObject().put("orbitpress_canonical_url", SeoContract.canonical(draft.optString("canonicalUrl"))).put("orbitpress_og_title", SeoContract.text(draft.optString("ogTitle"), 100)).put("orbitpress_og_description", SeoContract.text(draft.optString("ogDescription"), 200))
    post.put("meta", meta)
    val published = JSONObject(http("$root/wp-json/wp/v2/posts", "POST", wordpressHeaders(settings) + mapOf("Content-Type" to "application/json"), post.toString().toByteArray()))
    return JSONObject().put("ok", true).put("url", published.optString("link")).put("postId", published.optInt("id"))
  }
  private fun notifyPublishResult(request: JSONObject, result: JSONObject) {
    val manager = activity.getSystemService(NotificationManager::class.java) ?: return
    val permissionGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    if (!NotificationContracts.shouldNotify(permissionGranted)) return
    val kind = NotificationContracts.classify(result.optBoolean("ok", false), result.optString("message"))
    val message = NotificationContracts.headline(kind)
    val title = request.optJSONObject("draft")?.optString("title").orEmpty().ifBlank { "Article" }.take(80)
    val intent = Intent(activity, MainActivity::class.java).apply { flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP }
    val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
    val pending = PendingIntent.getActivity(activity, title.hashCode(), intent, pendingFlags)
    val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) android.app.Notification.Builder(activity, PUBLISH_NOTIFICATION_CHANNEL_ID).setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("OrbitPress · $message").setContentText(title).setAutoCancel(true).setContentIntent(pending).build() else { @Suppress("DEPRECATION") android.app.Notification.Builder(activity).setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("OrbitPress · $message").setContentText(title).setAutoCancel(true).setContentIntent(pending).build() }
    manager.notify((title.hashCode() and 0x7fffffff), notification)
  }
  private data class ImagePayload(val bytes: ByteArray, val mimeType: String, val extension: String)
  private fun parseImage(dataUrl: String, pinterest: Boolean, siteId: String = "site-default"): ImagePayload {
    if (dataUrl.startsWith("local://")) return parseImageReference(dataUrl, pinterest, siteId)
    val separator = dataUrl.indexOf(',')
    require(separator > 0 && dataUrl.startsWith("data:")) { "Choose a valid image file." }
    val declaredMime = dataUrl.substring(5, dataUrl.indexOf(';'))
    val bytes = Base64.decode(dataUrl.substring(separator + 1), Base64.DEFAULT)
    require(bytes.isNotEmpty() && bytes.size <= 12_000_000) { "Choose an image smaller than 12 MB." }
    return validateImage(bytes, PublishingContracts.validatedImageMimeType(declaredMime, bytes), pinterest)
  }
  private fun parseImageReference(reference: String, pinterest: Boolean, siteId: String = "site-default"): ImagePayload {
    val filename = safeImageFilename(reference)
    val extension = filename.substringAfterLast('.').lowercase()
    val declaredMime = when (extension) { "jpg", "jpeg" -> "image/jpeg"; "webp" -> "image/webp"; "png" -> "image/png"; else -> throw IllegalArgumentException("Unsupported local image format.") }
    val file = File(imageDirectory(siteId), filename)
    require(file.isFile) { "The saved image is no longer available on this phone. Select it again." }
    val bytes = file.readBytes()
    return validateImage(bytes, PublishingContracts.validatedImageMimeType(declaredMime, bytes), pinterest)
  }
  private fun safeImageFilename(reference: String): String { require(reference.startsWith("local://")) { "Invalid local image reference." }; val filename = reference.removePrefix("local://"); require(Regex("^[a-f0-9-]+\\.(jpg|png|webp)$").matches(filename)) { "Invalid local image reference." }; return filename }
  private fun validateImage(bytes: ByteArray, mime: String, pinterest: Boolean): ImagePayload {
    require(bytes.isNotEmpty() && bytes.size <= 12_000_000) { "Choose an image smaller than 12 MB." }
    if (pinterest) { val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }; BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds); require(bounds.outWidth > 0 && bounds.outHeight > 0 && bounds.outWidth * 3 == bounds.outHeight * 2) { "Pinterest image must have an exact 2:3 portrait ratio, such as 1000×1500." } }
    return ImagePayload(bytes, mime, when (mime) { "image/jpeg" -> "jpg"; "image/webp" -> "webp"; else -> "png" })
  }
  private fun uploadMedia(root: String, settings: JSONObject, image: ImagePayload, basename: String, altText: String): JSONObject {
    val response = http("$root/wp-json/wp/v2/media", "POST", wordpressHeaders(settings) + mapOf("Content-Type" to image.mimeType, "Content-Disposition" to "attachment; filename=\"$basename.${image.extension}\""), image.bytes)
    val media = JSONObject(response)
    http("$root/wp-json/wp/v2/media/${media.getInt("id")}", "POST", wordpressHeaders(settings) + mapOf("Content-Type" to "application/json"), JSONObject().put("alt_text", altText.take(320)).toString().toByteArray())
    return media
  }
  private fun resolveTagIds(root: String, settings: JSONObject, names: List<String>): JSONArray {
    val ids = JSONArray()
    for (name in names) { val clean = name.trim().take(100); if (clean.isBlank()) continue; val found = JSONArray(http("$root/wp-json/wp/v2/tags?search=${java.net.URLEncoder.encode(clean, "UTF-8")}&per_page=1", "GET", wordpressHeaders(settings), null)); if (found.length() > 0) { ids.put(found.getJSONObject(0).getInt("id")); continue }; val created = JSONObject(http("$root/wp-json/wp/v2/tags", "POST", wordpressHeaders(settings) + mapOf("Content-Type" to "application/json"), JSONObject().put("name", clean).toString().toByteArray())); ids.put(created.getInt("id")) }
    return ids
  }
  private fun requireExistingCategory(root: String, settings: JSONObject, categoryId: Int) { PublishingContracts.requireExistingCategoryId(categoryId); val category = JSONObject(http("$root/wp-json/wp/v2/categories/$categoryId?context=edit", "GET", wordpressHeaders(settings), null)); require(category.optInt("id", 0) == categoryId) { "Choose one of the existing WordPress categories before publishing." } }
  private fun featuredImageAltText(draft: JSONObject): String = PublishingContracts.featuredImageAltText(draft.optString("title"), draft.optString("contentType"))
  private fun pinterestImageAltText(draft: JSONObject): String = PublishingContracts.pinterestImageAltText(draft.optString("pinterestTitle"), draft.optString("title"))
  private fun wordpressHeaders(settings: JSONObject): Map<String, String> { val raw = "${settings.getString("wordpressUsername")}:${settings.getString("wordpressAppPassword")}".toByteArray(StandardCharsets.UTF_8); return mapOf("Authorization" to "Basic ${Base64.encodeToString(raw, Base64.NO_WRAP)}") }
  private fun http(url: String, method: String, headers: Map<String, String>, body: ByteArray?, readTimeoutMillis: Int = 60_000): String {
    var currentUrl = url; var currentMethod = method; var currentBody: ByteArray? = body
    repeat(4) { hop ->
      val bodySnapshot = currentBody
      val connection = (URL(currentUrl).openConnection() as HttpURLConnection).apply {
        requestMethod = currentMethod; connectTimeout = 20_000; readTimeout = readTimeoutMillis; instanceFollowRedirects = false; useCaches = false
        setRequestProperty("Connection", "keep-alive"); setRequestProperty("Accept-Encoding", "gzip")
        headers.forEach { (k, v) -> setRequestProperty(k, v) }
        if (bodySnapshot != null) { doOutput = true; setFixedLengthStreamingMode(bodySnapshot.size); outputStream.use { it.write(bodySnapshot) } }
      }
      val status = connection.responseCode
      if (status in 300..399) { val location = connection.getHeaderField("Location")?.trim().orEmpty(); if (location.isBlank()) throw IllegalStateException("Request failed ($status): redirect without Location"); val next = URL(URL(currentUrl), location).toString(); require(next.startsWith("https://")) { "Request redirected to a non-HTTPS URL." }; if (status in 301..302 && currentMethod != "GET" && currentMethod != "HEAD") throw IllegalStateException("Request failed ($status): WordPress redirected a $currentMethod request to $next."); currentUrl = next; if (status in 301..302) { currentMethod = "GET"; currentBody = null }; if (hop == 3) throw IllegalStateException("Request failed ($status): too many redirects; last Location=$next"); connection.disconnect(); return@repeat }
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val response = stream?.use { input -> val buffered = BufferedInputStream(input, 8192); val encoding = connection.getHeaderField("Content-Encoding"); val decoded = if (encoding?.contains("gzip", true) == true) java.util.zip.GZIPInputStream(buffered) else buffered; decoded.readBytes().toString(StandardCharsets.UTF_8) } ?: ""
      connection.disconnect()
      if (status !in 200..299) throw IllegalStateException("Request failed ($status): ${response.take(280)}")
      return response
    }
    throw IllegalStateException("Request failed: too many redirects")
  }
  private fun chatEndpoint(base: String): String = PublishingContracts.requireHttpsUrl(base, "Article API URL").let { if (it.endsWith("/chat/completions")) it else "$it/chat/completions" }
  private fun wpRoot(base: String): String = PublishingContracts.requireHttpsUrl(base, "WordPress URL").removeSuffix("/wp-json")
}

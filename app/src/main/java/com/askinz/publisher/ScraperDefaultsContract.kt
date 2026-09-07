package com.askinz.publisher

import org.json.JSONObject

/**
 * Pure rules for resolving the VPS Scraper endpoint.
 *
 * Values typed by the user in Settings always win. When a field is blank the app falls back to the
 * build-time defaults injected from `.env` (ORBITPRESS_SCRAPER_URL / ORBITPRESS_SCRAPER_KEY) through
 * BuildConfig, so a freshly installed APK can point at the VPS without manual setup.
 */
object ScraperDefaultsContract {
  data class Resolved(
    val baseUrl: String,
    val key: String,
    val urlFromBuild: Boolean,
    val keyFromBuild: Boolean,
  ) {
    val configured: Boolean get() = baseUrl.isNotBlank() && key.isNotBlank()
  }

  fun normalizeBaseUrl(raw: String?): String = raw?.trim().orEmpty().trimEnd('/')

  fun resolve(settings: JSONObject, buildUrl: String?, buildKey: String?): Resolved {
    val savedUrl = normalizeBaseUrl(settings.optString("scraperApiBaseUrl"))
    val savedKey = settings.optString("scraperApiKey").trim()
    val defaultUrl = normalizeBaseUrl(buildUrl)
    val defaultKey = buildKey?.trim().orEmpty()
    return Resolved(
      baseUrl = savedUrl.ifBlank { defaultUrl },
      key = savedKey.ifBlank { defaultKey },
      urlFromBuild = savedUrl.isBlank() && defaultUrl.isNotBlank(),
      keyFromBuild = savedKey.isBlank() && defaultKey.isNotBlank(),
    )
  }

  /** Returns the validated HTTPS base URL or throws a user-facing error. */
  fun requireEndpoint(resolved: Resolved): String {
    require(resolved.configured) { "Configure the VPS Scraper API URL and key first." }
    return PublishingContracts.requireHttpsUrl(resolved.baseUrl, "Scraper API URL")
  }

  fun endpoint(resolved: Resolved, platform: String): String = "${requireEndpoint(resolved)}/api/$platform/scrape"

  /** Playwright scans routinely take longer than a minute; the default read timeout is 5 minutes. */
  const val DEFAULT_TIMEOUT_SECONDS = 300
  const val MIN_TIMEOUT_SECONDS = 30
  const val MAX_TIMEOUT_SECONDS = 900

  /** Seconds the app waits for the scraper to answer; blank/invalid settings fall back to the default. */
  fun timeoutSeconds(settings: JSONObject): Int {
    val raw = settings.optString("scraperTimeoutSeconds").trim()
    val parsed = raw.toIntOrNull() ?: return DEFAULT_TIMEOUT_SECONDS
    return parsed.coerceIn(MIN_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS)
  }

  fun timeoutMillis(settings: JSONObject): Int = timeoutSeconds(settings) * 1000
}

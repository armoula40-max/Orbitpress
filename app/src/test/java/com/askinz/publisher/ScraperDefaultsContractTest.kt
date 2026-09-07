package com.askinz.publisher

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ScraperDefaultsContractTest {
  private val buildUrl = "https://23.95.186.208.sslip.io/"
  private val buildKey = "build-key"

  @Test
  fun fallsBackToBuildDefaultsWhenSettingsAreBlank() {
    val resolved = ScraperDefaultsContract.resolve(JSONObject(), buildUrl, buildKey)
    assertEquals("https://23.95.186.208.sslip.io", resolved.baseUrl)
    assertEquals("build-key", resolved.key)
    assertTrue(resolved.urlFromBuild)
    assertTrue(resolved.keyFromBuild)
    assertTrue(resolved.configured)
    assertEquals("https://23.95.186.208.sslip.io/api/pinterest/scrape", ScraperDefaultsContract.endpoint(resolved, "pinterest"))
  }

  @Test
  fun savedSettingsAlwaysWinOverBuildDefaults() {
    val settings = JSONObject().put("scraperApiBaseUrl", " https://scraper.example.com/ ").put("scraperApiKey", " user-key ")
    val resolved = ScraperDefaultsContract.resolve(settings, buildUrl, buildKey)
    assertEquals("https://scraper.example.com", resolved.baseUrl)
    assertEquals("user-key", resolved.key)
    assertFalse(resolved.urlFromBuild)
    assertFalse(resolved.keyFromBuild)
    assertEquals("https://scraper.example.com/api/facebook/scrape", ScraperDefaultsContract.endpoint(resolved, "facebook"))
  }

  @Test
  fun mixesBuildUrlWithUserKeyWhenOnlyTheKeyIsSaved() {
    val settings = JSONObject().put("scraperApiKey", "user-key")
    val resolved = ScraperDefaultsContract.resolve(settings, buildUrl, "")
    assertEquals("https://23.95.186.208.sslip.io", resolved.baseUrl)
    assertEquals("user-key", resolved.key)
    assertTrue(resolved.urlFromBuild)
    assertFalse(resolved.keyFromBuild)
    assertTrue(resolved.configured)
  }

  @Test
  fun rejectsMissingKeyAndNonHttpsUrls() {
    val noKey = ScraperDefaultsContract.resolve(JSONObject(), buildUrl, "")
    assertFalse(noKey.configured)
    val missing = assertThrows(IllegalArgumentException::class.java) { ScraperDefaultsContract.requireEndpoint(noKey) }
    assertEquals("Configure the VPS Scraper API URL and key first.", missing.message)

    val insecure = ScraperDefaultsContract.resolve(JSONObject().put("scraperApiBaseUrl", "http://23.95.186.208"), buildUrl, buildKey)
    val error = assertThrows(IllegalArgumentException::class.java) { ScraperDefaultsContract.requireEndpoint(insecure) }
    assertEquals("Scraper API URL must use HTTPS.", error.message)
  }

  @Test
  fun emptyBuildDefaultsKeepTheFeatureUnconfigured() {
    val resolved = ScraperDefaultsContract.resolve(JSONObject(), "", "")
    assertEquals("", resolved.baseUrl)
    assertFalse(resolved.urlFromBuild)
    assertFalse(resolved.keyFromBuild)
    assertFalse(resolved.configured)
  }
}

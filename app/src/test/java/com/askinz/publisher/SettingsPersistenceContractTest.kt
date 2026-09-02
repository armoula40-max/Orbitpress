package com.askinz.publisher

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsPersistenceContractTest {
  @Test
  fun canonicalizesBlankSiteIdsToDefault() {
    assertEquals(SettingsPersistenceContract.DEFAULT_SITE_ID, SettingsPersistenceContract.canonicalSiteId(null))
    assertEquals(SettingsPersistenceContract.DEFAULT_SITE_ID, SettingsPersistenceContract.canonicalSiteId("  "))
    assertEquals("site-two", SettingsPersistenceContract.canonicalSiteId(" site-two "))
  }

  @Test
  fun mergesNonSecretFieldsAndRetainsExistingSecretsWhenIncomingFieldsAreBlank() {
    val existing = JSONObject()
      .put("articleApiKey", "article-secret")
      .put("wordpressAppPassword", "wordpress-secret")
      .put("articleBaseUrl", "https://old.example/v1")
    val incoming = JSONObject()
      .put("articleBaseUrl", "https://new.example/v1")
      .put("articleModel", "new-model")
      .put("wordpressBaseUrl", "https://site.example")
      .put("wordpressUsername", "editor")
      .put("categoryId", "42")
      .put("articleApiKey", "")
      .put("wordpressAppPassword", "")

    val merged = SettingsPersistenceContract.merge(existing, incoming)

    assertEquals("https://new.example/v1", merged.getString("articleBaseUrl"))
    assertEquals("new-model", merged.getString("articleModel"))
    assertEquals("article-secret", merged.getString("articleApiKey"))
    assertEquals("wordpress-secret", merged.getString("wordpressAppPassword"))
  }

  @Test
  fun recognizesACompleteSavedProfileAfterReload() {
    val saved = JSONObject()
      .put("articleBaseUrl", "https://api.example/v1")
      .put("articleModel", "article-model")
      .put("articleApiKey", "article-secret")
      .put("wordpressBaseUrl", "https://site.example")
      .put("wordpressUsername", "editor")
      .put("wordpressAppPassword", "wordpress-secret")

    val incomplete = JSONObject(saved.toString()).apply { remove("wordpressAppPassword") }
    assertTrue(SettingsPersistenceContract.isConfigured(saved))
    assertFalse(SettingsPersistenceContract.isConfigured(incomplete))
  }
}

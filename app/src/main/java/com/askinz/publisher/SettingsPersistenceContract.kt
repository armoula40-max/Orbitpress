package com.askinz.publisher

import org.json.JSONObject

/** Pure rules for keeping one encrypted settings record per active website. */
object SettingsPersistenceContract {
  const val DEFAULT_SITE_ID = "site-default"

  fun canonicalSiteId(rawSiteId: String?): String = rawSiteId?.trim().orEmpty().ifBlank { DEFAULT_SITE_ID }

  fun merge(existing: JSONObject, incoming: JSONObject): JSONObject {
    val merged = JSONObject(existing.toString())
    listOf("articleBaseUrl", "articleModel", "wordpressBaseUrl", "wordpressUsername", "categoryId", "imageProvider", "imageBaseUrl", "imageAccountId", "imageModel", "pinterestBoardId", "textPrompt", "imagePrompt", "pinterestPrompt", "articleImageCount").forEach { key ->
      merged.put(key, incoming.optString(key).trim())
    }
    listOf("articleApiKey", "wordpressAppPassword", "imageApiToken", "pinterestAccessToken").forEach { key ->
      incoming.optString(key).trim().takeIf { it.isNotBlank() }?.let { merged.put(key, it) }
    }
    return merged
  }

  fun isConfigured(settings: JSONObject): Boolean {
    val required = listOf(
      "articleBaseUrl",
      "articleModel",
      "articleApiKey",
      "wordpressBaseUrl",
      "wordpressUsername",
      "wordpressAppPassword",
    )
    return required.all { settings.optString(it).trim().isNotBlank() }
  }
}

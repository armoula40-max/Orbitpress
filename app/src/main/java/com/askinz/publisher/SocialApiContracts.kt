package com.askinz.publisher

import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/** Pure URL and response-shaping rules for official social APIs. */
object SocialApiContracts {
  fun facebookGraphUrl(version: String, path: String, query: Map<String, String> = emptyMap()): String {
    val safeVersion = version.trim().ifBlank { "v23.0" }.removePrefix("/")
    val safePath = path.trim().trim('/')
    val encoded = query.entries.joinToString("&") { "${urlEncode(it.key)}=${urlEncode(it.value)}" }
    return "https://graph.facebook.com/$safeVersion/$safePath" + if (encoded.isBlank()) "" else "?$encoded"
  }

  fun facebookPageFields(pageId: String): String = facebookGraphUrl(
    version = "v23.0",
    path = pageId,
    query = mapOf("fields" to "id,name,username,about,category,followers_count,fan_count,link,picture.type(large)")
  )

  fun facebookPageFeed(version: String, pageId: String, limit: Int): String = facebookGraphUrl(
    version = version,
    path = "$pageId/feed",
    query = mapOf(
      "fields" to "id,message,story,created_time,permalink_url,shares,comments.limit(0).summary(true),reactions.limit(0).summary(true)",
      "limit" to limit.coerceIn(1, 100).toString()
    )
  )

  fun pinterestApiUrl(path: String, query: Map<String, String> = emptyMap()): String {
    val encoded = query.entries.joinToString("&") { "${urlEncode(it.key)}=${urlEncode(it.value)}" }
    return "https://api.pinterest.com/v5/${path.trimStart('/')}" + if (encoded.isBlank()) "" else "?$encoded"
  }

  fun pinterestUserAccount(): String = pinterestApiUrl("user_account")

  fun pinterestBoards(pageSize: Int = 100): String = pinterestApiUrl("boards", mapOf("page_size" to pageSize.coerceIn(1, 250).toString()))

  fun pinterestBoardPins(boardId: String, pageSize: Int = 100): String = pinterestApiUrl("boards/$boardId/pins", mapOf("page_size" to pageSize.coerceIn(1, 250).toString()))

  fun pinterestTopPins(startDate: String, endDate: String, sortBy: String, count: Int): String = pinterestApiUrl(
    "user_account/analytics/top_pins",
    mapOf(
      "start_date" to startDate,
      "end_date" to endDate,
      "sort_by" to sortBy.uppercase(),
      "num_of_pins" to count.coerceIn(1, 50).toString()
    )
  )

  fun normalizeFacebookPage(raw: JSONObject): JSONObject = JSONObject()
    .put("id", raw.optString("id"))
    .put("name", raw.optString("name"))
    .put("username", raw.optString("username"))
    .put("about", raw.optString("about"))
    .put("category", raw.optString("category"))
    .put("followers", nullableNumber(raw, "followers_count", "fan_count"))
    .put("link", raw.optString("link"))
    .put("picture", raw.optJSONObject("picture")?.optJSONObject("data")?.optString("url"))

  fun normalizeFacebookPost(raw: JSONObject): JSONObject = JSONObject()
    .put("id", raw.optString("id"))
    .put("title", raw.optString("story").ifBlank { raw.optString("message").lineSequence().firstOrNull().orEmpty() })
    .put("text", raw.optString("message"))
    .put("publishedAt", raw.optString("created_time"))
    .put("url", raw.optString("permalink_url"))
    .put("reactions", summaryCount(raw.optJSONObject("reactions")))
    .put("comments", summaryCount(raw.optJSONObject("comments")))
    .put("shares", raw.optJSONObject("shares")?.optInt("count")?.takeIf { raw.optJSONObject("shares")?.has("count") == true })
    .put("viralScore", JSONObject.NULL)

  fun normalizePinterestPin(raw: JSONObject): JSONObject = JSONObject()
    .put("id", raw.optString("id"))
    .put("title", raw.optString("title"))
    .put("text", raw.optString("description"))
    .put("publishedAt", raw.optString("created_at"))
    .put("url", raw.optString("link"))
    .put("imageUrl", raw.optJSONObject("media")?.optJSONObject("images")?.optJSONObject("orig")?.optString("url"))
    .put("saves", raw.optInt("save_count").takeIf { raw.has("save_count") })
    .put("comments", raw.optInt("comment_count").takeIf { raw.has("comment_count") })
    .put("viralScore", JSONObject.NULL)

  fun normalizePinterestAnalytics(raw: JSONObject): JSONArray {
    val output = JSONArray()
    val pins = raw.optJSONArray("pins") ?: return output
    for (index in 0 until pins.length()) {
      val item = pins.optJSONObject(index) ?: continue
      output.put(JSONObject()
        .put("id", item.optString("pin_id"))
        .put("metrics", item.optJSONObject("metrics") ?: JSONObject())
        .put("dataStatus", item.optJSONObject("data_status") ?: JSONObject()))
    }
    return output
  }

  private fun summaryCount(node: JSONObject?): Int? = node?.optJSONObject("summary")?.optInt("total_count")?.takeIf { node.optJSONObject("summary")?.has("total_count") == true }

  private fun nullableNumber(raw: JSONObject, primary: String, fallback: String): Any = when {
    raw.has(primary) -> raw.optInt(primary)
    raw.has(fallback) -> raw.optInt(fallback)
    else -> JSONObject.NULL
  }

  private fun urlEncode(value: String): String = URLEncoder.encode(value, StandardCharsets.UTF_8.toString())
}

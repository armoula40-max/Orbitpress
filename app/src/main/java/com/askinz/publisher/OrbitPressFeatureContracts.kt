package com.askinz.publisher

import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import kotlin.math.max

/** Pure contracts used by the editor and native bridge; existing publishing flows remain unchanged. */
object OrbitPressSeoContract {
  data class ArticleLink(val url: String, val title: String, val category: String = "", val keywords: List<String> = emptyList())

  fun selectInternalLinks(article: JSONObject, published: List<ArticleLink>, limit: Int = 4): JSONArray {
    val query = listOf(article.optString("title"), article.optString("keyword"), article.optString("categoryName"), article.optString("contentType"))
      .joinToString(" ").lowercase(Locale.ROOT)
    return JSONArray(published.asSequence()
      .filter { it.url.startsWith("https://") && it.title.isNotBlank() }
      .map { link ->
        val haystack = listOf(link.title, link.category, link.keywords.joinToString(" ")).joinToString(" ").lowercase(Locale.ROOT)
        val score = query.split(Regex("\\W+")).filter { it.length > 2 && haystack.contains(it) }.distinct().size
        link to score
      }
      .filter { it.second > 0 }
      .sortedByDescending { it.second }
      .take(limit.coerceIn(1, 8))
      .map { (link, _) -> JSONObject().put("url", link.url).put("title", link.title).put("anchor", naturalAnchor(link.title)) }
      .toList())
  }

  fun insertInternalLinks(html: String, links: JSONArray): String {
    var output = html
    for (i in 0 until links.length()) {
      val item = links.optJSONObject(i) ?: continue
      val url = item.optString("url").trim()
      val anchor = item.optString("anchor").trim()
      if (!url.startsWith("https://") || anchor.isBlank() || output.contains("href=\"$url\"")) continue
      val replacement = "<a href=\"${escape(url)}\">${escape(anchor)}</a>"
      val paragraph = Regex("<p>([\\s\\S]*?)</p>", RegexOption.IGNORE_CASE)
      val match = paragraph.find(output) ?: continue
      output = output.replaceRange(match.range, "<p>${match.groupValues[1]} $replacement</p>")
    }
    return output
  }

  fun addKeywordHeading(html: String, keyword: String): String {
    val clean = keyword.trim().replace(Regex("\\s+"), " ")
    if (clean.isBlank() || Regex("<h[23][^>]*>[^<]*${Regex.escape(clean)}", RegexOption.IGNORE_CASE).containsMatchIn(html)) return html
    val firstH2 = Regex("<h2\\b[^>]*>", RegexOption.IGNORE_CASE).find(html)
    return if (firstH2 != null) html.replaceRange(firstH2.range.first, firstH2.range.first, "<h2>${escape(clean)}</h2>") else "<h2>${escape(clean)}</h2>$html"
  }

  private fun naturalAnchor(title: String) = title.trim().removeSuffix(".").take(90).ifBlank { "Read the related guide" }
  private fun escape(value: String) = value.replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;").replace(">", "&gt;")
}

data class OrbitPressImageSlot(val id: String, val role: String, val section: String, val prompt: String, val altText: String, val required: Boolean = true)
object OrbitPressImageSlotContract {
  val defaultRoles = listOf("Hero", "Introduction", "Main section", "Preparation", "Tips", "Conclusion")
  fun plan(draft: JSONObject, count: Int): List<OrbitPressImageSlot> {
    val title = draft.optString("title").trim(); val keyword = draft.optString("keyword").trim(); val niche = draft.optString("categoryName").trim()
    return defaultRoles.take(max(1, count).coerceAtMost(8)).mapIndexed { index, role ->
      val section = if (index == 0) "opening" else role.lowercase(Locale.ROOT)
      OrbitPressImageSlot("slot-${index + 1}", role, section, "${role} image for $title; keyword: $keyword; niche: $niche; no text, no logos", "$title — $section")
    }
  }
  fun insert(html: String, slots: List<OrbitPressImageSlot>, images: Map<String, String>): String {
    var output = html
    slots.forEach { slot ->
      val url = images[slot.id] ?: return@forEach
      val figure = "<figure class=\"orbitpress-image-slot\" data-image-slot=\"${slot.id}\"><img src=\"${escape(url)}\" alt=\"${escape(slot.altText)}\" loading=\"lazy\" /></figure>"
      output = if (slot.role == "Hero") figure + output else output.replaceFirst(Regex("</p>", RegexOption.IGNORE_CASE), "</p>$figure")
    }
    return output
  }
  private fun escape(value: String) = value.replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;").replace(">", "&gt;")
}

object PinterestTrendsContract {
  fun normalize(raw: JSONArray, query: String): JSONArray {
    val seen = linkedSetOf<String>(); val result = JSONArray()
    for (i in 0 until raw.length()) {
      val item = raw.optJSONObject(i) ?: JSONObject().put("keyword", raw.optString(i))
      val word = item.optString("keyword", item.optString("term")).trim().replace(Regex("\\s+"), " ")
      if (word.isBlank() || !seen.add(word.lowercase(Locale.ROOT))) continue
      result.put(JSONObject().put("keyword", word).put("query", query.trim()).put("trend", item.optString("trend", "unknown")).put("period", item.optString("period", "30d")).put("related", item.optJSONArray("related") ?: JSONArray()).put("score", item.optDouble("score", 0.0)))
    }
    return result
  }
}

data class PinFluxAccount(val id: String, val name: String, val boardId: String, val groupId: String, val enabled: Boolean = true)
data class PinFluxGroup(val id: String, val name: String, val parentId: String?, val delaySeconds: Int = 30, val maxOperations: Int = 20, val enabled: Boolean = true)
object PinFluxContract {
  fun validate(groups: List<PinFluxGroup>, accounts: List<PinFluxAccount>, sourcePinId: String): List<String> {
    val errors = mutableListOf<String>()
    if (sourcePinId.isBlank()) errors += "A source Pin is required."
    if (groups.isEmpty()) errors += "Create at least one PinFlux group."
    if (groups.any { it.delaySeconds < 5 }) errors += "Group delay must be at least 5 seconds."
    if (groups.any { it.maxOperations !in 1..500 }) errors += "Group operation limit must be between 1 and 500."
    if (accounts.any { it.boardId.isBlank() || it.groupId.isBlank() }) errors += "Every account needs a board and group."
    val ids = groups.map { it.id }.toSet()
    if (groups.any { it.parentId != null && it.parentId !in ids }) errors += "Every parent group must exist."
    return errors
  }
  fun operationKey(pinId: String, accountId: String, boardId: String) = "$pinId:$accountId:$boardId"
  fun nextOperations(sourcePinId: String, groups: List<PinFluxGroup>, accounts: List<PinFluxAccount>, completed: Set<String>): JSONArray {
    val result = JSONArray(); val ordered = groups.sortedBy { depth(it, groups) }
    ordered.forEach { group -> accounts.filter { it.groupId == group.id && it.enabled }.take(group.maxOperations).forEach { account ->
      val key = operationKey(sourcePinId, account.id, account.boardId)
      if (!completed.contains(key)) result.put(JSONObject().put("key", key).put("pinId", sourcePinId).put("accountId", account.id).put("boardId", account.boardId).put("groupId", group.id).put("delaySeconds", group.delaySeconds).put("action", "save_or_repin"))
    }}
    return result
  }
  private fun depth(group: PinFluxGroup, groups: List<PinFluxGroup>): Int = group.parentId?.let { parent -> 1 + (groups.find { it.id == parent }?.let { depth(it, groups) } ?: 0) } ?: 0
}

object OrbitPressRetryPolicy {
  fun shouldRetry(status: Int) = status == 429 || status in 500..504
  fun delayMillis(attempt: Int, retryAfterSeconds: Long? = null): Long = retryAfterSeconds?.coerceIn(1, 300)?.times(1000) ?: (1000L * (1L shl attempt.coerceIn(0, 5))).coerceAtMost(30_000)
}

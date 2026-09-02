package com.askinz.publisher

import org.json.JSONArray
import org.json.JSONObject

object PostStatusContract {
  val allowed = setOf("draft", "pending", "publish")
  fun normalize(value: String?): String = value?.trim()?.lowercase().orEmpty().ifBlank { "draft" }.also { require(it in allowed) { "Unsupported WordPress status." } }
}

object SeoContract {
  fun canonical(value: String): String = value.trim().take(2048).also { require(it.isBlank() || it.startsWith("https://")) { "Canonical URL must use HTTPS." } }
  fun text(value: String, limit: Int): String = value.trim().take(limit)
}

object KeywordContract {
  fun normalize(value: String): String = value.trim().replace(Regex("\\s+"), " ").lowercase()
  fun deduplicate(values: List<String>): List<String> = values.map(::normalize).filter { it.length in 2..160 }.distinct()
}

object PreflightContract {
  data class Result(val errors: List<String>, val warnings: List<String>) { val valid get() = errors.isEmpty() }
  fun check(draft: JSONObject, images: JSONObject, categoryId: Int): Result {
    val errors = mutableListOf<String>(); val warnings = mutableListOf<String>()
    val title = draft.optString("title").trim(); val meta = draft.optString("metaDescription").trim(); val slug = draft.optString("slug").trim()
    if (title.isBlank()) errors += "Title is required" else if (title.length !in 20..70) warnings += "Title length is outside the recommended 20–70 characters"
    if (meta.isBlank()) errors += "Meta description is required" else if (meta.length > 160) errors += "Meta description exceeds 160 characters"
    if (slug.isBlank()) errors += "Slug is required"
    if (categoryId <= 0) errors += "An existing WordPress category is required"
    if (images.optString("featured").isBlank()) errors += "Featured image is required"
    if (images.optString("pinterest").isBlank()) errors += "Pinterest image is required"
    if (draft.optString("htmlContent").contains("application/ld+json").not() && draft.optString("schema").isBlank()) warnings += "Structured data could not be confirmed locally"
    if (draft.optString("contentType") == "recipe" && (draft.optJSONObject("recipe")?.optJSONArray("instructions")?.length() ?: 0) !in 4..9) errors += "Recipe instructions must contain 4–9 steps"
    return Result(errors, warnings)
  }
}

object ScheduleContract {
  fun validate(delayMinutes: Long, operation: String): Long { require(operation in setOf("generate", "publish")) { "Unsupported scheduled operation." }; require(delayMinutes in 1..43200) { "Schedule delay must be between 1 minute and 30 days." }; return delayMinutes }
}

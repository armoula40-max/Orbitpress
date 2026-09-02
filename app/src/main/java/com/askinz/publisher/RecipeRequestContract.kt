package com.askinz.publisher

object RecipeRequestContract {
  fun requestedCount(keyword: String): Int {
    val numbered = Regex("(?i)\\b(\\d{1,2})\\s+(?:[a-z-]+\\s+){0,3}recipes?\\b")
      .find(keyword)?.groupValues?.getOrNull(1)?.toIntOrNull()
    if (numbered != null) return numbered.coerceIn(2, 12)
    return if (Regex("(?i)recipe\\s+roundup|multiple\\s+recipes|recipes\\s+and\\s+recipes").containsMatchIn(keyword)) 2 else 0
  }
}

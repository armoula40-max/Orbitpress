package com.askinz.publisher

import org.json.JSONArray
import org.json.JSONObject

/** Validates long-form roundup output without changing the frozen publishing serializer. */
object LongFormCompletenessContract {
  data class Result(val valid: Boolean, val reason: String = "")

  fun validate(draft: JSONObject, expectedCount: Int): Result {
    if (expectedCount <= 0) return Result(true)
    val recipes = draft.optJSONArray("recipes") ?: return Result(false, "recipes[] is missing")
    if (recipes.length() != expectedCount) return Result(false, "Expected $expectedCount recipes but received ${recipes.length()}")
    val bodyWords = draft.optString("htmlContent").replace(Regex("<[^>]+>"), " ")
      .trim().split(Regex("\\s+")).count { it.isNotBlank() }
    val minimumWords = maxOf(220, expectedCount * 55)
    if (bodyWords < minimumWords) return Result(false, "The roundup body is too short ($bodyWords words; minimum $minimumWords)")
    for (index in 0 until recipes.length()) {
      val recipe = recipes.optJSONObject(index) ?: return Result(false, "Recipe ${index + 1} is not an object")
      if (!recipe.optBoolean("isRecipe")) return Result(false, "Recipe ${index + 1} is not marked as a recipe")
      if (recipe.optString("title").trim().isBlank()) return Result(false, "Recipe ${index + 1} has no title")
      if (recipe.optString("description").trim().isBlank()) return Result(false, "Recipe ${index + 1} has no description")
      if (recipe.optString("prepTime").trim().isBlank() || recipe.optString("cookTime").trim().isBlank()) return Result(false, "Recipe ${index + 1} is missing timing")
      if (recipe.optString("recipeYield").trim().isBlank()) return Result(false, "Recipe ${index + 1} is missing yield")
      if ((recipe.optJSONArray("ingredients") ?: JSONArray()).length() < 4) return Result(false, "Recipe ${index + 1} needs at least 4 ingredients")
      if ((recipe.optJSONArray("instructions") ?: JSONArray()).length() !in 4..9) return Result(false, "Recipe ${index + 1} needs 4 to 9 instructions")
      if ((recipe.optJSONArray("notes") ?: JSONArray()).length() == 0) return Result(false, "Recipe ${index + 1} needs at least one note")
    }
    return Result(true)
  }
}

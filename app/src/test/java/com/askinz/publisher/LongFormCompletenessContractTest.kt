package com.askinz.publisher

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LongFormCompletenessContractTest {
  private fun recipe(index: Int): JSONObject = JSONObject()
    .put("title", "Fall Recipe $index")
    .put("isRecipe", true)
    .put("description", "A complete seasonal recipe description.")
    .put("prepTime", "PT15M")
    .put("cookTime", "PT30M")
    .put("totalTime", "PT45M")
    .put("recipeYield", "4 servings")
    .put("ingredients", JSONArray(listOf("1 cup flour", "2 apples", "1 tsp cinnamon", "2 tbsp sugar")))
    .put("instructions", JSONArray(listOf(
      JSONObject().put("name", "Prepare").put("text", "Prepare the ingredients carefully."),
      JSONObject().put("name", "Mix").put("text", "Mix everything in a large bowl."),
      JSONObject().put("name", "Cook").put("text", "Cook until tender and fragrant."),
      JSONObject().put("name", "Serve").put("text", "Cool briefly and serve warm."))))
    .put("notes", JSONArray(listOf("Adjust sweetness to taste.")))

  private fun draft(count: Int, bodyWords: Int = 300): JSONObject {
    val words = (1..bodyWords).joinToString(" ") { "detail$it" }
    val recipes = JSONArray()
    for (index in 1..count) recipes.put(recipe(index))
    return JSONObject().put("htmlContent", words).put("recipes", recipes)
  }

  @Test fun acceptsCompleteFiveRecipeRoundup() {
    assertTrue(LongFormCompletenessContract.validate(draft(5), 5).valid)
  }

  @Test fun rejectsShortRoundupEvenWhenRecipeCountMatches() {
    val result = LongFormCompletenessContract.validate(draft(5, 100), 5)
    assertFalse(result.valid)
    assertTrue(result.reason.contains("too short"))
  }

  @Test fun rejectsRecipeWithoutDetailedInstructions() {
    val value = draft(2)
    value.getJSONArray("recipes").getJSONObject(0).put("instructions", JSONArray())
    val result = LongFormCompletenessContract.validate(value, 2)
    assertFalse(result.valid)
    assertTrue(result.reason.contains("Recipe 1"))
  }
}

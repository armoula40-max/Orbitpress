package com.askinz.publisher

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DraftContractTest {
  private fun completeRecipe(): JSONObject = JSONObject()
    .put("title", "Easy Lemon Pasta")
    .put("metaDescription", "A bright, simple lemon pasta for weeknight dinners.")
    .put("slug", "Easy Lemon Pasta")
    .put("contentType", "recipe")
    .put("categoryName", "Pasta")
    .put("outline", JSONArray().put(JSONObject().put("heading", "Why it works").put("keyPoints", JSONArray().put("Fast")).put("extra", "ignored")))
    .put("htmlContent", "<p>Opening paragraph.</p><h2>Ingredients</h2><p>Use fresh lemon.</p><h2>Method</h2><p>Finish gently.</p><script>alert('no')</script>")
    .put("internalLinks", JSONArray().put(JSONObject().put("anchor", "quick pasta dinners").put("reason", "Related reader path")))
    .put("recipe", JSONObject()
      .put("isRecipe", true).put("description", "Creamy lemon pasta.")
      .put("prepTime", "PT10M").put("cookTime", "PT15M").put("totalTime", "PT25M")
      .put("recipeYield", "4 servings").put("cuisine", "Italian-inspired")
      .put("ingredients", JSONArray().put("pasta").put("lemon").put("parmesan"))
      .put("instructions", JSONArray()
        .put(JSONObject().put("name", "Boil").put("text", "Boil the pasta."))
        .put(JSONObject().put("name", "Zest").put("text", "Zest the lemon."))
        .put(JSONObject().put("name", "Toss").put("text", "Toss with sauce."))
        .put(JSONObject().put("name", "Serve").put("text", "Serve warm.")))
      .put("notes", JSONArray().put("Reserve pasta water.")))
    .put("pinterest", JSONObject().put("title", "Easy Lemon Pasta").put("altText", "Bowl of creamy lemon pasta"))

  @Test fun normalizesRecipeAndAddsTheDeterministicRecipeCard() {
    val draft = DraftContract.normalize(completeRecipe(), "Dinner")

    assertEquals("easy-lemon-pasta", draft.getString("slug"))
    assertEquals("Dinner", draft.getString("categoryName"))
    assertEquals("recipe", draft.getString("contentType"))
    assertTrue(draft.getString("htmlContent").contains("askinz-recipe-card"))
    assertTrue(draft.getString("htmlContent").contains("askinz-table-of-contents"))
    assertTrue(draft.getString("htmlContent").contains("data-askinz-toc=\"true\""))
    assertTrue(draft.getString("htmlContent").contains("Jump to recipe"))
    assertTrue(draft.getString("htmlContent").contains("Print recipe"))
    assertTrue(draft.getString("htmlContent").contains("data-askinz-serving-scale=\"true\""))
    assertTrue(draft.getString("htmlContent").contains("Copy shopping list"))
    assertTrue(draft.getString("htmlContent").contains("Cooking mode"))
    assertTrue(draft.getString("htmlContent").contains("data-askinz-top=\"true\""))
    assertFalse(draft.getString("htmlContent").contains("<h2 data-askinz-section=\"askinz-section-1\">Ingredients</h2>"))
    assertFalse(draft.getString("htmlContent").contains("<script"))
    assertEquals("Easy Lemon Pasta", draft.getJSONObject("pinterest").getString("title"))
  }

  @Test fun createsArticleStructuredDataWithoutFabricatedRating() {
    val draft = DraftContract.normalize(completeRecipe(), "Dinner")
    val schema = DraftContract.buildSchema(draft, "https://askinz.com/easy-lemon-pasta/", listOf("https://askinz.com/featured.jpg", "https://askinz.com/pin.jpg"))

    assertEquals("Recipe", schema.getString("@type"))
    assertEquals(3, schema.getJSONArray("recipeIngredient").length())
    assertEquals(2, schema.getJSONArray("image").length())
    assertFalse(schema.has("aggregateRating"))
    assertEquals("https://askinz.com/easy-lemon-pasta/", schema.getJSONObject("mainEntityOfPage").getString("@id"))
  }

  @Test fun articleContractForcesEmptyRecipeFields() {
    val raw = completeRecipe().put("contentType", "article").put("recipe", JSONObject().put("isRecipe", true))
    val draft = DraftContract.normalize(raw, "Guides")

    assertEquals("article", draft.getString("contentType"))
    assertFalse(draft.getJSONObject("recipe").getBoolean("isRecipe"))
    assertEquals(0, draft.getJSONObject("recipe").getJSONArray("ingredients").length())
    assertEquals("Article", DraftContract.buildSchema(draft, null, emptyList()).getString("@type"))
  }

  @Test fun removesExecutableMarkupAndJavascriptUrlsBeforeTemplateGeneration() {
    val safe = DraftContract.sanitizeHtml("<p onclick=\"alert(1)\">Safe text</p><script>alert('bad')</script><a href=\"javascript:alert(1)\">Link</a>")
    assertEquals("<p>Safe text</p><a>Link</a>", safe)
  }

  @Test fun expandsEveryRecipeInARequestedRoundupWithCompleteDetails() {
    fun roundupRecipe(title: String, ingredient: String): JSONObject = JSONObject()
      .put("title", title).put("isRecipe", true).put("description", "A complete $title recipe.")
      .put("prepTime", "PT15M").put("cookTime", "PT30M").put("totalTime", "PT45M")
      .put("recipeYield", "6 servings").put("cuisine", "Seasonal")
      .put("ingredients", JSONArray().put("2 cups $ingredient").put("1 tablespoon olive oil"))
      .put("instructions", JSONArray()
        .put(JSONObject().put("name", "Prepare").put("text", "Prepare the ingredients carefully."))
        .put(JSONObject().put("name", "Season").put("text", "Season evenly before cooking."))
        .put(JSONObject().put("name", "Cook").put("text", "Cook until tender and fragrant."))
        .put(JSONObject().put("name", "Finish").put("text", "Finish, rest, and serve warm.")))
      .put("notes", JSONArray().put("Store leftovers covered and chilled."))

    val raw = JSONObject()
      .put("title", "5 Fall Recipes for Cozy Weeknights")
      .put("metaDescription", "Five complete fall recipes with ingredients and detailed instructions.")
      .put("slug", "5 fall recipes cozy weeknights")
      .put("contentType", "article")
      .put("categoryName", "Fall Recipes")
      .put("htmlContent", "<p>These recipes include complete ingredients and detailed preparation guidance.</p><h2>Recipe collection</h2><p>Choose a dish and follow its full card below.</p>")
      .put("recipes", JSONArray().put(roundupRecipe("Roasted Pumpkin Soup", "pumpkin")).put(roundupRecipe("Apple Chicken Skillet", "apples")))
      .put("recipe", JSONObject().put("isRecipe", false))
      .put("pinterest", JSONObject().put("title", "5 Fall Recipes").put("altText", "Five cozy fall recipes"))

    val draft = DraftContract.normalize(raw, "Fall Recipes")
    val html = draft.getString("htmlContent")
    val schema = DraftContract.buildSchema(draft, null, emptyList())

    assertEquals("article", draft.getString("contentType"))
    assertEquals(2, draft.getJSONArray("recipes").length())
    assertTrue(html.contains("Roasted Pumpkin Soup"))
    assertTrue(html.contains("Apple Chicken Skillet"))
    assertEquals(2, html.split("class=\"askinz-recipe-card\"").size - 1)
    assertEquals("Article", schema.getString("@type"))
    assertEquals(2, schema.getJSONArray("hasPart").length())
    assertFalse(schema.has("aggregateRating"))
  }
}

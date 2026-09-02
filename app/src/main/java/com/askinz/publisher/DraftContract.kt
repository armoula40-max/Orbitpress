package com.askinz.publisher

import org.json.JSONArray
import org.json.JSONObject

/**
 * Normalizes the article-provider response into the same local draft contract used by
 * the desktop application. The app never treats model output as publish-ready until
 * this validation succeeds.
 */
object DraftContract {
  private val blockedBlocks = Regex("<(script|style|iframe|object|embed)[^>]*>[\\s\\S]*?</\\1>", RegexOption.IGNORE_CASE)
  private val eventHandlers = Regex("\\son\\w+\\s*=\\s*(?:\"[^\"]*\"|'[^']*'|[^\\s>]+)", RegexOption.IGNORE_CASE)
  private val javascriptUrls = Regex("\\s(?:href|src)\\s*=\\s*(?:\"\\s*javascript:[^\"]*\"|'\\s*javascript:[^']*'|javascript:[^\\s>]+)", RegexOption.IGNORE_CASE)

  fun cleanSlug(value: String): String = value.lowercase()
    .replace(Regex("[^a-z0-9]+"), "-")
    .trim('-')
    .take(220)

  fun sanitizeHtml(value: String): String = value
    .replace(blockedBlocks, "")
    .replace(eventHandlers, "")
    .replace(javascriptUrls, "")
    .trim()

  fun removeDuplicateRecipeSections(htmlContent: String): String {
    val recipeSection = Regex("<h2\\b[^>]*>\\s*(?:ingredients|instructions|directions|method|how\\s+to\\s+(?:make|cook)[^<]*)\\s*</h2>[\\s\\S]*?(?=<h2\\b|$)", RegexOption.IGNORE_CASE)
    val cardStart = Regex("<section\\b[^>]*data-recipe-card\\s*=\\s*[\"']true[\"']", RegexOption.IGNORE_CASE).find(htmlContent)?.range?.first ?: -1
    val beforeCard = if (cardStart >= 0) htmlContent.substring(0, cardStart) else htmlContent
    val cardAndAfter = if (cardStart >= 0) htmlContent.substring(cardStart) else ""
    return (beforeCard.replace(recipeSection, "").replace(Regex("\\n{3,}"), "\n\n").trim() + cardAndAfter).trim()
  }

  fun normalize(raw: JSONObject, selectedCategory: String): JSONObject {
    val title = raw.optString("title").trim().take(255)
    require(title.isNotBlank()) { "The article model returned no title." }
    val requestedContentType = if (raw.optString("contentType") == "recipe") "recipe" else "article"
    val articleHtml = sanitizeHtml(raw.optString("htmlContent"))
    require(articleHtml.isNotBlank()) { "The article model returned no article body." }
    val slug = cleanSlug(raw.optString("slug", title))
    require(slug.isNotBlank()) { "The article model returned an invalid slug." }

    val recipes = normalizeRecipes(raw.optJSONArray("recipes"))
    val contentType = if (recipes.length() > 0) "article" else requestedContentType
    val recipe = normalizeRecipe(raw.optJSONObject("recipe"), contentType)
    if (contentType == "recipe") {
      require(recipe.getBoolean("isRecipe")) { "Recipe content was missing recipe details." }
      require(recipe.getJSONArray("ingredients").length() > 0 && recipe.getJSONArray("instructions").length() in 4..9) {
        "Recipe content was incomplete."
      }
    }
    for (index in 0 until recipes.length()) {
      val item = recipes.getJSONObject(index)
      require(item.getBoolean("isRecipe")) { "Recipe ${index + 1} was missing recipe details." }
      require(item.getJSONArray("ingredients").length() > 0 && item.getJSONArray("instructions").length() in 4..9) {
        "Recipe ${index + 1} was incomplete."
      }
    }
    val pinterestSource = raw.optJSONObject("pinterest")
    val pinterestTitle = pinterestSource?.optString("title")?.trim()?.take(100).orEmpty().ifBlank { title.take(100) }
    val pinterestAltText = pinterestSource?.optString("altText")?.trim()?.take(320).orEmpty().ifBlank { title.take(320) }
    val category = selectedCategory.trim().ifBlank { raw.optString("categoryName").trim() }.take(120)

    val draft = JSONObject()
      .put("id", "draft-${System.currentTimeMillis()}-${(1000..9999).random()}")
      .put("title", title)
      .put("metaDescription", raw.optString("metaDescription").trim().take(160))
      .put("slug", slug)
      .put("contentType", contentType)
      .put("categoryName", category)
      .put("outline", normalizeOutline(raw.optJSONArray("outline")))
      .put("internalLinks", normalizeInternalLinks(raw.optJSONArray("internalLinks")))
      .put("recipe", recipe)
      .put("recipes", recipes)
      .put("pinterest", JSONObject().put("title", pinterestTitle).put("altText", pinterestAltText))
      .put("pinterestTitle", pinterestTitle)
      .put("pinterestAltText", pinterestAltText)
      .put("generationStatus", "ready")
      .put("createdAt", System.currentTimeMillis())
    draft.put("htmlContent", renderArticle(articleHtml, title, contentType == "recipe", recipe, recipes))
    draft.put("schema", buildSchema(draft, null, emptyList()))
    return draft
  }

  fun buildSchema(draft: JSONObject, canonicalUrl: String?, imageUrls: List<String>): JSONObject {
    val result = JSONObject()
      .put("@context", "https://schema.org")
      .put("name", draft.optString("title"))
      .put("description", draft.optString("metaDescription"))
      .put("author", JSONObject().put("@type", "Organization").put("name", "Askinz").put("url", "https://askinz.com"))
    if (!canonicalUrl.isNullOrBlank()) result.put("mainEntityOfPage", JSONObject().put("@type", "WebPage").put("@id", canonicalUrl))
    if (imageUrls.isNotEmpty()) result.put("image", JSONArray(imageUrls))
    val recipes = draft.optJSONArray("recipes")
    if (recipes != null && recipes.length() > 0) {
      val parts = JSONArray()
      for (index in 0 until recipes.length()) parts.put(recipeSchema(recipes.getJSONObject(index)))
      return result.put("@type", "Article").put("headline", draft.optString("title")).put("hasPart", parts)
    }
    if (draft.optString("contentType") == "recipe") {
      val recipe = draft.optJSONObject("recipe") ?: JSONObject()
      result.put("@type", "Recipe")
        .put("recipeCategory", draft.optString("categoryName"))
        .put("recipeCuisine", recipe.optString("cuisine"))
        .put("prepTime", recipe.optString("prepTime"))
        .put("cookTime", recipe.optString("cookTime"))
        .put("totalTime", recipe.optString("totalTime"))
        .put("recipeYield", recipe.optString("recipeYield"))
        .put("recipeIngredient", recipe.optJSONArray("ingredients") ?: JSONArray())
      val steps = JSONArray()
      val instructions = recipe.optJSONArray("instructions") ?: JSONArray()
      for (index in 0 until instructions.length()) {
        val step = instructions.optJSONObject(index) ?: continue
        steps.put(JSONObject().put("@type", "HowToStep").put("name", step.optString("name")).put("text", step.optString("text")))
      }
      result.put("recipeInstructions", steps)
    } else {
      result.put("@type", "Article").put("headline", draft.optString("title"))
    }
    return result
  }

  private fun recipeSchema(recipe: JSONObject): JSONObject {
    val result = JSONObject().put("@type", "Recipe").put("name", recipe.optString("title")).put("description", recipe.optString("description"))
      .put("prepTime", recipe.optString("prepTime")).put("cookTime", recipe.optString("cookTime"))
      .put("totalTime", recipe.optString("totalTime")).put("recipeYield", recipe.optString("recipeYield"))
      .put("recipeCuisine", recipe.optString("cuisine")).put("recipeIngredient", recipe.optJSONArray("ingredients") ?: JSONArray())
    val steps = JSONArray()
    val instructions = recipe.optJSONArray("instructions") ?: JSONArray()
    for (index in 0 until instructions.length()) {
      val step = instructions.optJSONObject(index) ?: continue
      steps.put(JSONObject().put("@type", "HowToStep").put("name", step.optString("name")).put("text", step.optString("text")))
    }
    return result.put("recipeInstructions", steps)
  }

  private fun normalizeRecipes(source: JSONArray?): JSONArray {
    val result = JSONArray()
    for (index in 0 until minOf(source?.length() ?: 0, 12)) {
      val sourceRecipe = source?.optJSONObject(index) ?: continue
      val recipe = normalizeRecipe(sourceRecipe, "recipe")
      recipe.put("title", sourceRecipe.optString("title").trim().take(255).ifBlank { "Recipe ${index + 1}" })
      result.put(recipe)
    }
    return result
  }

  private fun normalizeOutline(source: JSONArray?): JSONArray {
    val result = JSONArray()
    for (index in 0 until minOf(source?.length() ?: 0, 6)) {
      val item = source?.optJSONObject(index) ?: continue
      val heading = item.optString("heading").trim().take(160)
      if (heading.isBlank()) continue
      val points = JSONArray()
      val sourcePoints = item.optJSONArray("keyPoints") ?: JSONArray()
      for (pointIndex in 0 until minOf(sourcePoints.length(), 6)) {
        val point = sourcePoints.optString(pointIndex).trim().take(240)
        if (point.isNotBlank()) points.put(point)
      }
      result.put(JSONObject().put("heading", heading).put("keyPoints", points))
    }
    return result
  }

  private fun normalizeInternalLinks(source: JSONArray?): JSONArray {
    val result = JSONArray()
    for (index in 0 until minOf(source?.length() ?: 0, 4)) {
      val item = source?.optJSONObject(index) ?: continue
      val anchor = item.optString("anchor").trim().take(160)
      val reason = item.optString("reason").trim().take(260)
      if (anchor.isNotBlank() && reason.isNotBlank()) result.put(JSONObject().put("anchor", anchor).put("reason", reason))
    }
    return result
  }

  private fun normalizeRecipe(source: JSONObject?, contentType: String): JSONObject {
    if (contentType != "recipe") return emptyRecipe()
    val recipe = source ?: JSONObject()
    val ingredients = stringArray(recipe.optJSONArray("ingredients"), 30, 260)
    val notes = stringArray(recipe.optJSONArray("notes"), 3, 360)
    val instructions = JSONArray()
    val sourceInstructions = recipe.optJSONArray("instructions") ?: JSONArray()
    for (index in 0 until minOf(sourceInstructions.length(), 9)) {
      val item = sourceInstructions.optJSONObject(index) ?: continue
      val name = item.optString("name").trim().take(120).ifBlank { "Step ${index + 1}" }
      val text = item.optString("text").trim().take(700)
      if (text.isNotBlank()) instructions.put(JSONObject().put("name", name).put("text", text))
    }
    return JSONObject()
      .put("isRecipe", recipe.optBoolean("isRecipe", true))
      .put("description", recipe.optString("description").trim().take(500))
      .put("prepTime", recipe.optString("prepTime").trim().take(30))
      .put("cookTime", recipe.optString("cookTime").trim().take(30))
      .put("totalTime", recipe.optString("totalTime").trim().take(30))
      .put("recipeYield", recipe.optString("recipeYield").trim().take(80))
      .put("cuisine", recipe.optString("cuisine").trim().take(80))
      .put("ingredients", ingredients)
      .put("instructions", instructions)
      .put("notes", notes)
  }

  private fun emptyRecipe(): JSONObject = JSONObject()
    .put("isRecipe", false).put("description", "").put("prepTime", "").put("cookTime", "")
    .put("totalTime", "").put("recipeYield", "").put("cuisine", "")
    .put("ingredients", JSONArray()).put("instructions", JSONArray()).put("notes", JSONArray())

  private fun stringArray(source: JSONArray?, limit: Int, itemLimit: Int): JSONArray {
    val result = JSONArray()
    for (index in 0 until minOf(source?.length() ?: 0, limit)) {
      val value = source?.optString(index)?.trim()?.take(itemLimit).orEmpty()
      if (value.isNotBlank()) result.put(value)
    }
    return result
  }

  private fun renderArticle(rawHtml: String, title: String, isRecipe: Boolean, recipe: JSONObject, recipes: JSONArray = JSONArray()): String {
    val headings = mutableListOf<Pair<String, String>>()
    var sequence = 0
    val content = Regex("<h2\\b([^>]*)>([\\s\\S]*?)</h2>", RegexOption.IGNORE_CASE).replace(rawHtml) { match ->
      val label = match.groupValues[2].replace(Regex("<[^>]+>"), "").replace(Regex("\\s+"), " ").trim()
      if (label.isBlank() || match.groupValues[1].contains("data-askinz-section", true)) match.value else {
        sequence += 1
        val id = "askinz-section-$sequence"
        headings.add(id to label)
        "<h2${match.groupValues[1]} data-askinz-section=\"$id\" style=\"scroll-margin-top:1.25rem;\">${match.groupValues[2]}</h2>"
      }
    }
    val toc = if (headings.size >= 2) {
      val items = headings.joinToString("") { "<li style=\"margin:.45rem 0;\"><a href=\"#${escape(it.first)}\" data-askinz-toc=\"true\" onclick=\"document.querySelector('[data-askinz-section=${escape(it.first)}]')?.scrollIntoView({behavior:'smooth',block:'start'});return false;\" style=\"color:#315d37;text-decoration:none;font-weight:700;\">${escape(it.second)}</a></li>" }
      "<details class=\"askinz-table-of-contents\" data-askinz-toc-card=\"true\" open style=\"margin:1rem 0 1.5rem;padding:1rem 1.15rem;border:1px solid #d8e5cc;border-radius:14px;background:#f1f7ec;\"><summary style=\"cursor:pointer;color:#315d37;font-weight:800;letter-spacing:.01em;\">On this page <span style=\"color:#8a5a3c;\">↓</span></summary><ol style=\"margin:.75rem 0 0;padding-left:1.2rem;line-height:1.55;\">$items</ol></details>"
    } else ""
    val recipeCards = if (recipes.length() > 0) renderRecipeCards(recipes, title) else if (isRecipe) renderRecipeCard(recipe, title) else ""
    val shortcuts = if (isRecipe || recipes.length() > 0) "<nav class=\"askinz-recipe-actions\" aria-label=\"Recipe shortcuts\" style=\"display:flex;flex-wrap:wrap;gap:.7rem;margin:1.5rem 0 1rem;\"><a href=\"#askinz-recipe-1\" data-askinz-jump=\"true\" onclick=\"document.querySelector('.askinz-recipe-card')?.scrollIntoView({behavior:'smooth',block:'start'});return false;\" style=\"display:inline-block;padding:.72rem 1rem;border-radius:999px;background:#315d37;color:#fff;text-decoration:none;font-weight:700;\">Jump to recipe</a><a href=\"#askinz-recipe\" data-askinz-print=\"true\" onclick=\"window.print();return false;\" style=\"display:inline-block;padding:.72rem 1rem;border:1px solid #d9cdbb;border-radius:999px;color:#5c4531;text-decoration:none;font-weight:700;\">Print recipe</a></nav>" else ""
    val cleanedContent = if (isRecipe || recipes.length() > 0) removeDuplicateRecipeSections(content) else content
    return "<article class=\"askinz-article\" style=\"max-width:760px;margin:0 auto;color:#35342f;line-height:1.8;font-size:1.06rem;\">$shortcuts<div class=\"askinz-article-body\">$toc$cleanedContent$recipeCards</div></article>"
  }

  private fun renderRecipeCards(recipes: JSONArray, fallbackTitle: String): String = (0 until recipes.length()).joinToString("") { index ->
    val recipe = recipes.getJSONObject(index)
    renderRecipeCard(recipe, recipe.optString("title").ifBlank { "$fallbackTitle — Recipe ${index + 1}" }, index, recipes.length())
  }

  private fun renderRecipeCard(recipe: JSONObject, title: String, index: Int = 0, total: Int = 1): String {
    val details = listOf(
      "Prep" to recipe.optString("prepTime"), "Cook" to recipe.optString("cookTime"),
      "Total" to recipe.optString("totalTime"), "Yield" to recipe.optString("recipeYield")
    ).filter { it.second.isNotBlank() }.joinToString("") { "<span><strong>${it.first}:</strong> ${escape(it.second)}</span>" }
    val ingredients = recipe.optJSONArray("ingredients") ?: JSONArray()
    val ingredientItems = (0 until ingredients.length()).joinToString("") { "<li>${escape(ingredients.optString(it))}</li>" }
    val instructions = recipe.optJSONArray("instructions") ?: JSONArray()
    val instructionItems = (0 until instructions.length()).joinToString("") {
      val item = instructions.optJSONObject(it) ?: JSONObject()
      "<li><strong>${escape(item.optString("name", "Step ${it + 1}"))}.</strong> ${escape(item.optString("text"))}</li>"
    }
    val notes = recipe.optJSONArray("notes") ?: JSONArray()
    val noteItems = (0 until notes.length()).joinToString("") { "<li>${escape(notes.optString(it))}</li>" }
    val notesBlock = if (noteItems.isBlank()) "" else "<details class=\"askinz-recipe-notes\" style=\"margin-top:1.5rem;padding:1rem 1.15rem;border-radius:12px;background:#f1f5e9;\"><summary style=\"cursor:pointer;color:#315d37;font-weight:700;\">Recipe notes &amp; helpful tips</summary><ul style=\"margin:.8rem 0 0;padding-left:1.2rem;line-height:1.75;\">$noteItems</ul></details>"
    val tools = "<section class=\"askinz-recipe-tools\" data-askinz-recipe-tools=\"true\" aria-label=\"Recipe tools\" style=\"margin:1rem 0 1.75rem;padding:1rem 1.1rem;border:1px solid #d8e5cc;border-radius:14px;background:#f5f8f1;\"><p style=\"margin:0 0 .7rem;color:#315d37;font-size:.78rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;\">Make it yours</p><div style=\"display:flex;flex-wrap:wrap;gap:.65rem;align-items:center;\"><label style=\"display:inline-flex;gap:.4rem;align-items:center;font-weight:700;color:#334332;\">Scale <select data-askinz-serving-scale=\"true\" aria-label=\"Scale ingredient quantities\" style=\"padding:.5rem;border:1px solid #cbd7c5;border-radius:8px;background:#fff;\"><option value=\"0.5\">Half batch</option><option value=\"1\" selected>Original</option><option value=\"2\">Double</option><option value=\"3\">Triple</option></select></label><button type=\"button\" data-askinz-shopping-list=\"true\" style=\"padding:.55rem .75rem;border:1px solid #315d37;border-radius:999px;background:#fff;color:#315d37;font:inherit;font-weight:800;cursor:pointer;\">Copy shopping list</button><button type=\"button\" data-askinz-cooking-mode=\"true\" style=\"padding:.55rem .75rem;border:0;border-radius:999px;background:#315d37;color:#fff;font:inherit;font-weight:800;cursor:pointer;\">Cooking mode</button></div><p data-askinz-tools-status=\"true\" aria-live=\"polite\" style=\"margin:.65rem 0 0;color:#5e6358;font-size:.9rem;\"></p></section>"
    val backToTop = "<p class=\"askinz-recipe-back-to-top\" style=\"margin:1.75rem 0 0;text-align:right;\"><a href=\"#top\" data-askinz-top=\"true\" onclick=\"window.scrollTo({top:0,behavior:'smooth'});return false;\" style=\"color:#315d37;font-weight:700;text-decoration:none;\">Back to top ↑</a></p>"
    return "<section id=\"askinz-recipe-${index + 1}\" class=\"askinz-recipe-card\" data-recipe-card=\"true\" style=\"margin:2.5rem 0;padding:2rem;border:1px solid #eadfcd;border-radius:18px;background:#fffaf2;box-shadow:0 12px 30px rgba(64,46,25,.06);color:#2f3529;\"><header style=\"padding-bottom:1.25rem;border-bottom:1px solid #eadfcd;\"><p style=\"margin:0 0 .45rem;color:#8a5a3c;font-size:.75rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;\">Askinz kitchen</p><h2 style=\"margin:0;color:#263c2d;font-family:Georgia,serif;font-size:2rem;line-height:1.12;\">${escape(title)}</h2><p style=\"margin:1rem 0 0;line-height:1.7;color:#5e6358;\">${escape(recipe.optString("description"))}</p><div class=\"askinz-recipe-times\" style=\"display:flex;flex-wrap:wrap;gap:.6rem 1rem;margin-top:1rem;font-size:.9rem;color:#49633d;\">$details</div></header><section style=\"margin-top:1.5rem;\"><h3 style=\"margin:0 0 .75rem;color:#263c2d;font-family:Georgia,serif;font-size:1.35rem;\">Ingredients</h3><ul style=\"margin:0;padding-left:1.25rem;line-height:1.85;\">$ingredientItems</ul></section><section style=\"margin-top:1.5rem;\"><h3 style=\"margin:0 0 .75rem;color:#263c2d;font-family:Georgia,serif;font-size:1.35rem;\">Instructions</h3><ol style=\"margin:0;padding-left:1.35rem;line-height:1.8;\">$instructionItems</ol></section>$notesBlock$tools$backToTop</section>"
  }

  private fun escape(value: String): String = value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;")
}

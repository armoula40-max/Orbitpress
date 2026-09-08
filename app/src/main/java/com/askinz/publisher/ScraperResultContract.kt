package com.askinz.publisher

import org.json.JSONArray
import org.json.JSONObject

/**
 * Pure rules for reading a VPS scraper response and explaining an empty result.
 *
 * The scraper (orbitpress-scraper-api) answers `/api/facebook/scrape` with `posts` plus a rich set of
 * diagnostics: `loginFormCount`, `articleCount`, `globalPostLinks`, `persistentCookieNames`, `sessionCookieCount`,
 * `finalUrl`, `title`, `bodyPreview`, `mobileFallbackUsed`, `warning`. Older versions only carried `warning`.
 * This contract accepts both, and turns them + what OrbitPress itself knows (cookies sent, session cookie present)
 * into ONE actionable sentence, in priority order:
 * filtered_out > login_wall > no_session > session_rejected > page_unavailable > server_message > empty.
 */
object ScraperResultContract {
  data class Diagnosis(val code: String, val message: String)

  private val collectionKeys = listOf("posts", "pins", "items", "results", "data")
  private val messageKeys = listOf("error", "message", "warning", "reason", "detail", "status", "note")
  private val genericWarnings = listOf("no accessible public article elements")

  fun rows(response: JSONObject, platform: String): JSONArray {
    val preferred = if (platform == "facebook") listOf("posts") else listOf("pins")
    (preferred + collectionKeys).forEach { key ->
      val value = response.opt(key) ?: return@forEach
      when (value) {
        is JSONArray -> return value
        is JSONObject -> (value.optJSONArray("items") ?: value.optJSONArray(key))?.let { return it }
      }
    }
    return JSONArray()
  }

  /** Best human-readable hint the server included, or an empty string. */
  fun serverMessage(response: JSONObject): String {
    messageKeys.forEach { key ->
      val value = response.opt(key)
      val text = when (value) {
        null, JSONObject.NULL -> ""
        is String -> value.trim()
        is JSONObject -> value.optString("message").ifBlank { value.optString("error") }.trim()
        is Boolean, is Number -> ""
        else -> value.toString().trim()
      }
      if (text.isNotBlank() && !text.equals("ok", ignoreCase = true) && !text.equals("success", ignoreCase = true)) return text.take(400)
    }
    return ""
  }

  /** The scraper's stock "nothing found" warning carries no information of its own. */
  fun isGenericWarning(message: String): Boolean = genericWarnings.any { message.lowercase().contains(it) }

  fun looksLikeLoginWall(response: JSONObject, finalUrl: String, serverMessage: String): Boolean {
    if (response.optBoolean("loginRequired") || response.optBoolean("blocked") || response.optBoolean("checkpoint")) return true
    if (response.optInt("loginFormCount", 0) > 0) return true
    val url = finalUrl.lowercase()
    if (url.contains("/login") || url.contains("checkpoint") || url.contains("/recover") || url.contains("login.php")) return true
    val title = response.optString("title").lowercase()
    if (title.startsWith("log in") || title.startsWith("log into") || title.contains("login") || title.contains("checkpoint")) return true
    val text = serverMessage.lowercase()
    if (isGenericWarning(text)) return false
    return listOf("log in", "login", "sign in", "checkpoint", "not logged", "session expired", "blocked", "rate limit", "captcha", "temporarily").any { text.contains(it) }
  }

  /** Did the VPS browser actually hold a Facebook/Pinterest login while scraping (its own view, not ours)? */
  fun serverSawSession(response: JSONObject, platform: String): Boolean? {
    if (response.opt("sessionAccepted") is Boolean) return response.getBoolean("sessionAccepted")
    val names = response.optJSONArray("persistentCookieNames") ?: return null
    val set = (0 until names.length()).map { names.optString(it) }.toSet()
    return if (platform == "facebook") "c_user" in set && "xs" in set else set.any { it.contains("pinterest_sess") }
  }

  fun pageUnavailable(response: JSONObject): Boolean {
    val text = (response.optString("bodyPreview") + " " + response.optString("title")).lowercase()
    return listOf("this content isn't available", "this page isn't available", "content not found", "page not found", "isn't available right now", "no longer available", "may have been removed").any { text.contains(it) }
  }

  /**
   * Why did the scan return nothing usable?
   * @param rawCount rows the server returned before OrbitPress filtered them.
   * @param acceptedCount rows that survived the original-post filter.
   */
  fun diagnoseEmpty(
    platform: String,
    response: JSONObject,
    rawCount: Int,
    acceptedCount: Int,
    cookiesSent: Int,
    sessionCookiePresent: Boolean,
    finalUrl: String,
  ): Diagnosis? {
    if (acceptedCount > 0) return null
    val serverMessage = serverMessage(response)
    val informativeMessage = serverMessage.takeUnless { isGenericWarning(it) }.orEmpty()
    val label = if (platform == "facebook") "Facebook" else "Pinterest"
    val effectiveFinalUrl = finalUrl.ifBlank { response.optString("finalUrl") }
    val serverSession = serverSawSession(response, platform)
    val articleCount = response.optInt("articleCount", -1)
    val postLinks = response.optJSONArray("globalPostLinks")?.length() ?: -1
    val serverOutcome = outcomeCode(response.optString("outcome"))
    return when {
      rawCount > 0 -> Diagnosis(
        "filtered_out",
        "The VPS returned $rawCount item(s) but none was an original $label post link (comments, reels previews or off-site links were rejected). Use the Page's main URL, e.g. https://www.facebook.com/<page>/.",
      )
      // orbitpress-scraper-api >= 1.2 classifies the empty page itself and writes an actionable warning: trust it.
      serverOutcome != null && informativeMessage.isNotBlank() -> Diagnosis(serverOutcome, informativeMessage)
      looksLikeLoginWall(response, effectiveFinalUrl, serverMessage) -> Diagnosis(
        "login_wall",
        "$label showed a login wall to the VPS browser${if (informativeMessage.isNotBlank()) " ($informativeMessage)" else ""}. " +
          "Open the Page once with 'Visible scan', log in inside that window, then run the VPS scan again so your session cookies are forwarded.",
      )
      !sessionCookiePresent -> Diagnosis(
        "no_session",
        "No $label session cookies were available to send ($cookiesSent cookie(s) sent), so the VPS browsed as a logged-out visitor and $label hid the posts. " +
          "Open the Page with 'Visible scan', log in inside that window, then retry the VPS scan.",
      )
      serverSession == false -> Diagnosis(
        "session_rejected",
        "Your $label session cookies were sent ($cookiesSent) but the VPS browser ended up logged out — $label rejected or expired them. " +
          "Log out and back in via 'Visible scan' and retry; if it repeats, the VPS needs its own persistent login (see SESSION_LOGIN_AR.md in orbitpress-scraper-api).",
      )
      pageUnavailable(response) -> Diagnosis(
        "page_unavailable",
        "$label told the VPS that this content isn't available (private, region-restricted, age-gated or removed). Check the URL in a normal browser while logged in.",
      )
      informativeMessage.isNotBlank() -> Diagnosis("server_message", "The VPS scraper returned no posts: $informativeMessage")
      else -> Diagnosis(
        "empty",
        "The VPS browser was logged in (session accepted) yet found no post elements" +
          (if (articleCount >= 0 || postLinks >= 0) " (articles=${articleCount.coerceAtLeast(0)}, post links=${postLinks.coerceAtLeast(0)})" else "") +
          ". $label changed its markup or the Page has no public posts: update the Playwright selectors in orbitpress-scraper-api or try the Page's /posts URL.",
      )
    }
  }

  /** Maps the scraper's own `outcome` state (API 1.2+) onto OrbitPress diagnosis codes; null when unknown. */
  fun outcomeCode(outcome: String): String? = when (outcome.trim().lowercase()) {
    "login_wall", "checkpoint" -> "login_wall"
    "session_rejected" -> "session_rejected"
    "unavailable" -> "page_unavailable"
    "unsupported_browser" -> "server_message"
    "no_posts" -> "empty"
    else -> null
  }

  /** Compact, safe-to-display technical summary for the Activity log. */
  fun technicalSummary(response: JSONObject, cookiesSent: Int): String {
    val parts = mutableListOf<String>()
    parts += "cookiesSent=$cookiesSent"
    response.optString("outcome").takeIf { it.isNotBlank() }?.let { parts += "outcome=$it" }
    if (response.opt("sessionAccepted") is Boolean) parts += "serverLoggedIn=${response.getBoolean("sessionAccepted")}"
    if (response.has("sessionCookieCount")) parts += "serverGotCookies=${response.optInt("sessionCookieCount")}"
    response.optJSONArray("persistentCookieNames")?.let { names -> parts += "serverCookies=" + (0 until names.length()).joinToString("+") { names.optString(it) }.ifBlank { "none" } }
    if (response.has("loginFormCount")) parts += "loginForms=${response.optInt("loginFormCount")}"
    if (response.has("articleCount")) parts += "articles=${response.optInt("articleCount")}"
    response.optJSONArray("globalPostLinks")?.let { parts += "postLinks=${it.length()}" }
    if (response.optBoolean("mobileFallbackUsed")) parts += "mobileFallback"
    if (response.has("postsTabClicked")) parts += "postsTab=${response.optBoolean("postsTabClicked")}"
    response.optString("finalUrl").takeIf { it.isNotBlank() }?.let { parts += "finalUrl=${it.take(120)}" }
    response.optString("title").takeIf { it.isNotBlank() }?.let { parts += "title=${it.take(80)}" }
    return parts.joinToString(" · ")
  }
}

package com.askinz.publisher

import org.json.JSONArray
import org.json.JSONObject

/**
 * Pure rules for reading a VPS scraper response and explaining an empty result.
 *
 * The scraper is a separate project, so the exact JSON shape varies between versions. This contract accepts the
 * common shapes (`posts` / `pins` / `items` / `data`, each either an array or `{ items: [...] }`) and turns the
 * server's own hints (`error`, `message`, `warning`, `reason`, `status`, `blocked`, `loginRequired`) plus a few
 * signals from the request (cookies sent, session cookie present) into one actionable sentence for the UI.
 */
object ScraperResultContract {
  data class Diagnosis(val code: String, val message: String)

  private val collectionKeys = listOf("posts", "pins", "items", "results", "data")
  private val messageKeys = listOf("error", "message", "warning", "reason", "detail", "status", "note")

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
      if (text.isNotBlank() && !text.equals("ok", ignoreCase = true) && !text.equals("success", ignoreCase = true)) return text.take(240)
    }
    return ""
  }

  fun looksLikeLoginWall(response: JSONObject, finalUrl: String, serverMessage: String): Boolean {
    if (response.optBoolean("loginRequired") || response.optBoolean("blocked") || response.optBoolean("checkpoint")) return true
    val url = finalUrl.lowercase()
    if (url.contains("/login") || url.contains("checkpoint") || url.contains("/recover") || url.contains("login.php")) return true
    val text = serverMessage.lowercase()
    return listOf("log in", "login", "sign in", "checkpoint", "not logged", "session", "cookie", "blocked", "rate limit", "captcha", "temporarily").any { text.contains(it) }
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
    val label = if (platform == "facebook") "Facebook" else "Pinterest"
    return when {
      rawCount > 0 -> Diagnosis(
        "filtered_out",
        "The VPS returned $rawCount item(s) but none was an original $label post link (comments, reels previews or off-site links were rejected). Use the Page's main URL, e.g. https://www.facebook.com/<page>/.",
      )
      looksLikeLoginWall(response, finalUrl, serverMessage) -> Diagnosis(
        "login_wall",
        "$label showed a login wall to the VPS${if (serverMessage.isNotBlank()) " ($serverMessage)" else ""}. Open the source once with 'Visible scan', log in there, then run the VPS scan again so your session cookies are forwarded.",
      )
      !sessionCookiePresent -> Diagnosis(
        "no_session",
        "No $label session cookies were available to send (${cookiesSent} cookie(s) sent). $label hides Page posts from logged-out visitors. Open the Page with 'Visible scan', log in inside that window, then retry the VPS scan.",
      )
      serverMessage.isNotBlank() -> Diagnosis("server_message", "The VPS scraper returned no posts: $serverMessage")
      else -> Diagnosis(
        "empty",
        "The VPS scraper returned no posts even though a session was sent. Check on the server that the Playwright selectors still match $label's current layout and that the Page URL is public.",
      )
    }
  }
}

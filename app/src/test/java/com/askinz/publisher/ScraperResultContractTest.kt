package com.askinz.publisher

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ScraperResultContractTest {
  @Test
  fun readsRowsFromTheUsualShapes() {
    assertEquals(2, ScraperResultContract.rows(JSONObject().put("posts", JSONArray().put(JSONObject()).put(JSONObject())), "facebook").length())
    assertEquals(1, ScraperResultContract.rows(JSONObject().put("pins", JSONArray().put(JSONObject())), "pinterest").length())
    assertEquals(3, ScraperResultContract.rows(JSONObject().put("items", JSONArray().put(1).put(2).put(3)), "facebook").length())
    assertEquals(1, ScraperResultContract.rows(JSONObject().put("data", JSONObject().put("items", JSONArray().put(JSONObject()))), "facebook").length())
    assertEquals(0, ScraperResultContract.rows(JSONObject().put("ok", true), "facebook").length())
  }

  @Test
  fun extractsTheServerHintButIgnoresOkMarkers() {
    assertEquals("", ScraperResultContract.serverMessage(JSONObject().put("status", "ok").put("message", "success")))
    assertEquals("Login required", ScraperResultContract.serverMessage(JSONObject().put("error", "Login required")))
    assertEquals("nested", ScraperResultContract.serverMessage(JSONObject().put("error", JSONObject().put("message", "nested"))))
    assertEquals("", ScraperResultContract.serverMessage(JSONObject().put("error", JSONObject.NULL).put("blocked", true)))
  }

  @Test
  fun detectsLoginWallsFromFlagsUrlsAndMessages() {
    assertTrue(ScraperResultContract.looksLikeLoginWall(JSONObject().put("loginRequired", true), "", ""))
    assertTrue(ScraperResultContract.looksLikeLoginWall(JSONObject(), "https://www.facebook.com/login.php?next=x", ""))
    assertTrue(ScraperResultContract.looksLikeLoginWall(JSONObject(), "https://www.facebook.com/checkpoint/", ""))
    assertTrue(ScraperResultContract.looksLikeLoginWall(JSONObject(), "", "You must log in to continue"))
    assertFalse(ScraperResultContract.looksLikeLoginWall(JSONObject(), "https://www.facebook.com/somepage/", ""))
  }

  @Test
  fun explainsEmptyResultsInPriorityOrder() {
    assertNull(ScraperResultContract.diagnoseEmpty("facebook", JSONObject(), rawCount = 5, acceptedCount = 2, cookiesSent = 9, sessionCookiePresent = true, finalUrl = ""))

    val filtered = ScraperResultContract.diagnoseEmpty("facebook", JSONObject(), rawCount = 4, acceptedCount = 0, cookiesSent = 0, sessionCookiePresent = false, finalUrl = "")!!
    assertEquals("filtered_out", filtered.code)
    assertTrue(filtered.message.contains("returned 4 item(s)"))

    val wall = ScraperResultContract.diagnoseEmpty("facebook", JSONObject(), rawCount = 0, acceptedCount = 0, cookiesSent = 9, sessionCookiePresent = true, finalUrl = "https://www.facebook.com/login.php")!!
    assertEquals("login_wall", wall.code)
    assertTrue(wall.message.contains("Visible scan"))

    val noSession = ScraperResultContract.diagnoseEmpty("facebook", JSONObject(), rawCount = 0, acceptedCount = 0, cookiesSent = 0, sessionCookiePresent = false, finalUrl = "https://www.facebook.com/somepage/")!!
    assertEquals("no_session", noSession.code)
    assertTrue(noSession.message.contains("0 cookie(s) sent"))

    val serverMessage = ScraperResultContract.diagnoseEmpty("pinterest", JSONObject().put("error", "selector timeout"), rawCount = 0, acceptedCount = 0, cookiesSent = 3, sessionCookiePresent = true, finalUrl = "")!!
    assertEquals("server_message", serverMessage.code)
    assertTrue(serverMessage.message.endsWith("selector timeout"))

    val empty = ScraperResultContract.diagnoseEmpty("pinterest", JSONObject(), rawCount = 0, acceptedCount = 0, cookiesSent = 3, sessionCookiePresent = true, finalUrl = "")!!
    assertEquals("empty", empty.code)
  }

  @Test
  fun understandsTheScraperApiDiagnostics() {
    val genericWarning = "Facebook returned no accessible public article elements. The endpoint uses only your VPS Playwright browser and does not use an external scraper."
    assertTrue(ScraperResultContract.isGenericWarning(genericWarning))
    assertFalse(ScraperResultContract.looksLikeLoginWall(JSONObject().put("warning", genericWarning), "https://www.facebook.com/somepage/posts/", genericWarning))

    // Server browsed logged-out: login form on the page.
    val wall = JSONObject().put("warning", genericWarning).put("loginFormCount", 2).put("finalUrl", "https://www.facebook.com/somepage/posts/").put("title", "Log into Facebook")
    assertEquals("login_wall", ScraperResultContract.diagnoseEmpty("facebook", wall, 0, 0, cookiesSent = 12, sessionCookiePresent = true, finalUrl = "")!!.code)

    // We sent a session but the server-side browser ended up without c_user/xs.
    val rejected = JSONObject().put("warning", genericWarning).put("loginFormCount", 0).put("persistentCookieNames", JSONArray().put("fr")).put("finalUrl", "https://www.facebook.com/somepage/posts/")
    assertEquals(false, ScraperResultContract.serverSawSession(rejected, "facebook"))
    val rejectedDiagnosis = ScraperResultContract.diagnoseEmpty("facebook", rejected, 0, 0, cookiesSent = 12, sessionCookiePresent = true, finalUrl = "")!!
    assertEquals("session_rejected", rejectedDiagnosis.code)
    assertTrue(rejectedDiagnosis.message.contains("12"))

    // Logged in on the server, page says content unavailable.
    val unavailable = JSONObject().put("persistentCookieNames", JSONArray().put("c_user").put("xs")).put("bodyPreview", "This content isn't available right now").put("loginFormCount", 0)
    assertEquals("page_unavailable", ScraperResultContract.diagnoseEmpty("facebook", unavailable, 0, 0, cookiesSent = 12, sessionCookiePresent = true, finalUrl = "")!!.code)

    // Logged in on the server, nothing matched: generic warning must NOT be echoed, counts are included.
    val selectors = JSONObject().put("warning", genericWarning).put("persistentCookieNames", JSONArray().put("c_user").put("xs")).put("loginFormCount", 0).put("articleCount", 0).put("globalPostLinks", JSONArray())
    val selectorDiagnosis = ScraperResultContract.diagnoseEmpty("facebook", selectors, 0, 0, cookiesSent = 12, sessionCookiePresent = true, finalUrl = "")!!
    assertEquals("empty", selectorDiagnosis.code)
    assertTrue(selectorDiagnosis.message.contains("articles=0, post links=0"))
    assertFalse(selectorDiagnosis.message.contains("accessible public article"))

    val summary = ScraperResultContract.technicalSummary(selectors.put("sessionCookieCount", 12).put("finalUrl", "https://www.facebook.com/x/posts/"), 12)
    assertTrue(summary.contains("cookiesSent=12"))
    assertTrue(summary.contains("serverCookies=c_user+xs"))
    assertTrue(summary.contains("postLinks=0"))
  }

  @Test
  fun prefersTheScraperApi12OutcomeFields() {
    // orbitpress-scraper-api 1.2 states sessionAccepted/outcome/loginRequired explicitly and writes a specific warning.
    val wall = JSONObject().put("outcome", "login_wall").put("loginRequired", true).put("sessionAccepted", false).put("loginFormCount", 2)
      .put("warning", "Facebook showed a login wall and the VPS browser had no login session (0 cookie(s) received, none of them c_user+xs). Log in once through the OrbitPress Visible scan so the session is forwarded, or import a session on the VPS.")
    assertEquals(false, ScraperResultContract.serverSawSession(wall, "facebook"))
    val diagnosis = ScraperResultContract.diagnoseEmpty("facebook", wall, 0, 0, cookiesSent = 0, sessionCookiePresent = false, finalUrl = "")!!
    assertEquals("login_wall", diagnosis.code)
    assertTrue(diagnosis.message.contains("0 cookie(s) received"))

    val loggedIn = JSONObject().put("outcome", "no_posts").put("sessionAccepted", true).put("persistentCookieNames", JSONArray().put("fr"))
      .put("warning", "Facebook rendered 0 article element(s) and 0 post link(s) for the VPS browser (logged in), but none matched a public post.")
    assertEquals(true, ScraperResultContract.serverSawSession(loggedIn, "facebook"))
    val noPosts = ScraperResultContract.diagnoseEmpty("facebook", loggedIn, 0, 0, cookiesSent = 12, sessionCookiePresent = true, finalUrl = "")!!
    assertEquals("empty", noPosts.code)
    assertTrue(noPosts.message.contains("logged in"))
    assertTrue(ScraperResultContract.technicalSummary(loggedIn, 12).contains("outcome=no_posts"))

    val rejected = JSONObject().put("outcome", "session_rejected").put("loginRequired", true).put("sessionAccepted", false).put("loginFormCount", 1)
      .put("warning", "Facebook rejected the forwarded login session: the login form is still shown and the c_user/xs cookies were dropped. Log out and back in through the Visible scan, then retry.")
    assertEquals("session_rejected", ScraperResultContract.diagnoseEmpty("facebook", rejected, 0, 0, cookiesSent = 12, sessionCookiePresent = true, finalUrl = "")!!.code)
    assertEquals("page_unavailable", ScraperResultContract.outcomeCode("unavailable"))
    assertEquals(null, ScraperResultContract.outcomeCode("something-new"))
  }
}

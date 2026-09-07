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
}

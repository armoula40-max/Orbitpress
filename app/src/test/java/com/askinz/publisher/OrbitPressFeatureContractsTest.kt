package com.askinz.publisher

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OrbitPressFeatureContractsTest {
  @Test fun internalLinksOnlyUseHttpsAndAreInsertedInHtml() {
    val article = JSONObject().put("title", "Small Kitchen Storage").put("categoryName", "home")
    val links = OrbitPressSeoContract.selectInternalLinks(article, listOf(
      OrbitPressSeoContract.ArticleLink("https://example.com/storage", "Kitchen Storage Ideas", "home", listOf("kitchen")),
      OrbitPressSeoContract.ArticleLink("http://unsafe.example", "Kitchen", "home")
    ))
    assertEquals(1, links.length())
    val html = OrbitPressSeoContract.insertInternalLinks("<p>Make the most of a small kitchen.</p>", links)
    assertTrue(html.contains("href=\"https://example.com/storage\""))
  }

  @Test fun imageSlotsAreBoundToSectionsAndAltText() {
    val slots = OrbitPressImageSlotContract.plan(JSONObject().put("title", "Lemon pasta").put("keyword", "easy lemon pasta"), 4)
    assertEquals(4, slots.size)
    assertEquals("Hero", slots.first().role)
    val html = OrbitPressImageSlotContract.insert("<p>Intro</p>", slots, mapOf("slot-1" to "https://cdn.example/hero.jpg"))
    assertTrue(html.contains("data-image-slot=\"slot-1\""))
    assertTrue(html.contains("alt=\"Lemon pasta — opening\""))
  }

  @Test fun trendsAreDeduplicatedAndNormalized() {
    val result = PinterestTrendsContract.normalize(JSONArray().put(JSONObject().put("keyword", "Kitchen Ideas").put("trend", "rising")).put(JSONObject().put("term", "kitchen ideas")), "kitchen")
    assertEquals(1, result.length())
    assertEquals("Kitchen Ideas", result.getJSONObject(0).getString("keyword"))
  }

  @Test fun pinfluxOrdersGroupsAndSkipsCompletedOperations() {
    val groups = listOf(PinFluxGroup("g1", "Group 1", null), PinFluxGroup("g2", "Group 2", "g1"))
    val accounts = listOf(PinFluxAccount("a1", "A1", "b1", "g1"), PinFluxAccount("a2", "A2", "b2", "g2"))
    val operations = PinFluxContract.nextOperations("pin-1", groups, accounts, setOf(PinFluxContract.operationKey("pin-1", "a1", "b1")))
    assertEquals(1, operations.length())
    assertEquals("g2", operations.getJSONObject(0).getString("groupId"))
    assertEquals("save_or_repin", operations.getJSONObject(0).getString("action"))
  }

  @Test fun retryPolicyHandlesRateLimitAndServerErrors() {
    assertTrue(OrbitPressRetryPolicy.shouldRetry(429))
    assertTrue(OrbitPressRetryPolicy.shouldRetry(503))
    assertTrue(!OrbitPressRetryPolicy.shouldRetry(400))
    assertEquals(5000, OrbitPressRetryPolicy.delayMillis(2, null))
  }
}

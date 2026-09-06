package com.askinz.publisher

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class MoreContractsTest {
  @Test
  fun publishingRequiresHttpsAndNormalizesTrailingSlash() {
    assertEquals("https://api.example.com", PublishingContracts.requireHttpsUrl("https://api.example.com/", "Article API URL"))
    assertThrows(IllegalArgumentException::class.java) {
      PublishingContracts.requireHttpsUrl("http://api.example.com/v1", "Article API URL")
    }
    assertThrows(IllegalArgumentException::class.java) {
      PublishingContracts.requireHttpsUrl("ftp://api.example.com", "Article API URL")
    }
  }

  @Test
  fun validatesImageMagicBytes() {
    val png = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0)
    val jpeg = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte())
    val webp = byteArrayOf('R'.code.toByte(), 'I'.code.toByte(), 'F'.code.toByte(), 'F'.code.toByte(), 0, 0, 0, 0, 'W'.code.toByte(), 'E'.code.toByte(), 'B'.code.toByte(), 'P'.code.toByte())

    assertEquals("image/png", PublishingContracts.validatedImageMimeType("image/png", png))
    assertEquals("image/jpeg", PublishingContracts.validatedImageMimeType("image/jpeg", jpeg))
    assertEquals("image/webp", PublishingContracts.validatedImageMimeType("image/webp", webp))

    assertThrows(IllegalArgumentException::class.java) {
      PublishingContracts.validatedImageMimeType("image/png", jpeg)
    }
  }

  @Test
  fun normalizesPostStatusAndTags() {
    assertEquals("publish", PublishingContracts.normalizePostStatus("Publish"))
    assertEquals("draft", PublishingContracts.normalizePostStatus(null))
    assertThrows(IllegalArgumentException::class.java) { PublishingContracts.normalizePostStatus("private") }

    assertEquals(listOf("easy dinner", "weeknight"), PublishingContracts.normalizeTags(listOf(" Easy Dinner ", "easy dinner", "weeknight")))
  }

  @Test
  fun buildsHttpsSocialApiUrls() {
    assertTrue(SocialApiContracts.facebookGraphUrl("v23.0", "123456", mapOf("fields" to "id,name")).startsWith("https://graph.facebook.com/v23.0/123456?"))
    assertTrue(SocialApiContracts.pinterestUserAccount().startsWith("https://api.pinterest.com/v5/user_account"))
    assertTrue(SocialApiContracts.pinterestBoardPins("board-1", 50).contains("/boards/board-1/pins?"))
  }

  @Test
  fun normalizesAndRanksCategories() {
    val records = listOf(
      WordPressCategoryRecord(2, "Zucchini"),
      WordPressCategoryRecord(1, "Apples"),
      WordPressCategoryRecord(2, "Zucchini duplicate"),
      WordPressCategoryRecord(3, "Apples and pears"),
    )
    val normalized = CategorySyncContracts.normalize(records)
    assertEquals(3, normalized.size)
    assertEquals("Apples", normalized[0].name)
    assertEquals("Apples and pears", normalized[1].name)
    assertEquals("Zucchini", normalized[2].name)
  }

  @Test
  fun mediaContractEnforcesPinterestRatioAndHttpsLink() {
    MediaPublishingContract.requirePinterestRatio(1000, 1500)
    assertThrows(IllegalArgumentException::class.java) { MediaPublishingContract.requirePinterestRatio(1000, 1000) }
    assertTrue(MediaPublishingContract.normalizePinterestLink("https://example.com/pin").startsWith("https://"))
    assertThrows(IllegalArgumentException::class.java) { MediaPublishingContract.normalizePinterestLink("http://example.com/pin") }
    assertEquals(5, MediaPublishingContract.normalizePrompt("Quick prompt").take(64).length)
  }
}

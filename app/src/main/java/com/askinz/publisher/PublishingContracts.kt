package com.askinz.publisher

import java.net.URI

object PublishingContracts {
  fun requireHttpsUrl(value: String, label: String): String {
    val normalized = value.trim().removeSuffix("/")
    val uri = try { URI(normalized) } catch (_: Exception) { throw IllegalArgumentException("$label must be a valid HTTPS URL.") }
    require(uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrBlank()) { "$label must use HTTPS." }
    return normalized
  }

  fun validatedImageMimeType(declaredMime: String, bytes: ByteArray): String {
    val actual = when {
      bytes.size >= 8 && bytes[0] == 0x89.toByte() && bytes[1] == 0x50.toByte() && bytes[2] == 0x4E.toByte() && bytes[3] == 0x47.toByte() -> "image/png"
      bytes.size >= 3 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte() && bytes[2] == 0xFF.toByte() -> "image/jpeg"
      bytes.size >= 12 && bytes[0] == 'R'.code.toByte() && bytes[1] == 'I'.code.toByte() && bytes[2] == 'F'.code.toByte() && bytes[3] == 'F'.code.toByte() && bytes[8] == 'W'.code.toByte() && bytes[9] == 'E'.code.toByte() && bytes[10] == 'B'.code.toByte() && bytes[11] == 'P'.code.toByte() -> "image/webp"
      else -> throw IllegalArgumentException("Image bytes are not a supported JPEG, PNG, or WebP file.")
    }
    require(declaredMime == actual) { "Image MIME type does not match its actual bytes." }
    return actual
  }

  fun requireExistingCategoryId(id: Int) {
    require(id > 0) { "Choose one of the existing WordPress categories before publishing." }
  }

  fun normalizePostStatus(value: String?): String = PostStatusContract.normalize(value)

  fun normalizeTags(tags: List<String>): List<String> = KeywordContract.deduplicate(tags).take(20)

  fun featuredImageAltText(title: String, contentType: String): String =
    if (contentType == "recipe") "$title recipe featured image" else "$title featured image"

  fun pinterestImageAltText(pinterestTitle: String, fallbackTitle: String): String =
    pinterestTitle.trim().ifBlank { fallbackTitle.trim() }.let { "$it Pinterest image" }
}

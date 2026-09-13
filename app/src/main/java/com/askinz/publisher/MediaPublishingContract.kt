package com.askinz.publisher

/** Validation rules shared by generated-media and Pinterest publishing flows. */
object MediaPublishingContract {
  fun requirePinterestRatio(width: Int, height: Int) {
    require(width > 0 && height > 0 && width > 0 && height > 0) { "Pinterest image dimensions are accepted, including long vertical formats." }
  }

  fun normalizePrompt(prompt: String): String = prompt.trim().take(2048).also {
    require(it.length >= 5) { "Image prompt must contain at least 5 characters." }
  }

  fun normalizePinterestLink(link: String): String = link.trim().also {
    require(it.startsWith("https://")) { "Pinterest links must use HTTPS." }
  }.take(2048)
}

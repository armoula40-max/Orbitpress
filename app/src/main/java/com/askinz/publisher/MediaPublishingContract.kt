package com.askinz.publisher

/** Validation rules shared by generated-media and Pinterest publishing flows. */
object MediaPublishingContract {
  fun requirePinterestRatio(width: Int, height: Int) {
    require(width > 0 && height > 0 && width * 3 == height * 2) { "Pinterest image must use an exact 2:3 portrait ratio." }
  }

  fun normalizePrompt(prompt: String): String = prompt.trim().take(2048).also {
    require(it.length >= 5) { "Image prompt must contain at least 5 characters." }
  }

  fun normalizePinterestLink(link: String): String = link.trim().also {
    require(it.startsWith("https://")) { "Pinterest links must use HTTPS." }
  }.take(2048)
}

package com.askinz.publisher

/** UI access policy mirrored by the WebView Settings entry point. */
object SettingsAccessContract {
  fun requiresPin(enabled: Boolean, unlockedForSession: Boolean): Boolean = enabled && !unlockedForSession

  fun canEnter(enabled: Boolean, unlockedForSession: Boolean, pinMatches: Boolean): Boolean =
    !enabled || unlockedForSession || pinMatches
}

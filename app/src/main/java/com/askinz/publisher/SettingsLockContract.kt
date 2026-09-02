package com.askinz.publisher

import java.nio.charset.StandardCharsets
import java.security.MessageDigest

/** Optional local Settings protection. It never gates generation or publishing requests directly. */
object SettingsLockContract {
  const val MIN_PIN_LENGTH = 4
  const val MAX_PIN_LENGTH = 12

  fun normalizePin(value: String): String = value.trim()

  fun isValidPin(value: String): Boolean {
    val pin = normalizePin(value)
    return pin.length in MIN_PIN_LENGTH..MAX_PIN_LENGTH && pin.all(Char::isDigit)
  }

  fun hashPin(value: String): String {
    val pin = normalizePin(value)
    require(isValidPin(pin)) { "Settings PIN must contain 4 to 12 digits." }
    return MessageDigest.getInstance("SHA-256")
      .digest(pin.toByteArray(StandardCharsets.UTF_8))
      .joinToString("") { byte -> "%02x".format(byte) }
  }

  fun matches(value: String, storedHash: String): Boolean {
    if (!isValidPin(value) || storedHash.isBlank()) return false
    val actual = hashPin(value).toByteArray(StandardCharsets.UTF_8)
    val expected = storedHash.trim().lowercase().toByteArray(StandardCharsets.UTF_8)
    return MessageDigest.isEqual(actual, expected)
  }
}

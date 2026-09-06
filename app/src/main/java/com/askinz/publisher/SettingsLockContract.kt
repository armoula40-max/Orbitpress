package com.askinz.publisher

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/** Optional local Settings protection. It never gates generation or publishing requests directly. */
object SettingsLockContract {
  const val MIN_PIN_LENGTH = 4
  const val MAX_PIN_LENGTH = 12

  private const val PBKDF2_PREFIX = "pbkdf2-v1"
  private const val PBKDF2_ITERATIONS = 120_000
  private const val PBKDF2_SALT_BYTES = 16
  private const val PBKDF2_HASH_BITS = 256

  fun normalizePin(value: String): String = value.trim()

  fun isValidPin(value: String): Boolean {
    val pin = normalizePin(value)
    return pin.length in MIN_PIN_LENGTH..MAX_PIN_LENGTH && pin.all(Char::isDigit)
  }

  fun hashPin(value: String): String {
    val pin = normalizePin(value)
    require(isValidPin(pin)) { "Settings PIN must contain 4 to 12 digits." }
    val salt = ByteArray(PBKDF2_SALT_BYTES).also { SecureRandom().nextBytes(it) }
    val derived = derivePbkdf2(pin, salt)
    val encoder = Base64.getEncoder()
    return "$PBKDF2_PREFIX:$PBKDF2_ITERATIONS:${encoder.encodeToString(salt)}:${encoder.encodeToString(derived)}"
  }

  fun matches(value: String, storedHash: String): Boolean {
    if (!isValidPin(value) || storedHash.isBlank()) return false
    val stored = storedHash.trim()
    return when {
      stored.startsWith(PBKDF2_PREFIX) -> matchesPbkdf2(value, stored)
      stored.matches(Regex("[0-9a-fA-F]{64}")) -> matchesLegacySha256(value, stored)
      else -> false
    }
  }

  private fun derivePbkdf2(pin: String, salt: ByteArray): ByteArray {
    val spec = PBEKeySpec(pin.toCharArray(), salt, PBKDF2_ITERATIONS, PBKDF2_HASH_BITS)
    return try {
      SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
    } finally {
      spec.clearPassword()
    }
  }

  private fun matchesPbkdf2(pin: String, stored: String): Boolean {
    val parts = stored.split(":")
    if (parts.size != 4) return false
    val iterations = parts[1].toIntOrNull() ?: return false
    if (iterations < PBKDF2_ITERATIONS) return false
    val salt = runCatching { Base64.getDecoder().decode(parts[2]) }.getOrNull() ?: return false
    val expected = runCatching { Base64.getDecoder().decode(parts[3]) }.getOrNull() ?: return false
    val actual = try {
      val spec = PBEKeySpec(pin.toCharArray(), salt, iterations, PBKDF2_HASH_BITS)
      try { SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded } finally { spec.clearPassword() }
    } catch (_: Exception) {
      return false
    }
    return MessageDigest.isEqual(actual, expected)
  }

  private fun matchesLegacySha256(pin: String, stored: String): Boolean {
    val actual = sha256(pin)
    val expected = stored.lowercase()
    val actualBytes = actual.toByteArray(StandardCharsets.UTF_8)
    val expectedBytes = expected.toByteArray(StandardCharsets.UTF_8)
    return MessageDigest.isEqual(actualBytes, expectedBytes)
  }

  private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.toByteArray(StandardCharsets.UTF_8))
    .joinToString("") { byte -> "%02x".format(byte) }
}

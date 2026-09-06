package com.askinz.publisher

import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsLockContractsTest {
  @Test
  fun acceptsOnlyFourToTwelveDigits() {
    assertFalse(SettingsLockContract.isValidPin("123"))
    assertTrue(SettingsLockContract.isValidPin("1234"))
    assertTrue(SettingsLockContract.isValidPin("123456789012"))
    assertFalse(SettingsLockContract.isValidPin("1234567890123"))
    assertFalse(SettingsLockContract.isValidPin("12a4"))
  }

  @Test
  fun hashesPinWithoutStoringThePlainValue() {
    val hash = SettingsLockContract.hashPin("1234")
    assertTrue(hash.startsWith("pbkdf2-v1:"))
    assertFalse(hash.contains("1234"))
    assertTrue(SettingsLockContract.matches("1234", hash))
  }

  @Test
  fun supportsLegacySha256HashesForExistingInstallations() {
    val legacy = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4"
    assertTrue(SettingsLockContract.matches("1234", legacy))
    assertFalse(SettingsLockContract.matches("5678", legacy))
  }

  @Test
  fun accessPolicyBlocksWrongPinAndAllowsCorrectPin() {
    assertTrue(SettingsAccessContract.requiresPin(enabled = true, unlockedForSession = false))
    assertFalse(SettingsAccessContract.canEnter(enabled = true, unlockedForSession = false, pinMatches = false))
    assertTrue(SettingsAccessContract.canEnter(enabled = true, unlockedForSession = false, pinMatches = true))
    assertTrue(SettingsAccessContract.canEnter(enabled = true, unlockedForSession = true, pinMatches = false))
    assertTrue(SettingsAccessContract.canEnter(enabled = false, unlockedForSession = false, pinMatches = false))
  }

  @Test
  fun matchesOnlyTheConfiguredPin() {
    val storedHash = SettingsLockContract.hashPin("2468")
    assertTrue(SettingsLockContract.matches("2468", storedHash))
    assertFalse(SettingsLockContract.matches("8642", storedHash))
    assertFalse(SettingsLockContract.matches("", storedHash))
  }
}

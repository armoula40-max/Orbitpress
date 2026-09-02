package com.askinz.publisher

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ProviderCompatibilityContractTest {
  @Test fun normalizesHttpsProviderProfile() {
    val profile = ProviderCompatibilityContract.normalize("https://api.example.com/v1/", "  model-x ")
    assertEquals("https://api.example.com/v1", profile.baseUrl)
    assertEquals("model-x", profile.model)
    assertEquals(12000, profile.maxOutputTokens)
  }

  @Test(expected = IllegalArgumentException::class)
  fun rejectsInsecureProviderUrl() {
    ProviderCompatibilityContract.normalize("http://api.example.com/v1", "model-x")
  }

  @Test fun classifiesStructuredOutputFallback() {
    assertEquals(ProviderCompatibilityContract.StructuredMode.JSON_OBJECT_FALLBACK, ProviderCompatibilityContract.modeForError("response_format json_schema unsupported"))
    assertTrue(ProviderCompatibilityContract.diagnostic("response_format json_schema unsupported").contains("does not support JSON Schema"))
  }

  @Test fun classifiesTokenLimit() {
    assertEquals(ProviderCompatibilityContract.StructuredMode.PLAIN_JSON_REPAIR, ProviderCompatibilityContract.modeForError("maximum output tokens exceeded"))
    assertTrue(ProviderCompatibilityContract.diagnostic("maximum output tokens exceeded").contains("output limit"))
  }
}

package com.askinz.publisher

/** Deterministic provider capability and diagnostic rules for OpenAI-compatible Article APIs. */
object ProviderCompatibilityContract {
  enum class StructuredMode { JSON_SCHEMA, JSON_OBJECT_FALLBACK, PLAIN_JSON_REPAIR }

  data class Profile(
    val baseUrl: String,
    val model: String,
    val mode: StructuredMode = StructuredMode.JSON_SCHEMA,
    val maxOutputTokens: Int = 12000
  )

  fun normalize(baseUrl: String, model: String, mode: StructuredMode = StructuredMode.JSON_SCHEMA): Profile {
    val normalizedUrl = baseUrl.trim().removeSuffix("/")
    require(normalizedUrl.startsWith("https://")) { "Article API URL must use HTTPS." }
    require(model.trim().isNotBlank()) { "Article API model is required." }
    return Profile(normalizedUrl, model.trim().take(160), mode, maxOutputTokens = if (mode == StructuredMode.JSON_SCHEMA) 12000 else 10000)
  }

  fun modeForError(message: String): StructuredMode {
    val value = message.lowercase()
    return when {
      value.contains("json_schema") || value.contains("response_format") || value.contains("unsupported") -> StructuredMode.JSON_OBJECT_FALLBACK
      value.contains("context") || value.contains("maximum") || value.contains("token") || value.contains("length") -> StructuredMode.PLAIN_JSON_REPAIR
      else -> StructuredMode.JSON_SCHEMA
    }
  }

  fun diagnostic(message: String): String {
    val value = message.lowercase()
    return when {
      value.contains("json_schema") || value.contains("response_format") -> "This provider does not support JSON Schema; OrbitPress will retry with a compatible structured-output mode."
      value.contains("context") || value.contains("maximum") || value.contains("token") || value.contains("length") -> "The provider output limit is too small for this long article; reduce the recipe count or choose a larger-context model."
      value.contains("401") || value.contains("403") || value.contains("unauthorized") -> "The Article API rejected the key; verify the provider key and permissions."
      value.contains("404") -> "The Article API endpoint or model was not found; verify the base URL and model."
      else -> "The Article API returned an unexpected response; retry after checking the provider settings."
    }
  }
}

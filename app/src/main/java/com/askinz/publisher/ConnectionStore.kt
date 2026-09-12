package com.askinz.publisher

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Persists the server connection of the thin WebView shell:
 * the server base URL and the access code / master token used to sign in.
 *
 * There is no Google login. The admin app signs in with the master
 * ORBITPRESS_TOKEN, the user app with an admin-issued XXXX-XXXXX code.
 * Both hit POST <server>/api/auth and receive the same orbitpress_token
 * cookie, which is injected into the WebView before loading the app.
 */
class ConnectionStore(context: Context) {
  private val preferences = run {
    val key = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
    EncryptedSharedPreferences.create(
      context,
      PREFS_NAME,
      key,
      EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
      EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
  }

  val serverBase: String?
    get() = preferences.getString(KEY_SERVER, null)?.takeIf { it.isNotBlank() }

  val token: String?
    get() = preferences.getString(KEY_TOKEN, null)?.takeIf { it.isNotBlank() }

  fun save(serverBase: String, token: String) {
    preferences.edit()
      .putString(KEY_SERVER, serverBase.trim().trimEnd('/'))
      .putString(KEY_TOKEN, token.trim())
      .apply()
  }

  fun clear() {
    preferences.edit().clear().apply()
  }

  companion object {
    private const val PREFS_NAME = "orbitpress_connection"
    private const val KEY_SERVER = "serverBase"
    private const val KEY_TOKEN = "token"

    /** Accept "host:8080" without a scheme; default to https. */
    fun normalizeServerUrl(raw: String): String {
      var value = raw.trim().trimEnd('/')
      if (value.isEmpty()) return value
      if (!value.startsWith("http://", ignoreCase = true) && !value.startsWith("https://", ignoreCase = true)) {
        value = "https://$value"
      }
      return value
    }
  }
}

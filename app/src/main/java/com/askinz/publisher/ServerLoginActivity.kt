package com.askinz.publisher

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.text.InputType
import android.util.TypedValue
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.webkit.CookieManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * First screen of the thin WebView shell. The user enters the server URL
 * and the access code handed to them by the admin; the admin app requires
 * the master owner token (role "owner"). On success the session cookie is
 * stored and the WebView activity opens.
 */
class ServerLoginActivity : Activity() {
  private lateinit var serverInput: EditText
  private lateinit var codeInput: EditText
  private lateinit var loginButton: Button
  private lateinit var statusView: TextView

  private val isAdminApp get() = BuildConfig.APP_ROLE == "admin"

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val store = ConnectionStore(this)

    val scroll = ScrollView(this)
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(22), dp(34), dp(22), dp(28))
      setBackgroundColor(Color.parseColor("#0B1220"))
    }

    val logo = TextView(this).apply {
      text = if (isAdminApp) "◉ OrbitPress — المدير" else "◉ OrbitPress"
      setTextColor(Color.parseColor("#65F5C8"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
      setTypeface(typeface, android.graphics.Typeface.BOLD)
    }
    val subtitle = TextView(this).apply {
      text = if (isAdminApp)
        "تطبيق المدير. سجّل الدخول بالرمز الرئيسي للخادم (ORBITPRESS_TOKEN) لمراجعة المستخدمين والمحتوى."
      else
        "أدخل عنوان الخادم وكود الدخول الذي سلّمك إياه المدير. لا يوجد تسجيل ذاتي؛ الدخول بالكود فقط."
      setTextColor(Color.parseColor("#AAB8CE"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
      setPadding(0, dp(8), 0, dp(18))
    }

    serverInput = input(
      "عنوان الخادم — مثال: https://orbit.example.com أو http://203.0.113.10:8080",
      InputType.TYPE_TEXT_VARIATION_URI,
    )
    (store.serverBase ?: intent.getStringExtra(EXTRA_SERVER) ?: "").let { serverInput.setText(it) }

    codeInput = input(
      if (isAdminApp) "الرمز الرئيسي للمدير" else "كود الدخول (XXXX-XXXXX)",
      InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS,
    )

    loginButton = Button(this).apply {
      text = "دخول"
      setTextColor(Color.WHITE)
      setBackgroundColor(Color.parseColor("#4169FF"))
      val padV = dp(12)
      setPadding(0, padV, 0, padV)
      setOnClickListener { attemptLogin() }
    }

    statusView = TextView(this).apply {
      setTextColor(Color.parseColor("#FF8B85"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
      setPadding(0, dp(12), 0, 0)
      visibility = View.GONE
    }

    intent.getStringExtra(EXTRA_MESSAGE)?.let {
      statusView.text = it
      statusView.visibility = View.VISIBLE
    }

    root.addView(logo)
    root.addView(subtitle)
    root.addView(label("عنوان الخادم"))
    root.addView(serverInput)
    root.addView(label(if (isAdminApp) "الرمز الرئيسي" else "كود الدخول"))
    root.addView(codeInput)
    root.addView(
      loginButton,
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        .apply { topMargin = dp(18) },
    )
    root.addView(statusView)
    scroll.addView(root)
    setContentView(scroll)

    // An already configured user app goes straight in only when it is opened
    // normally; when the user explicitly logged out, EXTRA_LOGOUT is present.
    if (!intent.getBooleanExtra(EXTRA_LOGOUT, false)) {
      store.serverBase?.let { serverBase ->
        if (store.token != null) {
          installCookie(serverBase, store.token!!)
          startActivity(Intent(this, MainActivity::class.java))
          finish()
        }
      }
    }
  }

  private fun label(text: String) = TextView(this).apply {
    this.text = text
    setTextColor(Color.parseColor("#CBD5E1"))
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
    setPadding(0, dp(14), 0, dp(6))
  }

  private fun input(hint: String, type: Int) = EditText(this).apply {
    this.hint = hint
    inputType = type
    setTextColor(Color.WHITE)
    setHintTextColor(Color.parseColor("#5B6B86"))
    setBackgroundColor(Color.parseColor("#13233D"))
    setPadding(dp(14), dp(12), dp(14), dp(12))
    textSize = 16f // prevents iOS-style auto-zoom; also easier to type on Android
    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
  }

  private fun attemptLogin() {
    val store = ConnectionStore(this)
    val base = ConnectionStore.normalizeServerUrl(serverInput.text.toString())
    val code = codeInput.text.toString().trim()
    if (!base.startsWith("http://") && !base.startsWith("https://")) {
      return fail("اكتب عنوان الخادم بشكل صحيح.")
    }
    if (code.isBlank()) {
      return fail(if (isAdminApp) "أدخل الرمز الرئيسي للمدير." else "أدخل كود الدخول الذي تسلّمته.")
    }
    hideKeyboard()
    statusView.visibility = View.GONE
    loginButton.isEnabled = false
    loginButton.text = "جارٍ الاتصال…"

    Thread {
      val result = authenticate(base, code)
      runOnUiThread {
        loginButton.isEnabled = true
        loginButton.text = "دخول"
        if (result is Result.Ok) {
          if (isAdminApp && result.role != "owner") {
            fail("تطبيق المدير لا يقبل إلا الرمز الرئيسي للمدير. هذا الكود خاص بحساب مستخدم.")
            return@runOnUiThread
          }
          store.save(base, code)
          installCookie(base, code)
          Toast.makeText(this, "تم الدخول بنجاح", Toast.LENGTH_SHORT).show()
          startActivity(
            Intent(this, MainActivity::class.java)
              .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK),
          )
          finish()
        } else if (result is Result.Error) {
          fail(result.message)
        }
      }
    }.start()
  }

  private sealed class Result {
    data class Ok(val role: String) : Result()
    data class Error(val message: String) : Result()
  }

  private fun authenticate(base: String, token: String): Result {
    var connection: HttpURLConnection? = null
    try {
      connection = (URL("$base/api/auth").openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 15_000
        readTimeout = 20_000
        doOutput = true
        setRequestProperty("Content-Type", "application/json")
        setRequestProperty("Accept", "application/json")
      }
      connection.outputStream.use {
        it.write(JSONObject().put("token", token).toString().toByteArray(Charsets.UTF_8))
      }
      val status = connection.responseCode
      val stream = if (status in 200..299) connection.inputStream else connection.errorStream
      val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
      val json = runCatching { JSONObject(body) }.getOrNull()
      if (status in 200..299 && json?.optBoolean("ok") == true) {
        return Result.Ok(json.optString("role", "user"))
      }
      val serverMessage = json?.optString("message").orEmpty().ifBlank {
        if (status == 403) "تم رفض الدخول: الكود محظور من قبل المدير."
        else if (status == 401) "الكود أو الرمز غير صحيح."
        else "تعذّر الدخول (HTTP $status)."
      }
      return Result.Error(serverMessage)
    } catch (e: Exception) {
      return Result.Error(
        "تعذّر الاتصال بالخادم. تأكد من العنوان ومن أن الخادم يعمل، ومن أن الرابط يبدأ بـ http أو https.\nالتفاصيل: ${e.message}",
      )
    } finally {
      connection?.disconnect()
    }
  }

  private fun installCookie(base: String, token: String) {
    val cookieManager = CookieManager.getInstance()
    cookieManager.setAcceptCookie(true)
    cookieManager.setCookie(
      base,
      "orbitpress_token=${URLEncoder.encode(token, "UTF-8")}; path=/",
    )
    cookieManager.flush()
  }

  private fun fail(message: String) {
    statusView.text = message
    statusView.visibility = View.VISIBLE
  }

  private fun hideKeyboard() {
    val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
    imm.hideSoftInputFromWindow((currentFocus ?: serverInput).windowToken, 0)
  }

  private fun dp(value: Int): Int =
    (value * resources.displayMetrics.density + 0.5f).toInt()

  companion object {
    const val EXTRA_MESSAGE = "message"
    const val EXTRA_SERVER = "server"
    const val EXTRA_LOGOUT = "logout"
  }
}

plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

/**
 * Build-time defaults for the VPS Scraper (ORBITPRESS_SCRAPER_URL / ORBITPRESS_SCRAPER_KEY).
 * Lookup order: `.env` at the repository root (git-ignored) → `-P` Gradle property → OS environment variable.
 * Values end up in BuildConfig; the app uses them only when the Settings fields are left blank.
 */
val dotEnv: Map<String, String> = run {
  val file = rootProject.file(".env")
  if (!file.exists()) return@run emptyMap<String, String>()
  file.readLines()
    .map { it.trim().removePrefix("export ").trim() }
    .filter { it.isNotBlank() && !it.startsWith("#") && it.contains('=') }
    .associate { line ->
      val key = line.substringBefore('=').trim()
      val value = line.substringAfter('=').trim().trim('"', '\'')
      key to value
    }
}

fun buildSecret(name: String): String =
  dotEnv[name] ?: (project.findProperty(name) as String?) ?: System.getenv(name) ?: ""

fun javaString(value: String): String = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

val scraperUrl = buildSecret("ORBITPRESS_SCRAPER_URL").trimEnd('/')
val scraperKey = buildSecret("ORBITPRESS_SCRAPER_KEY")
require(scraperUrl.isBlank() || scraperUrl.startsWith("https://")) {
  "ORBITPRESS_SCRAPER_URL must use HTTPS (got '$scraperUrl')."
}
logger.lifecycle(
  "OrbitPress scraper defaults: url=${scraperUrl.ifBlank { "<none>" }} key=${if (scraperKey.isBlank()) "<none>" else "<set>"}"
)

/**
 * Optional release signing. When ORBITPRESS_KEYSTORE_FILE (path) + passwords are provided - locally through
 * `.env` / env vars, on CI through the ORBITPRESS_KEYSTORE_BASE64 secret decoded by the workflow - the release
 * APK is signed with that key and installs directly. Without them the release APK stays unsigned (as before).
 */
val releaseStoreFile = buildSecret("ORBITPRESS_KEYSTORE_FILE").let { if (it.isBlank()) null else rootProject.file(it) }
val releaseStorePassword = buildSecret("ORBITPRESS_KEYSTORE_PASSWORD")
val releaseKeyAlias = buildSecret("ORBITPRESS_KEY_ALIAS")
val releaseKeyPassword = buildSecret("ORBITPRESS_KEY_PASSWORD").ifBlank { releaseStorePassword }
val releaseSigningReady = releaseStoreFile?.exists() == true && releaseStorePassword.isNotBlank() && releaseKeyAlias.isNotBlank()
logger.lifecycle("OrbitPress release signing: ${if (releaseSigningReady) "enabled (${releaseStoreFile?.name}, alias=$releaseKeyAlias)" else "disabled - release APK will be unsigned"}")

android {
  namespace = "com.askinz.publisher"
  compileSdk = 35

  defaultConfig {
    applicationId = "com.askinz.publisher"
    minSdk = 26
    targetSdk = 35
    versionCode = 14
    versionName = "4.1.5"
    vectorDrawables { useSupportLibrary = true }

    buildConfigField("String", "SCRAPER_DEFAULT_URL", javaString(scraperUrl))
    buildConfigField("String", "SCRAPER_DEFAULT_KEY", javaString(scraperKey))
  }

  buildFeatures { buildConfig = true }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  signingConfigs {
    if (releaseSigningReady) {
      create("release") {
        storeFile = releaseStoreFile
        storePassword = releaseStorePassword
        keyAlias = releaseKeyAlias
        keyPassword = releaseKeyPassword
        enableV1Signing = true
        enableV2Signing = true
      }
    }
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      isShrinkResources = false
      proguardFiles(
        getDefaultProguardFile("proguard-android-optimize.txt"),
        "proguard-rules.pro"
      )
      isDebuggable = false
      if (releaseSigningReady) signingConfig = signingConfigs.getByName("release")
    }
    debug {
      isMinifyEnabled = false
      isDebuggable = true
      applicationIdSuffix = ".debug"
    }
  }

  packaging {
    resources {
      excludes += setOf(
        "META-INF/DEPENDENCIES",
        "META-INF/LICENSE",
        "META-INF/LICENSE.txt",
        "META-INF/NOTICE",
        "META-INF/NOTICE.txt"
      )
    }
  }

  lint {
    abortOnError = false
    checkReleaseBuilds = false
  }

  testOptions {
    unitTests {
      isIncludeAndroidResources = true
      isReturnDefaultValues = true
    }
  }
}

kotlin { jvmToolchain(17) }

dependencies {
  // Modern efficient dependencies
  implementation("androidx.core:core-ktx:1.13.1")
  implementation("androidx.appcompat:appcompat:1.7.0")
  implementation("com.google.android.material:material:1.12.0")
  implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
  implementation("androidx.webkit:webkit:1.12.1")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
  implementation("androidx.security:security-crypto:1.1.0-alpha06")
  implementation("androidx.work:work-runtime-ktx:2.9.1")

  testImplementation("junit:junit:4.13.2")
  testImplementation("org.json:json:20240303")
  testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
}

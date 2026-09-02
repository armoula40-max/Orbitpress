plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "com.askinz.publisher"
  compileSdk = 35

  defaultConfig {
    applicationId = "com.askinz.publisher"
    minSdk = 26
    targetSdk = 35
    versionCode = 8
    versionName = "4.0.0"
  }

  buildFeatures { buildConfig = true }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}

kotlin { jvmToolchain(21) }

dependencies {
  implementation("androidx.security:security-crypto:1.1.0-alpha06")
  implementation("androidx.work:work-runtime-ktx:2.9.1")
  testImplementation("junit:junit:4.13.2")
  testImplementation("org.json:json:20240303")
}

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
    versionCode = 9
    versionName = "4.1.0"
  }

  // Two installable apps sharing the same thin WebView shell:
  //   user  -> signs in with an admin-issued XXXX-XXXXX access code
  //   admin -> signs in with the master ORBITPRESS_TOKEN (role "owner" only)
  // Both connect to the same VPS server edition.
  flavorDimensions += "role"
  productFlavors {
    create("user") {
      dimension = "role"
      applicationId = "com.askinz.publisher"
      resValue("string", "app_name", "OrbitPress")
      buildConfigField("String", "APP_ROLE", "\"user\"")
    }
    create("admin") {
      dimension = "role"
      applicationId = "com.askinz.publisher.admin"
      resValue("string", "app_name", "OrbitPress \u0627\u0644\u0645\u062F\u064A\u0631")
      buildConfigField("String", "APP_ROLE", "\"admin\"")
    }
  }

  buildFeatures { buildConfig = true }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}

kotlin { jvmToolchain(17) }

dependencies {
  implementation("androidx.security:security-crypto:1.1.0-alpha06")
  implementation("androidx.work:work-runtime-ktx:2.9.1")
  testImplementation("junit:junit:4.13.2")
  testImplementation("org.json:json:20240303")
}

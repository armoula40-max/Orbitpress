# OrbitPress 4.1 ProGuard Rules - Keep efficiency while preserving WebView bridges
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.askinz.publisher.** { *; }
-keep class androidx.security.crypto.** { *; }
-keep class org.json.** { *; }

# Remove logging in release
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}

# Coroutines
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembernames class kotlinx.** {
    volatile <fields>;
}

# Keep WebViewClient / WebChromeClient
-keepclassmembers class * extends android.webkit.WebViewClient { *; }
-keepclassmembers class * extends android.webkit.WebChromeClient { *; }

-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

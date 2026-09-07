# Build failure 34136138761 on 2/merge

## Errors
```
19:The client will now receive all logging from the daemon (pid: 2673). The daemon log file: /home/runner/.gradle/daemon/9.6.1/daemon-2673.out.log
768:e: file:///home/runner/work/Orbitpress/Orbitpress/app/src/main/java/com/askinz/publisher/MainActivity.kt:639:441 Smart cast to 'kotlin.ByteArray' is impossible, because 'currentBody' is a local variable that is mutated in a capturing closure.
```

## Debug log tail (800 lines)
```
Build cache key for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/22b7620688c26f36b4e33f2dded56841/transformed/documentfile-1.0.0-runtime.jar is 0665fc78c8c671c5e788a96ba5c1b52f
Stored cache entry for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/dd40cc6df3ec22c4a58768607bc9065b/transformed/sqlite-framework-2.3.0-runtime.jar with cache key 6d7c851d5371d6289199b2721ce514f2
Caching disabled for AarToClassTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.localbroadcastmanager/localbroadcastmanager/1.0.0/2734f31c8321e83ce6b60570d14777fc33cc2ece/localbroadcastmanager-1.0.0.aar because:
  Caching not enabled.
Stored cache entry for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/22b7620688c26f36b4e33f2dded56841/transformed/documentfile-1.0.0-runtime.jar with cache key 0665fc78c8c671c5e788a96ba5c1b52f
Caching disabled for AarToClassTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.print/print/1.0.0/7722094652c48ebe27acc94d74a55e759e4635ff/print-1.0.0.aar because:
  Caching not enabled.
Build cache key for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/e5cb1903368289f23e289c6870400ff7/transformed/localbroadcastmanager-1.0.0-runtime.jar is b6e6c174b03c82ac9b784cad839a3e86
Build cache key for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/7ccc3d2b092d2f298638ebbfb156847a/transformed/print-1.0.0-runtime.jar is e716f0fc797fea5e0fcf42a4ca91a939
Stored cache entry for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/e5cb1903368289f23e289c6870400ff7/transformed/localbroadcastmanager-1.0.0-runtime.jar with cache key b6e6c174b03c82ac9b784cad839a3e86
Stored cache entry for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/7ccc3d2b092d2f298638ebbfb156847a/transformed/print-1.0.0-runtime.jar with cache key e716f0fc797fea5e0fcf42a4ca91a939
Caching disabled for AarToClassTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.arch.core/core-runtime/2.2.0/39705982680d78556b679ef9d5400d4f17509b0b/core-runtime-2.2.0.aar because:
  Caching not enabled.
Build cache key for EnumerateClassesTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.arch.core/core-common/2.2.0/5e1b8b81dfd5f52c56a8d53b18ca759c19a301f3/core-common-2.2.0.jar is f6bacd091c6933a10ff57a187c4e77b0
Build cache key for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/0d3122c9cc36089783e22acffb3fd47c/transformed/core-runtime-2.2.0-runtime.jar is 62b615a120ffbb380552d25aafec7087
Stored cache entry for EnumerateClassesTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.arch.core/core-common/2.2.0/5e1b8b81dfd5f52c56a8d53b18ca759c19a301f3/core-common-2.2.0.jar with cache key f6bacd091c6933a10ff57a187c4e77b0
Stored cache entry for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/0d3122c9cc36089783e22acffb3fd47c/transformed/core-runtime-2.2.0-runtime.jar with cache key 62b615a120ffbb380552d25aafec7087
Caching disabled for AarToClassTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.sqlite/sqlite/2.3.0/3dc5b3c69a6d20d8228fd60f3c6ef97f2f416efe/sqlite-2.3.0.aar because:
  Caching not enabled.
Build cache key for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/5e5ce9bf5a62c4c8c56c45afef489d2c/transformed/sqlite-2.3.0-runtime.jar is 063450c81ae3ddaf6cc8c6ee002da50f
Stored cache entry for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/5e5ce9bf5a62c4c8c56c45afef489d2c/transformed/sqlite-2.3.0-runtime.jar with cache key 063450c81ae3ddaf6cc8c6ee002da50f
Build cache key for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/8759d1199b9322e969301f66ae6fccfc/transformed/jetified-annotation-jvm-1.8.1.jar is e1f9578658121afe6c3af088d07a5ac2
Stored cache entry for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/8759d1199b9322e969301f66ae6fccfc/transformed/jetified-annotation-jvm-1.8.1.jar with cache key e1f9578658121afe6c3af088d07a5ac2
Downloading https://repo.maven.apache.org/maven2/org/jetbrains/kotlin/kotlin-stdlib-jdk8/1.8.22/kotlin-stdlib-jdk8-1.8.22.jar to /home/runner/.gradle/.tmp/gradle_download14545223375827221305bin
Build cache key for JetifyTransform: /home/runner/.gradle/caches/modules-2/files-2.1/org.jetbrains.kotlin/kotlin-stdlib-jdk8/1.8.22/b25c86d47d6b962b9cf0f8c3f320c8a10eea3dd1/kotlin-stdlib-jdk8-1.8.22.jar is 9a57cc80bbb6a7806c4be366f7cb8016
Downloading https://dl.google.com/dl/android/maven2/androidx/room/room-common/2.5.0/room-common-2.5.0.jar to /home/runner/.gradle/.tmp/gradle_download12525029325752912910bin
Downloading https://dl.google.com/dl/android/maven2/androidx/concurrent/concurrent-futures/1.1.0/concurrent-futures-1.1.0.jar to /home/runner/.gradle/.tmp/gradle_download16819729744997783382bin
Stored cache entry for JetifyTransform: /home/runner/.gradle/caches/modules-2/files-2.1/org.jetbrains.kotlin/kotlin-stdlib-jdk8/1.8.22/b25c86d47d6b962b9cf0f8c3f320c8a10eea3dd1/kotlin-stdlib-jdk8-1.8.22.jar with cache key 9a57cc80bbb6a7806c4be366f7cb8016
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/9e2fcab835fa8bc2dde15359f99e8829/transformed/jetified-kotlin-stdlib-jdk8-1.8.22.jar because:
  Caching not enabled.
Build cache key for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/9e2fcab835fa8bc2dde15359f99e8829/transformed/jetified-kotlin-stdlib-jdk8-1.8.22.jar is 7a2d999e04f342d9d060112508ff981c
Build cache key for JetifyTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.concurrent/concurrent-futures/1.1.0/50b7fb98350d5f42a4e49704b03278542293ba48/concurrent-futures-1.1.0.jar is b49a9c47d937a283f56b887412e38680
Stored cache entry for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/9e2fcab835fa8bc2dde15359f99e8829/transformed/jetified-kotlin-stdlib-jdk8-1.8.22.jar with cache key 7a2d999e04f342d9d060112508ff981c
Build cache key for JetifyTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.room/room-common/2.5.0/829a83fb92f1696a8a32f3beea884dfc87b2693/room-common-2.5.0.jar is a729c5596a676e1265ed72c170ad257c
Stored cache entry for JetifyTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.room/room-common/2.5.0/829a83fb92f1696a8a32f3beea884dfc87b2693/room-common-2.5.0.jar with cache key a729c5596a676e1265ed72c170ad257c
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.room/room-common/2.5.0/829a83fb92f1696a8a32f3beea884dfc87b2693/room-common-2.5.0.jar because:
  Caching not enabled.
Downloading https://repo.maven.apache.org/maven2/org/jetbrains/kotlin/kotlin-stdlib-jdk7/1.8.22/kotlin-stdlib-jdk7-1.8.22.jar to /home/runner/.gradle/.tmp/gradle_download4359889522257752493bin
Build cache key for JetifyTransform: /home/runner/.gradle/caches/modules-2/files-2.1/org.jetbrains.kotlin/kotlin-stdlib-jdk7/1.8.22/4dabb8248310d833bb6a8b516024a91fd3d275c/kotlin-stdlib-jdk7-1.8.22.jar is d3bdb3c2456c4a6a80c6245b44457234
Build cache key for EnumerateClassesTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.room/room-common/2.5.0/829a83fb92f1696a8a32f3beea884dfc87b2693/room-common-2.5.0.jar is cac939f1c2efcd05cf8b43da7178e286
Stored cache entry for EnumerateClassesTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.room/room-common/2.5.0/829a83fb92f1696a8a32f3beea884dfc87b2693/room-common-2.5.0.jar with cache key cac939f1c2efcd05cf8b43da7178e286
Build cache key for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/26842c3548c0c8b4a2a895cece1566da/transformed/jetified-kotlin-stdlib-2.0.21.jar is 6b133eb1275bc18f7477055e0bb585c6
Stored cache entry for JetifyTransform: /home/runner/.gradle/caches/modules-2/files-2.1/org.jetbrains.kotlin/kotlin-stdlib-jdk7/1.8.22/4dabb8248310d833bb6a8b516024a91fd3d275c/kotlin-stdlib-jdk7-1.8.22.jar with cache key d3bdb3c2456c4a6a80c6245b44457234
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/ee65f1d2022b710ab7d6f0da51fffaa3/transformed/jetified-kotlin-stdlib-jdk7-1.8.22.jar because:
  Caching not enabled.
Stored cache entry for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/26842c3548c0c8b4a2a895cece1566da/transformed/jetified-kotlin-stdlib-2.0.21.jar with cache key 6b133eb1275bc18f7477055e0bb585c6
Build cache key for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/4281ba71ab757f148653e1221ff6962b/transformed/jetified-annotations-23.0.0.jar is 6ec117215aacaa295c0de3e7cf494e79
Stored cache entry for JetifyTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.concurrent/concurrent-futures/1.1.0/50b7fb98350d5f42a4e49704b03278542293ba48/concurrent-futures-1.1.0.jar with cache key b49a9c47d937a283f56b887412e38680
Build cache key for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/ee65f1d2022b710ab7d6f0da51fffaa3/transformed/jetified-kotlin-stdlib-jdk7-1.8.22.jar is 524797728a2b92c4f0c2b2d9a8b4d8fe
Stored cache entry for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/4281ba71ab757f148653e1221ff6962b/transformed/jetified-annotations-23.0.0.jar with cache key 6ec117215aacaa295c0de3e7cf494e79
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/5005dcef20f913fe48d5389f6cbf4001/transformed/jetified-concurrent-futures-1.1.0.jar because:
  Caching not enabled.
Stored cache entry for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/ee65f1d2022b710ab7d6f0da51fffaa3/transformed/jetified-kotlin-stdlib-jdk7-1.8.22.jar with cache key 524797728a2b92c4f0c2b2d9a8b4d8fe
Build cache key for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/5005dcef20f913fe48d5389f6cbf4001/transformed/jetified-concurrent-futures-1.1.0.jar is 66ab0cef3b75e2b3cfc7818dbfdfbdad
Stored cache entry for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/5005dcef20f913fe48d5389f6cbf4001/transformed/jetified-concurrent-futures-1.1.0.jar with cache key 66ab0cef3b75e2b3cfc7818dbfdfbdad
Build cache key for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/eff8a650d3c007509d895736950924cd/transformed/jetified-listenablefuture-1.0.jar is 39048fc78c906adca18102ff078a2d97
Stored cache entry for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/eff8a650d3c007509d895736950924cd/transformed/jetified-listenablefuture-1.0.jar with cache key 39048fc78c906adca18102ff078a2d97
Build cache key for EnumerateClassesTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.constraintlayout/constraintlayout-solver/2.0.1/30988fe2d77f3fe3bf7551bb8a8b795fad7e7226/constraintlayout-solver-2.0.1.jar is 4550f9889fd042dcff7274eff67fc927
Downloading https://repo.maven.apache.org/maven2/com/google/errorprone/error_prone_annotations/2.15.0/error_prone_annotations-2.15.0.jar to /home/runner/.gradle/.tmp/gradle_download2718964217658139417bin
Stored cache entry for EnumerateClassesTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.constraintlayout/constraintlayout-solver/2.0.1/30988fe2d77f3fe3bf7551bb8a8b795fad7e7226/constraintlayout-solver-2.0.1.jar with cache key 4550f9889fd042dcff7274eff67fc927
Build cache key for JetifyTransform: /home/runner/.gradle/caches/modules-2/files-2.1/com.google.errorprone/error_prone_annotations/2.15.0/38c8485a652f808c8c149150da4e5c2b0bd17f9a/error_prone_annotations-2.15.0.jar is a5ec23a5c1170010a90375904ecbfd73
Downloading https://repo.maven.apache.org/maven2/com/google/code/gson/gson/2.8.9/gson-2.8.9.jar to /home/runner/.gradle/.tmp/gradle_download2264794116911800447bin
Stored cache entry for JetifyTransform: /home/runner/.gradle/caches/modules-2/files-2.1/com.google.errorprone/error_prone_annotations/2.15.0/38c8485a652f808c8c149150da4e5c2b0bd17f9a/error_prone_annotations-2.15.0.jar with cache key a5ec23a5c1170010a90375904ecbfd73
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/84228bebc2f062b3b77800a9d2330e12/transformed/jetified-error_prone_annotations-2.15.0.jar because:
  Caching not enabled.
Build cache key for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/84228bebc2f062b3b77800a9d2330e12/transformed/jetified-error_prone_annotations-2.15.0.jar is 05baa97548b4893fee3880fc763e4d63
Stored cache entry for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/84228bebc2f062b3b77800a9d2330e12/transformed/jetified-error_prone_annotations-2.15.0.jar with cache key 05baa97548b4893fee3880fc763e4d63
Downloading https://repo.maven.apache.org/maven2/com/google/crypto/tink/tink-android/1.8.0/tink-android-1.8.0.jar to /home/runner/.gradle/.tmp/gradle_download11628172752634763097bin
Build cache key for JetifyTransform: /home/runner/.gradle/caches/modules-2/files-2.1/com.google.code.gson/gson/2.8.9/8a432c1d6825781e21a02db2e2c33c5fde2833b9/gson-2.8.9.jar is 22598084dcd5d4932a7941d41f053f30
Build cache key for JetifyTransform: /home/runner/.gradle/caches/modules-2/files-2.1/com.google.crypto.tink/tink-android/1.8.0/bda82b49568d444a3b54773ca5aa487816473295/tink-android-1.8.0.jar is db7ee859b3632ac1d88470f7a9129323
Stored cache entry for JetifyTransform: /home/runner/.gradle/caches/modules-2/files-2.1/com.google.code.gson/gson/2.8.9/8a432c1d6825781e21a02db2e2c33c5fde2833b9/gson-2.8.9.jar with cache key 22598084dcd5d4932a7941d41f053f30
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/2e90b1ddfe9922cc51a0a3e2fe4c3caa/transformed/jetified-gson-2.8.9.jar because:
  Caching not enabled.
Build cache key for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/2e90b1ddfe9922cc51a0a3e2fe4c3caa/transformed/jetified-gson-2.8.9.jar is 3e0f4ae3df98e10710505d3ecd5699fd
Stored cache entry for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/2e90b1ddfe9922cc51a0a3e2fe4c3caa/transformed/jetified-gson-2.8.9.jar with cache key 3e0f4ae3df98e10710505d3ecd5699fd
Stored cache entry for JetifyTransform: /home/runner/.gradle/caches/modules-2/files-2.1/com.google.crypto.tink/tink-android/1.8.0/bda82b49568d444a3b54773ca5aa487816473295/tink-android-1.8.0.jar with cache key db7ee859b3632ac1d88470f7a9129323
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/fce7b73cf0255e07a209dbdc1d220432/transformed/jetified-tink-android-1.8.0.jar because:
  Caching not enabled.
Build cache key for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/fce7b73cf0255e07a209dbdc1d220432/transformed/jetified-tink-android-1.8.0.jar is 1b073964b8a34823c7b801b62d64be44
Stored cache entry for EnumerateClassesTransform: /home/runner/.gradle/caches/9.6.1/transforms/fce7b73cf0255e07a209dbdc1d220432/transformed/jetified-tink-android-1.8.0.jar with cache key 1b073964b8a34823c7b801b62d64be44
Caching disabled for task ':app:checkDebugDuplicateClasses' because:
  Caching has been disabled for the task
Task ':app:checkDebugDuplicateClasses' is not up-to-date because:
  No history is available.

> Task :app:mergeDebugJniLibFolders
Caching disabled for task ':app:mergeDebugJniLibFolders' because:
  Simple merging task
Task ':app:mergeDebugJniLibFolders' is not up-to-date because:
  No history is available.
The input changes require a full rebuild for incremental task ':app:mergeDebugJniLibFolders'.
Resolve mutations for :app:mergeExtDexDebug (Thread[Execution worker,5,main]) started.
:app:mergeExtDexDebug (Thread[included builds,5,main]) started.

> Task :app:mergeExtDexDebug
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/d25a9fa61f3aa3f1622cc4559b8095fe/transformed/material-1.12.0-runtime.jar because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/56d93cdeb238612d8b84bee892736978/transformed/jetified-appcompat-resources-1.7.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/d25a9fa61f3aa3f1622cc4559b8095fe/transformed/material-1.12.0-runtime.jar is c6d214c287f62224bf32d6b495cc4866
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/56d93cdeb238612d8b84bee892736978/transformed/jetified-appcompat-resources-1.7.0-runtime.jar is 03cbaf066c4ba382df5e9d04e9f6b3d2
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/56d93cdeb238612d8b84bee892736978/transformed/jetified-appcompat-resources-1.7.0-runtime.jar'
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/d25a9fa61f3aa3f1622cc4559b8095fe/transformed/material-1.12.0-runtime.jar'
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/0829ee14931b45f4655ab20c661a797c/transformed/constraintlayout-2.0.1-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/0829ee14931b45f4655ab20c661a797c/transformed/constraintlayout-2.0.1-runtime.jar is 5385e49c2aa3fb50fddb80cf57c8abb6
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/0829ee14931b45f4655ab20c661a797c/transformed/constraintlayout-2.0.1-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/56d93cdeb238612d8b84bee892736978/transformed/jetified-appcompat-resources-1.7.0-runtime.jar with cache key 03cbaf066c4ba382df5e9d04e9f6b3d2
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/3c670f59229b18a856db00ab6d2aa89c/transformed/jetified-appcompat-resources-1.7.0-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/41597861da389c0d4fab55c3644517b7/transformed/appcompat-1.7.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/41597861da389c0d4fab55c3644517b7/transformed/appcompat-1.7.0-runtime.jar is 0bcd98de9025e00d208789ac8f602ddd
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/41597861da389c0d4fab55c3644517b7/transformed/appcompat-1.7.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/0829ee14931b45f4655ab20c661a797c/transformed/constraintlayout-2.0.1-runtime.jar with cache key 5385e49c2aa3fb50fddb80cf57c8abb6
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/80d7c0e3426a1d4758bce94b766bc232/transformed/constraintlayout-2.0.1-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/09671744b47d79c312cdca5373a4c011/transformed/webkit-1.12.1-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/09671744b47d79c312cdca5373a4c011/transformed/webkit-1.12.1-runtime.jar is 21c376198efe29eb89e13244175ea25a
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/09671744b47d79c312cdca5373a4c011/transformed/webkit-1.12.1-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/09671744b47d79c312cdca5373a4c011/transformed/webkit-1.12.1-runtime.jar with cache key 21c376198efe29eb89e13244175ea25a
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/d2713db9fad5cc4d08e83f701fe28471/transformed/webkit-1.12.1-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/307450848703d3e027f92ee990e4858a/transformed/jetified-emoji2-views-helper-1.3.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/307450848703d3e027f92ee990e4858a/transformed/jetified-emoji2-views-helper-1.3.0-runtime.jar is 0db83386c3d40bb7cb22ab30d852badb
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/307450848703d3e027f92ee990e4858a/transformed/jetified-emoji2-views-helper-1.3.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/307450848703d3e027f92ee990e4858a/transformed/jetified-emoji2-views-helper-1.3.0-runtime.jar with cache key 0db83386c3d40bb7cb22ab30d852badb
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/ef03233e3d288b50b6febd6affbb86f5/transformed/jetified-emoji2-views-helper-1.3.0-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/c49d3465bc25746922f253d68bcfea62/transformed/jetified-emoji2-1.3.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/c49d3465bc25746922f253d68bcfea62/transformed/jetified-emoji2-1.3.0-runtime.jar is d303169d839164059efd0ab4c1cf03d4
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/c49d3465bc25746922f253d68bcfea62/transformed/jetified-emoji2-1.3.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/c49d3465bc25746922f253d68bcfea62/transformed/jetified-emoji2-1.3.0-runtime.jar with cache key d303169d839164059efd0ab4c1cf03d4
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/dc1a5a7e077a2cd4598fe93e1ad5af1b/transformed/jetified-emoji2-1.3.0-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/80c166fca7d9b1124acd2577c77bc28d/transformed/jetified-viewpager2-1.0.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/80c166fca7d9b1124acd2577c77bc28d/transformed/jetified-viewpager2-1.0.0-runtime.jar is 20615f39a9e70b97c1cf715915f3c109
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/80c166fca7d9b1124acd2577c77bc28d/transformed/jetified-viewpager2-1.0.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/41597861da389c0d4fab55c3644517b7/transformed/appcompat-1.7.0-runtime.jar with cache key 0bcd98de9025e00d208789ac8f602ddd
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/1d319b9305c3f0eb8046037011582bc8/transformed/appcompat-1.7.0-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/7d2f5f3770a62aad8157ae0382eebda5/transformed/fragment-1.5.4-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/7d2f5f3770a62aad8157ae0382eebda5/transformed/fragment-1.5.4-runtime.jar is 36ea55f35e1ec1da565d1c19e0a312e3
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/7d2f5f3770a62aad8157ae0382eebda5/transformed/fragment-1.5.4-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/80c166fca7d9b1124acd2577c77bc28d/transformed/jetified-viewpager2-1.0.0-runtime.jar with cache key 20615f39a9e70b97c1cf715915f3c109
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/a2a2e68ff6f0dca35f0a7c46f6452698/transformed/jetified-viewpager2-1.0.0-runtime because:
  Caching not enabled.
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/7d2f5f3770a62aad8157ae0382eebda5/transformed/fragment-1.5.4-runtime.jar with cache key 36ea55f35e1ec1da565d1c19e0a312e3
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/81013f3cae8cd6184934706414198b16/transformed/fragment-1.5.4-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/2c707ee1ee39b88683c438b0f32ccd37/transformed/jetified-activity-1.8.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/2c707ee1ee39b88683c438b0f32ccd37/transformed/jetified-activity-1.8.0-runtime.jar is e572b0839ad0c54f2827328121fd817f
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/2c707ee1ee39b88683c438b0f32ccd37/transformed/jetified-activity-1.8.0-runtime.jar'
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/69f77adb980bb8778c70d1ab653a38a6/transformed/drawerlayout-1.1.1-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/69f77adb980bb8778c70d1ab653a38a6/transformed/drawerlayout-1.1.1-runtime.jar is 206e7cc2fe43404d35a4b8583afce1bc
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/69f77adb980bb8778c70d1ab653a38a6/transformed/drawerlayout-1.1.1-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/69f77adb980bb8778c70d1ab653a38a6/transformed/drawerlayout-1.1.1-runtime.jar with cache key 206e7cc2fe43404d35a4b8583afce1bc
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/b114edada4215b1c88e2d87c0aa3e8e4/transformed/drawerlayout-1.1.1-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/b5c816ac3e8e4cd49b982c8f4eadf678/transformed/coordinatorlayout-1.1.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/b5c816ac3e8e4cd49b982c8f4eadf678/transformed/coordinatorlayout-1.1.0-runtime.jar is 32a33d5ca455ed3953c4e5f112dac36d
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/b5c816ac3e8e4cd49b982c8f4eadf678/transformed/coordinatorlayout-1.1.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/2c707ee1ee39b88683c438b0f32ccd37/transformed/jetified-activity-1.8.0-runtime.jar with cache key e572b0839ad0c54f2827328121fd817f
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/317edcbd1b365c6fe883eae438dc84dd/transformed/jetified-activity-1.8.0-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/4800e8d8e8f70013f41a0b54591d282f/transformed/transition-1.5.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/4800e8d8e8f70013f41a0b54591d282f/transformed/transition-1.5.0-runtime.jar is af0a03d2f9f29a4d4f6835954c4e332e
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/4800e8d8e8f70013f41a0b54591d282f/transformed/transition-1.5.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/b5c816ac3e8e4cd49b982c8f4eadf678/transformed/coordinatorlayout-1.1.0-runtime.jar with cache key 32a33d5ca455ed3953c4e5f112dac36d
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/48621d00476ee6611113f8f1db668739/transformed/coordinatorlayout-1.1.0-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/5caf121f32b96f7d4e0edabe3e302505/transformed/dynamicanimation-1.0.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/5caf121f32b96f7d4e0edabe3e302505/transformed/dynamicanimation-1.0.0-runtime.jar is 0ca1e9903ce06a67ed092765dded023d
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/5caf121f32b96f7d4e0edabe3e302505/transformed/dynamicanimation-1.0.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/5caf121f32b96f7d4e0edabe3e302505/transformed/dynamicanimation-1.0.0-runtime.jar with cache key 0ca1e9903ce06a67ed092765dded023d
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/0cc65163b76fa8a9d7ff21d315e8e0d8/transformed/dynamicanimation-1.0.0-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/6b30935b0a7c935676aade165bcd8613/transformed/vectordrawable-animated-1.1.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/6b30935b0a7c935676aade165bcd8613/transformed/vectordrawable-animated-1.1.0-runtime.jar is 3f6f06a4808220a496ebd0afd26145e0
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/6b30935b0a7c935676aade165bcd8613/transformed/vectordrawable-animated-1.1.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/6b30935b0a7c935676aade165bcd8613/transformed/vectordrawable-animated-1.1.0-runtime.jar with cache key 3f6f06a4808220a496ebd0afd26145e0
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/ac52abfd28f0c66651aabf2766dc27cc/transformed/vectordrawable-animated-1.1.0-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/acc0637642fee8212ea6b636d275b577/transformed/vectordrawable-1.1.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/acc0637642fee8212ea6b636d275b577/transformed/vectordrawable-1.1.0-runtime.jar is 495650a44540d14bae5227c4aa25806b
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/acc0637642fee8212ea6b636d275b577/transformed/vectordrawable-1.1.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/acc0637642fee8212ea6b636d275b577/transformed/vectordrawable-1.1.0-runtime.jar with cache key 495650a44540d14bae5227c4aa25806b
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/ed8e49836e6ff409eff037f6eb0c6e41/transformed/vectordrawable-1.1.0-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/63392ef1869ec7b3fe029c33e247dc71/transformed/work-runtime-ktx-2.9.1-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/63392ef1869ec7b3fe029c33e247dc71/transformed/work-runtime-ktx-2.9.1-runtime.jar is cfa8d0c2c0db93890d52c0b51e4a2438
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/63392ef1869ec7b3fe029c33e247dc71/transformed/work-runtime-ktx-2.9.1-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/63392ef1869ec7b3fe029c33e247dc71/transformed/work-runtime-ktx-2.9.1-runtime.jar with cache key cfa8d0c2c0db93890d52c0b51e4a2438
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/cd530ef258adca6a33e9963115aea2dc/transformed/work-runtime-ktx-2.9.1-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/38e8ae89ad71c69c712d1051c00bf00d/transformed/work-runtime-2.9.1-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/38e8ae89ad71c69c712d1051c00bf00d/transformed/work-runtime-2.9.1-runtime.jar is 4048e3f2fd15d54874e53a398a3a80f7
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/38e8ae89ad71c69c712d1051c00bf00d/transformed/work-runtime-2.9.1-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/4800e8d8e8f70013f41a0b54591d282f/transformed/transition-1.5.0-runtime.jar with cache key af0a03d2f9f29a4d4f6835954c4e332e
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/ecdd9a7a0aa999b322da0c3147c6519e/transformed/transition-1.5.0-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/43d8426ca4f627ae8fa95d571767edf2/transformed/legacy-support-core-utils-1.0.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/43d8426ca4f627ae8fa95d571767edf2/transformed/legacy-support-core-utils-1.0.0-runtime.jar is 7b3b966289acd9197836dca9644d68ec
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/43d8426ca4f627ae8fa95d571767edf2/transformed/legacy-support-core-utils-1.0.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/43d8426ca4f627ae8fa95d571767edf2/transformed/legacy-support-core-utils-1.0.0-runtime.jar with cache key 7b3b966289acd9197836dca9644d68ec
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/e187df80341d91f547466072e18d3c78/transformed/legacy-support-core-utils-1.0.0-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/b73fa03c89c129b2d553981538c0cd06/transformed/loader-1.0.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/b73fa03c89c129b2d553981538c0cd06/transformed/loader-1.0.0-runtime.jar is 19af328dc868eb283c41e3b051d16d6b
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/b73fa03c89c129b2d553981538c0cd06/transformed/loader-1.0.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/b73fa03c89c129b2d553981538c0cd06/transformed/loader-1.0.0-runtime.jar with cache key 19af328dc868eb283c41e3b051d16d6b
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/3907bd52f049a7c41de522c37d35d3fc/transformed/loader-1.0.0-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/573e01ec4881c9eac6d10039e89f6e94/transformed/viewpager-1.0.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/573e01ec4881c9eac6d10039e89f6e94/transformed/viewpager-1.0.0-runtime.jar is 0d1a79adfcd91ac270ce37aa2474f875
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/573e01ec4881c9eac6d10039e89f6e94/transformed/viewpager-1.0.0-runtime.jar'
INFO: D8: Stripped invalid locals information from 1 method.
INFO: /home/runner/.gradle/caches/9.6.1/transforms/573e01ec4881c9eac6d10039e89f6e94/transformed/viewpager-1.0.0-runtime.jar: D8: Methods with invalid locals information:
  void androidx.viewpager.widget.PagerTitleStrip.updateTextPositions(int, float, boolean)
  Information in locals-table is invalid with respect to the stack map table. Local refers to non-present stack map type for register: 37 with constraint INT.
INFO: D8: Some warnings are typically a sign of using an outdated Java toolchain. To fix, recompile the source with an updated toolchain.
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/573e01ec4881c9eac6d10039e89f6e94/transformed/viewpager-1.0.0-runtime.jar with cache key 0d1a79adfcd91ac270ce37aa2474f875
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/d93017b69f0c883dda994fdae244f758/transformed/viewpager-1.0.0-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/51771f134755fe21a9c80bc8f16e86ba/transformed/recyclerview-1.1.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/51771f134755fe21a9c80bc8f16e86ba/transformed/recyclerview-1.1.0-runtime.jar is f8561157aa7fa65c28dbd2173f5c010e
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/51771f134755fe21a9c80bc8f16e86ba/transformed/recyclerview-1.1.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/d25a9fa61f3aa3f1622cc4559b8095fe/transformed/material-1.12.0-runtime.jar with cache key c6d214c287f62224bf32d6b495cc4866
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/929bea915f28e069414f6160f0b952a5/transformed/material-1.12.0-runtime because:
  Caching not enabled.

> Task :app:compileDebugKotlin FAILED
e: file:///home/runner/work/Orbitpress/Orbitpress/app/src/main/java/com/askinz/publisher/MainActivity.kt:639:441 Smart cast to 'kotlin.ByteArray' is impossible, because 'currentBody' is a local variable that is mutated in a capturing closure.
Finished executing kotlin compiler using DAEMON strategy

> Task :app:mergeExtDexDebug
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/b3250521e3c337b38a0a8877deca6897/transformed/customview-1.1.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/b3250521e3c337b38a0a8877deca6897/transformed/customview-1.1.0-runtime.jar is fffb2623a0fd0ca49626e7b473fff66c
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/b3250521e3c337b38a0a8877deca6897/transformed/customview-1.1.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/b3250521e3c337b38a0a8877deca6897/transformed/customview-1.1.0-runtime.jar with cache key fffb2623a0fd0ca49626e7b473fff66c
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/931ffd3e20ea9840b2c097587c1d0e17/transformed/customview-1.1.0-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/f9598b3ae9b4a80a1cab857f8951e297/transformed/core-1.13.1-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/f9598b3ae9b4a80a1cab857f8951e297/transformed/core-1.13.1-runtime.jar is c48c3cd4bdbcbd0fc368666571fc7c40
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/f9598b3ae9b4a80a1cab857f8951e297/transformed/core-1.13.1-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/51771f134755fe21a9c80bc8f16e86ba/transformed/recyclerview-1.1.0-runtime.jar with cache key f8561157aa7fa65c28dbd2173f5c010e
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/bcd7b9bdc6dbc2c77feb546eb8d7b3ba/transformed/recyclerview-1.1.0-runtime because:
  Caching not enabled.
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/38e8ae89ad71c69c712d1051c00bf00d/transformed/work-runtime-2.9.1-runtime.jar with cache key 4048e3f2fd15d54874e53a398a3a80f7
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/272296edee5202d8afa9732329fbc68a/transformed/work-runtime-2.9.1-runtime because:
  Caching not enabled.
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/f9598b3ae9b4a80a1cab857f8951e297/transformed/core-1.13.1-runtime.jar with cache key c48c3cd4bdbcbd0fc368666571fc7c40
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/2e8fa25248a7fb9efd1bd956399b934b/transformed/core-1.13.1-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/296a1ed391ef058367c0497959ba26c3/transformed/jetified-lifecycle-livedata-core-ktx-2.8.6-runtime.jar because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/20e1cb001af2f2561d27aaa99ed8317b/transformed/jetified-savedstate-1.2.1-runtime.jar because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/cd926ea733bef1d502aec5cd8231fbc4/transformed/lifecycle-viewmodel-2.8.6-runtime.jar because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/6db27e7c364b08ce6810d4291ee603f0/transformed/jetified-lifecycle-viewmodel-release-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/296a1ed391ef058367c0497959ba26c3/transformed/jetified-lifecycle-livedata-core-ktx-2.8.6-runtime.jar is c639a6f11d4c3f1cee76f76883f5bf2d
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/296a1ed391ef058367c0497959ba26c3/transformed/jetified-lifecycle-livedata-core-ktx-2.8.6-runtime.jar'
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/20e1cb001af2f2561d27aaa99ed8317b/transformed/jetified-savedstate-1.2.1-runtime.jar is 70f2aca7e9753f2500381c5782b2b41d
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/20e1cb001af2f2561d27aaa99ed8317b/transformed/jetified-savedstate-1.2.1-runtime.jar'
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/cd926ea733bef1d502aec5cd8231fbc4/transformed/lifecycle-viewmodel-2.8.6-runtime.jar is c721bbc47bfdbcd0d945fb267a4e2ae7
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/6db27e7c364b08ce6810d4291ee603f0/transformed/jetified-lifecycle-viewmodel-release-runtime.jar is f5e4d3d2c008e8e22de04e53a3162b2e
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/6db27e7c364b08ce6810d4291ee603f0/transformed/jetified-lifecycle-viewmodel-release-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/296a1ed391ef058367c0497959ba26c3/transformed/jetified-lifecycle-livedata-core-ktx-2.8.6-runtime.jar with cache key c639a6f11d4c3f1cee76f76883f5bf2d
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/cd926ea733bef1d502aec5cd8231fbc4/transformed/lifecycle-viewmodel-2.8.6-runtime.jar'
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/174af9778fa2cde0ef2acf6c2faed617/transformed/jetified-lifecycle-livedata-core-ktx-2.8.6-runtime because:
  Caching not enabled.
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/cd926ea733bef1d502aec5cd8231fbc4/transformed/lifecycle-viewmodel-2.8.6-runtime.jar with cache key c721bbc47bfdbcd0d945fb267a4e2ae7
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/c5472990da36c5c42c63f41f300d8122/transformed/jetified-lifecycle-common-jvm-2.8.6.jar is cb10e27a48471d23a932592937de0c38
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/c5472990da36c5c42c63f41f300d8122/transformed/jetified-lifecycle-common-jvm-2.8.6.jar'
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/dfc36d69049f8f8624801490db2f3042/transformed/lifecycle-viewmodel-2.8.6-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/4eccddcd353921917198a02f19340897/transformed/jetified-lifecycle-runtime-release-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/4eccddcd353921917198a02f19340897/transformed/jetified-lifecycle-runtime-release-runtime.jar is be1199818f7f9a856653316125c10518
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/4eccddcd353921917198a02f19340897/transformed/jetified-lifecycle-runtime-release-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/20e1cb001af2f2561d27aaa99ed8317b/transformed/jetified-savedstate-1.2.1-runtime.jar with cache key 70f2aca7e9753f2500381c5782b2b41d
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/d71c2c74fcd8f9932b742d2e3f6d8dc3/transformed/jetified-savedstate-1.2.1-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/5335cb11c57d4e8b0c230e4be97c301a/transformed/jetified-lifecycle-service-2.8.6-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/5335cb11c57d4e8b0c230e4be97c301a/transformed/jetified-lifecycle-service-2.8.6-runtime.jar is b530c4a2ae8eff71f1db289ca30b740a
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/5335cb11c57d4e8b0c230e4be97c301a/transformed/jetified-lifecycle-service-2.8.6-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/5335cb11c57d4e8b0c230e4be97c301a/transformed/jetified-lifecycle-service-2.8.6-runtime.jar with cache key b530c4a2ae8eff71f1db289ca30b740a
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/612398f1ce7ccb9bda391f06fbdc6f93/transformed/jetified-lifecycle-service-2.8.6-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/78dbf4ea1de83d27e481897b4f3ef767/transformed/lifecycle-livedata-2.8.6-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/78dbf4ea1de83d27e481897b4f3ef767/transformed/lifecycle-livedata-2.8.6-runtime.jar is 52ad2bebcbc9d8e542485cf6c705f4b3
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/78dbf4ea1de83d27e481897b4f3ef767/transformed/lifecycle-livedata-2.8.6-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/6db27e7c364b08ce6810d4291ee603f0/transformed/jetified-lifecycle-viewmodel-release-runtime.jar with cache key f5e4d3d2c008e8e22de04e53a3162b2e
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/6426ca3fc33b951d1281911564d66ac1/transformed/jetified-lifecycle-viewmodel-release-runtime because:
  Caching not enabled.
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/c5472990da36c5c42c63f41f300d8122/transformed/jetified-lifecycle-common-jvm-2.8.6.jar with cache key cb10e27a48471d23a932592937de0c38
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/ecef19f9224a01fbbd4d68c7e0128a22/transformed/jetified-lifecycle-common-jvm-2.8.6 because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/2cabe600a5eb7d6ecc1f5c42a92a41b3/transformed/jetified-lifecycle-process-2.8.6-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/2cabe600a5eb7d6ecc1f5c42a92a41b3/transformed/jetified-lifecycle-process-2.8.6-runtime.jar is 5dd5cdfacfdb24096c0c2673641fb123
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/2cabe600a5eb7d6ecc1f5c42a92a41b3/transformed/jetified-lifecycle-process-2.8.6-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/4eccddcd353921917198a02f19340897/transformed/jetified-lifecycle-runtime-release-runtime.jar with cache key be1199818f7f9a856653316125c10518
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/0603b2d3d8e0f1d9e4d2261d0aa90089/transformed/jetified-lifecycle-runtime-release-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/14eca213c2b9f1b9f1d7ac1bcd6ea9b5/transformed/lifecycle-livedata-core-2.8.6-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/14eca213c2b9f1b9f1d7ac1bcd6ea9b5/transformed/lifecycle-livedata-core-2.8.6-runtime.jar is 4a4b9a289870373741012fbd96aae040
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/14eca213c2b9f1b9f1d7ac1bcd6ea9b5/transformed/lifecycle-livedata-core-2.8.6-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/2cabe600a5eb7d6ecc1f5c42a92a41b3/transformed/jetified-lifecycle-process-2.8.6-runtime.jar with cache key 5dd5cdfacfdb24096c0c2673641fb123
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/1314210b7a21d9c20889499e276bab1f/transformed/jetified-lifecycle-process-2.8.6-runtime because:
  Caching not enabled.
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/78dbf4ea1de83d27e481897b4f3ef767/transformed/lifecycle-livedata-2.8.6-runtime.jar with cache key 52ad2bebcbc9d8e542485cf6c705f4b3
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/5b3547219cec2a7754ba00527802dfd0/transformed/jetified-lifecycle-runtime-ktx-release-runtime.jar because:
  Caching not enabled.
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/c16529632bcd61c347235c0353b29e10/transformed/lifecycle-livedata-2.8.6-runtime because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/5b3547219cec2a7754ba00527802dfd0/transformed/jetified-lifecycle-runtime-ktx-release-runtime.jar is 80850c8397275d7eb2e583338061ac01
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/5b3547219cec2a7754ba00527802dfd0/transformed/jetified-lifecycle-runtime-ktx-release-runtime.jar'
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/d9ad51fe8adb0c69eef871ebd5d8d35f/transformed/jetified-lifecycle-viewmodel-savedstate-2.8.6-runtime.jar because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/ef08154dfed477a0386a5bc7d86c5223/transformed/jetified-core-ktx-1.13.1-runtime.jar because:
  Caching not enabled.
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/5b3547219cec2a7754ba00527802dfd0/transformed/jetified-lifecycle-runtime-ktx-release-runtime.jar with cache key 80850c8397275d7eb2e583338061ac01
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/d9ad51fe8adb0c69eef871ebd5d8d35f/transformed/jetified-lifecycle-viewmodel-savedstate-2.8.6-runtime.jar is 4553b1bc44ef0b026d36ecde2decb90d
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/4924f7aaea59b0fff40586e620b11f3e/transformed/jetified-lifecycle-runtime-ktx-release-runtime because:
  Caching not enabled.
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/14eca213c2b9f1b9f1d7ac1bcd6ea9b5/transformed/lifecycle-livedata-core-2.8.6-runtime.jar with cache key 4a4b9a289870373741012fbd96aae040
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/ef08154dfed477a0386a5bc7d86c5223/transformed/jetified-core-ktx-1.13.1-runtime.jar is 82b90b34ae11c8952c7ec22f71adc9dc
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/6db531ff40da2bf8dfcfc9c32e3861db/transformed/lifecycle-livedata-core-2.8.6-runtime because:
  Caching not enabled.
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/ef08154dfed477a0386a5bc7d86c5223/transformed/jetified-core-ktx-1.13.1-runtime.jar'
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/d9ad51fe8adb0c69eef871ebd5d8d35f/transformed/jetified-lifecycle-viewmodel-savedstate-2.8.6-runtime.jar'
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/00c71244d56e30e29e665a564cec1028/transformed/jetified-kotlinx-coroutines-core-jvm-1.8.1.jar is 6567680495963aa7ae9351a77a0543da
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/00c71244d56e30e29e665a564cec1028/transformed/jetified-kotlinx-coroutines-core-jvm-1.8.1.jar'
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/afd60fe5aac11dea2f0e84b90fba35b6/transformed/jetified-room-ktx-2.5.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/afd60fe5aac11dea2f0e84b90fba35b6/transformed/jetified-room-ktx-2.5.0-runtime.jar is 38ed6bfe9528138cb1082229a3bb4a61
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/afd60fe5aac11dea2f0e84b90fba35b6/transformed/jetified-room-ktx-2.5.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/d9ad51fe8adb0c69eef871ebd5d8d35f/transformed/jetified-lifecycle-viewmodel-savedstate-2.8.6-runtime.jar with cache key 4553b1bc44ef0b026d36ecde2decb90d
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/9d5c414fc63b047bc68a9559362722bf/transformed/jetified-lifecycle-viewmodel-savedstate-2.8.6-runtime because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/2937df7d59912034ec700471beb1517c/transformed/jetified-kotlinx-coroutines-android-1.8.1.jar is 6f092a61e226e41a006163b5822ba9b9
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/2937df7d59912034ec700471beb1517c/transformed/jetified-kotlinx-coroutines-android-1.8.1.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/afd60fe5aac11dea2f0e84b90fba35b6/transformed/jetified-room-ktx-2.5.0-runtime.jar with cache key 38ed6bfe9528138cb1082229a3bb4a61
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/b55a7c2d072b7d37d9903dd17c7c7dd1/transformed/jetified-room-ktx-2.5.0-runtime because:
  Caching not enabled.
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/2937df7d59912034ec700471beb1517c/transformed/jetified-kotlinx-coroutines-android-1.8.1.jar with cache key 6f092a61e226e41a006163b5822ba9b9
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/e67785e521c8814cc047efbe6043e4d4/transformed/jetified-kotlinx-coroutines-android-1.8.1 because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/697a89f578faad697004753f2c391490/transformed/room-runtime-2.5.0-runtime.jar because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/79526b60109ccdabdb1d4fe1171bafc1/transformed/jetified-annotation-experimental-1.4.1-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/697a89f578faad697004753f2c391490/transformed/room-runtime-2.5.0-runtime.jar is 27fa4528f33f8a99fbf2ba16872b6735
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/697a89f578faad697004753f2c391490/transformed/room-runtime-2.5.0-runtime.jar'
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/79526b60109ccdabdb1d4fe1171bafc1/transformed/jetified-annotation-experimental-1.4.1-runtime.jar is 2a1ba203a08a04d826dc5cee698cf3f2
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/79526b60109ccdabdb1d4fe1171bafc1/transformed/jetified-annotation-experimental-1.4.1-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/79526b60109ccdabdb1d4fe1171bafc1/transformed/jetified-annotation-experimental-1.4.1-runtime.jar with cache key 2a1ba203a08a04d826dc5cee698cf3f2
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/4cdbfb43259bb598c5d0f18545d9fbc8/transformed/jetified-annotation-experimental-1.4.1-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/f187abf4b399a48dd18767129de5f3e7/transformed/jetified-security-crypto-1.1.0-alpha06-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/f187abf4b399a48dd18767129de5f3e7/transformed/jetified-security-crypto-1.1.0-alpha06-runtime.jar is 646279684bbd2a177a943f933612180a
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/f187abf4b399a48dd18767129de5f3e7/transformed/jetified-security-crypto-1.1.0-alpha06-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/f187abf4b399a48dd18767129de5f3e7/transformed/jetified-security-crypto-1.1.0-alpha06-runtime.jar with cache key 646279684bbd2a177a943f933612180a
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/10dd566777aa790b16b9984da04c743a/transformed/jetified-security-crypto-1.1.0-alpha06-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/bd83a6e9b948a068c5801f6cccae63dc/transformed/cursoradapter-1.0.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/bd83a6e9b948a068c5801f6cccae63dc/transformed/cursoradapter-1.0.0-runtime.jar is 46a2802e03d2a705bbb0c84ce5157076
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/bd83a6e9b948a068c5801f6cccae63dc/transformed/cursoradapter-1.0.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/bd83a6e9b948a068c5801f6cccae63dc/transformed/cursoradapter-1.0.0-runtime.jar with cache key 46a2802e03d2a705bbb0c84ce5157076
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/87193af7bccc351c9cc394add1022db7/transformed/cursoradapter-1.0.0-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/4755dac3ac183d3943d1305aee7df5cb/transformed/jetified-profileinstaller-1.3.1-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/4755dac3ac183d3943d1305aee7df5cb/transformed/jetified-profileinstaller-1.3.1-runtime.jar is d4008b2cf50efe67802ac9e99911c544
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/4755dac3ac183d3943d1305aee7df5cb/transformed/jetified-profileinstaller-1.3.1-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/4755dac3ac183d3943d1305aee7df5cb/transformed/jetified-profileinstaller-1.3.1-runtime.jar with cache key d4008b2cf50efe67802ac9e99911c544
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/46470b14ae1b5957d440b12d7cf6489a/transformed/jetified-profileinstaller-1.3.1-runtime because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/fa53762cd6d725b193d575bd9bd78c4e/transformed/jetified-resourceinspection-annotation-1.0.1.jar is 7752a8142907b3117fb808106dbf0f55
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/fa53762cd6d725b193d575bd9bd78c4e/transformed/jetified-resourceinspection-annotation-1.0.1.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/ef08154dfed477a0386a5bc7d86c5223/transformed/jetified-core-ktx-1.13.1-runtime.jar with cache key 82b90b34ae11c8952c7ec22f71adc9dc
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/03b691e96b28f888d159db85e06dba33/transformed/jetified-core-ktx-1.13.1-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/caec0a020f8d25e61543c4b5516b11e3/transformed/cardview-1.0.0-runtime.jar because:
  Caching not enabled.
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/fa53762cd6d725b193d575bd9bd78c4e/transformed/jetified-resourceinspection-annotation-1.0.1.jar with cache key 7752a8142907b3117fb808106dbf0f55
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/2a30314cd27cbddeaee52f9208d008b3/transformed/jetified-resourceinspection-annotation-1.0.1 because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/caec0a020f8d25e61543c4b5516b11e3/transformed/cardview-1.0.0-runtime.jar is 44bb2c710c3e1b6adec922521948c96b
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/caec0a020f8d25e61543c4b5516b11e3/transformed/cardview-1.0.0-runtime.jar'
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/862760bf4aaac563abaa954f5169d87b/transformed/versionedparcelable-1.1.1-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/862760bf4aaac563abaa954f5169d87b/transformed/versionedparcelable-1.1.1-runtime.jar is f23226016431ad9a9b5d0c7c11965887
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/862760bf4aaac563abaa954f5169d87b/transformed/versionedparcelable-1.1.1-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/caec0a020f8d25e61543c4b5516b11e3/transformed/cardview-1.0.0-runtime.jar with cache key 44bb2c710c3e1b6adec922521948c96b
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/b6c289942f118ceb1a5826d9ad9d11bd/transformed/cardview-1.0.0-runtime because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.collection/collection/1.1.0/1f27220b47669781457de0d600849a5de0e89909/collection-1.1.0.jar is 05e3d1bf8f7d1881410d242da9f44a28
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/modules-2/files-2.1/androidx.collection/collection/1.1.0/1f27220b47669781457de0d600849a5de0e89909/collection-1.1.0.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/862760bf4aaac563abaa954f5169d87b/transformed/versionedparcelable-1.1.1-runtime.jar with cache key f23226016431ad9a9b5d0c7c11965887
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/ca6e1bc762f6c5f51702bf04c95ac05b/transformed/versionedparcelable-1.1.1-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/cc680367c684e66ce3eb803f0aff027b/transformed/interpolator-1.0.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/cc680367c684e66ce3eb803f0aff027b/transformed/interpolator-1.0.0-runtime.jar is 72ca6c08fc8cbddf1c1b02514152b688
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/cc680367c684e66ce3eb803f0aff027b/transformed/interpolator-1.0.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/cc680367c684e66ce3eb803f0aff027b/transformed/interpolator-1.0.0-runtime.jar with cache key 72ca6c08fc8cbddf1c1b02514152b688
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/1b325402043205cbb37f24f1bb5cdd8a/transformed/interpolator-1.0.0-runtime because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/5005dcef20f913fe48d5389f6cbf4001/transformed/jetified-concurrent-futures-1.1.0.jar is c7e3704e003de61f246db2773db3ab97
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/5005dcef20f913fe48d5389f6cbf4001/transformed/jetified-concurrent-futures-1.1.0.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/697a89f578faad697004753f2c391490/transformed/room-runtime-2.5.0-runtime.jar with cache key 27fa4528f33f8a99fbf2ba16872b6735
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/1ff28dc1eaba1e8e81934b231c194e40/transformed/room-runtime-2.5.0-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/e9c8aa9d486064c73a4faca714e91981/transformed/jetified-startup-runtime-1.1.1-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/e9c8aa9d486064c73a4faca714e91981/transformed/jetified-startup-runtime-1.1.1-runtime.jar is 70d5b6e0bcb7fb0ecefd2d125dead97b
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/e9c8aa9d486064c73a4faca714e91981/transformed/jetified-startup-runtime-1.1.1-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/e9c8aa9d486064c73a4faca714e91981/transformed/jetified-startup-runtime-1.1.1-runtime.jar with cache key 70d5b6e0bcb7fb0ecefd2d125dead97b
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/eba4f3b7cfb101bcde97b890f26dfc5a/transformed/jetified-startup-runtime-1.1.1-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/2ab26f7bf640317005bb8d25e11d6fc2/transformed/jetified-tracing-1.0.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/2ab26f7bf640317005bb8d25e11d6fc2/transformed/jetified-tracing-1.0.0-runtime.jar is 51cd9ce84acfc8c919a2ff16329d2e09
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/2ab26f7bf640317005bb8d25e11d6fc2/transformed/jetified-tracing-1.0.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.collection/collection/1.1.0/1f27220b47669781457de0d600849a5de0e89909/collection-1.1.0.jar with cache key 05e3d1bf8f7d1881410d242da9f44a28
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/40d02e81a9b5c23de368a314cb01882b/transformed/collection-1.1.0 because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/dd40cc6df3ec22c4a58768607bc9065b/transformed/sqlite-framework-2.3.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/dd40cc6df3ec22c4a58768607bc9065b/transformed/sqlite-framework-2.3.0-runtime.jar is d93444a25e145a9d6d305b5545a5ce62
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/dd40cc6df3ec22c4a58768607bc9065b/transformed/sqlite-framework-2.3.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/5005dcef20f913fe48d5389f6cbf4001/transformed/jetified-concurrent-futures-1.1.0.jar with cache key c7e3704e003de61f246db2773db3ab97
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/a301e3aefcf5a1dff351164f7ad8debc/transformed/jetified-concurrent-futures-1.1.0 because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/22b7620688c26f36b4e33f2dded56841/transformed/documentfile-1.0.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/22b7620688c26f36b4e33f2dded56841/transformed/documentfile-1.0.0-runtime.jar is 83bbe3ce63945dbbf35297a6239ce2e3
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/22b7620688c26f36b4e33f2dded56841/transformed/documentfile-1.0.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/2ab26f7bf640317005bb8d25e11d6fc2/transformed/jetified-tracing-1.0.0-runtime.jar with cache key 51cd9ce84acfc8c919a2ff16329d2e09
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/8c83aa39c4f68da504d1183843188a7b/transformed/jetified-tracing-1.0.0-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/e5cb1903368289f23e289c6870400ff7/transformed/localbroadcastmanager-1.0.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/e5cb1903368289f23e289c6870400ff7/transformed/localbroadcastmanager-1.0.0-runtime.jar is 33cb8bf3d8201523c18f2c593481d93d
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/e5cb1903368289f23e289c6870400ff7/transformed/localbroadcastmanager-1.0.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/e5cb1903368289f23e289c6870400ff7/transformed/localbroadcastmanager-1.0.0-runtime.jar with cache key 33cb8bf3d8201523c18f2c593481d93d
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/16c0d5ce5ad28171c1ad1d245e1ed7e8/transformed/localbroadcastmanager-1.0.0-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/7ccc3d2b092d2f298638ebbfb156847a/transformed/print-1.0.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/7ccc3d2b092d2f298638ebbfb156847a/transformed/print-1.0.0-runtime.jar is f5da6746fa0749e8cf716dc08146f40d
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/7ccc3d2b092d2f298638ebbfb156847a/transformed/print-1.0.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/22b7620688c26f36b4e33f2dded56841/transformed/documentfile-1.0.0-runtime.jar with cache key 83bbe3ce63945dbbf35297a6239ce2e3
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/c3c4ca516d4fbd06c7c5813588a78572/transformed/documentfile-1.0.0-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/0d3122c9cc36089783e22acffb3fd47c/transformed/core-runtime-2.2.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/0d3122c9cc36089783e22acffb3fd47c/transformed/core-runtime-2.2.0-runtime.jar is b844476632ad7ea2dd17d595273ff3a8
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/0d3122c9cc36089783e22acffb3fd47c/transformed/core-runtime-2.2.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/0d3122c9cc36089783e22acffb3fd47c/transformed/core-runtime-2.2.0-runtime.jar with cache key b844476632ad7ea2dd17d595273ff3a8
INFO: D8: Stripped invalid locals information from 1 method.
INFO: /home/runner/.gradle/caches/9.6.1/transforms/7ccc3d2b092d2f298638ebbfb156847a/transformed/print-1.0.0-runtime.jar: D8: Methods with invalid locals information:
  void androidx.print.PrintHelper$PrintUriAdapter$1.onPostExecute(android.graphics.Bitmap)
  Information in locals-table is invalid with respect to the stack map table. Local refers to non-present stack map type for register: 2 with constraint OBJECT.
INFO: D8: Some warnings are typically a sign of using an outdated Java toolchain. To fix, recompile the source with an updated toolchain.
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/f5ae6ecbb96dc1c70295ff415834b4d5/transformed/core-runtime-2.2.0-runtime because:
  Caching not enabled.
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/7ccc3d2b092d2f298638ebbfb156847a/transformed/print-1.0.0-runtime.jar with cache key f5da6746fa0749e8cf716dc08146f40d
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/99cf13a6b4d65844bc853109143faace/transformed/print-1.0.0-runtime because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.arch.core/core-common/2.2.0/5e1b8b81dfd5f52c56a8d53b18ca759c19a301f3/core-common-2.2.0.jar is 5e27d956d4953b5b3c84cf78a5634f08
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/modules-2/files-2.1/androidx.arch.core/core-common/2.2.0/5e1b8b81dfd5f52c56a8d53b18ca759c19a301f3/core-common-2.2.0.jar'
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.room/room-common/2.5.0/829a83fb92f1696a8a32f3beea884dfc87b2693/room-common-2.5.0.jar is 135d644755fd9c068f7a92d2301c827d
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/modules-2/files-2.1/androidx.room/room-common/2.5.0/829a83fb92f1696a8a32f3beea884dfc87b2693/room-common-2.5.0.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/dd40cc6df3ec22c4a58768607bc9065b/transformed/sqlite-framework-2.3.0-runtime.jar with cache key d93444a25e145a9d6d305b5545a5ce62
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/88c56475c3b05dc6af8a9cca39e788dd/transformed/sqlite-framework-2.3.0-runtime because:
  Caching not enabled.
Caching disabled for IdentityTransform: /home/runner/.gradle/caches/9.6.1/transforms/5e5ce9bf5a62c4c8c56c45afef489d2c/transformed/sqlite-2.3.0-runtime.jar because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/5e5ce9bf5a62c4c8c56c45afef489d2c/transformed/sqlite-2.3.0-runtime.jar is 0863971b22e30cbd91edb72455754a71
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/5e5ce9bf5a62c4c8c56c45afef489d2c/transformed/sqlite-2.3.0-runtime.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.arch.core/core-common/2.2.0/5e1b8b81dfd5f52c56a8d53b18ca759c19a301f3/core-common-2.2.0.jar with cache key 5e27d956d4953b5b3c84cf78a5634f08
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/0d6cc5f95d9f86993f5df0307ef5d3a9/transformed/core-common-2.2.0 because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/8759d1199b9322e969301f66ae6fccfc/transformed/jetified-annotation-jvm-1.8.1.jar is e737ae282213ec52f3bedc54302013fb
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/8759d1199b9322e969301f66ae6fccfc/transformed/jetified-annotation-jvm-1.8.1.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/5e5ce9bf5a62c4c8c56c45afef489d2c/transformed/sqlite-2.3.0-runtime.jar with cache key 0863971b22e30cbd91edb72455754a71
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/66903924b9a41c62dae4c2f4bb2d0516/transformed/sqlite-2.3.0-runtime because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/9e2fcab835fa8bc2dde15359f99e8829/transformed/jetified-kotlin-stdlib-jdk8-1.8.22.jar is ecc7e6511a5b892ed4ed2be6ea77ab7d
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/9e2fcab835fa8bc2dde15359f99e8829/transformed/jetified-kotlin-stdlib-jdk8-1.8.22.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/9e2fcab835fa8bc2dde15359f99e8829/transformed/jetified-kotlin-stdlib-jdk8-1.8.22.jar with cache key ecc7e6511a5b892ed4ed2be6ea77ab7d
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/8b9e3d470d53ba456fd62f351954ca44/transformed/jetified-kotlin-stdlib-jdk8-1.8.22 because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/ee65f1d2022b710ab7d6f0da51fffaa3/transformed/jetified-kotlin-stdlib-jdk7-1.8.22.jar is 61a556870ed779bc050ac537dee2a11f
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/ee65f1d2022b710ab7d6f0da51fffaa3/transformed/jetified-kotlin-stdlib-jdk7-1.8.22.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/ee65f1d2022b710ab7d6f0da51fffaa3/transformed/jetified-kotlin-stdlib-jdk7-1.8.22.jar with cache key 61a556870ed779bc050ac537dee2a11f
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/1e1d57f22137bf64422a90452eaa5ed5/transformed/jetified-kotlin-stdlib-jdk7-1.8.22 because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/26842c3548c0c8b4a2a895cece1566da/transformed/jetified-kotlin-stdlib-2.0.21.jar is 37e6b562196448ec9f52e9329a4ea26b
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/26842c3548c0c8b4a2a895cece1566da/transformed/jetified-kotlin-stdlib-2.0.21.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/8759d1199b9322e969301f66ae6fccfc/transformed/jetified-annotation-jvm-1.8.1.jar with cache key e737ae282213ec52f3bedc54302013fb
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/64753baf7321f81d12848e095ddcd02d/transformed/jetified-annotation-jvm-1.8.1 because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/4281ba71ab757f148653e1221ff6962b/transformed/jetified-annotations-23.0.0.jar is d6bc78ab9c4f44e6b804f86ccde338ec
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/4281ba71ab757f148653e1221ff6962b/transformed/jetified-annotations-23.0.0.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/4281ba71ab757f148653e1221ff6962b/transformed/jetified-annotations-23.0.0.jar with cache key d6bc78ab9c4f44e6b804f86ccde338ec
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.room/room-common/2.5.0/829a83fb92f1696a8a32f3beea884dfc87b2693/room-common-2.5.0.jar with cache key 135d644755fd9c068f7a92d2301c827d
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/b747c6b36d80f1696953e8190deae582/transformed/room-common-2.5.0 because:
  Caching not enabled.
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/b35ed3d3f615fb5b60e73d65028eeca7/transformed/jetified-annotations-23.0.0 because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/84228bebc2f062b3b77800a9d2330e12/transformed/jetified-error_prone_annotations-2.15.0.jar is 4aec812fc20927de6f519dfd5fdd50ad
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/84228bebc2f062b3b77800a9d2330e12/transformed/jetified-error_prone_annotations-2.15.0.jar'
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/fce7b73cf0255e07a209dbdc1d220432/transformed/jetified-tink-android-1.8.0.jar is fa43cb3b4ca6e4f6c25b92530612c653
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/fce7b73cf0255e07a209dbdc1d220432/transformed/jetified-tink-android-1.8.0.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/84228bebc2f062b3b77800a9d2330e12/transformed/jetified-error_prone_annotations-2.15.0.jar with cache key 4aec812fc20927de6f519dfd5fdd50ad
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/dbc3b52822c6198586a56550ee043f38/transformed/jetified-error_prone_annotations-2.15.0 because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/eff8a650d3c007509d895736950924cd/transformed/jetified-listenablefuture-1.0.jar is 93e6c81da75aaa20443bba8b07f27604
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/eff8a650d3c007509d895736950924cd/transformed/jetified-listenablefuture-1.0.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/eff8a650d3c007509d895736950924cd/transformed/jetified-listenablefuture-1.0.jar with cache key 93e6c81da75aaa20443bba8b07f27604
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/2d985dc783eb2ff592a0e5242c8c5a37/transformed/jetified-listenablefuture-1.0 because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.constraintlayout/constraintlayout-solver/2.0.1/30988fe2d77f3fe3bf7551bb8a8b795fad7e7226/constraintlayout-solver-2.0.1.jar is 32c8b67f38ac21d67a23181701ee178e
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/modules-2/files-2.1/androidx.constraintlayout/constraintlayout-solver/2.0.1/30988fe2d77f3fe3bf7551bb8a8b795fad7e7226/constraintlayout-solver-2.0.1.jar'
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/modules-2/files-2.1/androidx.constraintlayout/constraintlayout-solver/2.0.1/30988fe2d77f3fe3bf7551bb8a8b795fad7e7226/constraintlayout-solver-2.0.1.jar with cache key 32c8b67f38ac21d67a23181701ee178e
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/be31195669d4c276533f41da7d82617e/transformed/constraintlayout-solver-2.0.1 because:
  Caching not enabled.
Build cache key for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/2e90b1ddfe9922cc51a0a3e2fe4c3caa/transformed/jetified-gson-2.8.9.jar is 918e77103a3cd79f005ced6f11ce171a
Running dexing transform non-incrementally for '/home/runner/.gradle/caches/9.6.1/transforms/2e90b1ddfe9922cc51a0a3e2fe4c3caa/transformed/jetified-gson-2.8.9.jar'
INFO: D8: Stripped invalid locals information from 2 methods.
INFO: /home/runner/.gradle/caches/9.6.1/transforms/00c71244d56e30e29e665a564cec1028/transformed/jetified-kotlinx-coroutines-core-jvm-1.8.1.jar: D8: Methods with invalid locals information:
  java.lang.Object kotlinx.coroutines.flow.FlowKt__BuildersKt$asFlow$$inlined$unsafeFlow$10.collect(kotlinx.coroutines.flow.FlowCollector, kotlin.coroutines.Continuation)
  Attempt to define local of type long as element$iv:java.lang.Object
INFO: /home/runner/.gradle/caches/9.6.1/transforms/00c71244d56e30e29e665a564cec1028/transformed/jetified-kotlinx-coroutines-core-jvm-1.8.1.jar: D8: Methods with invalid locals information:
  java.lang.Object kotlinx.coroutines.flow.FlowKt__BuildersKt$asFlow$$inlined$unsafeFlow$9.collect(kotlinx.coroutines.flow.FlowCollector, kotlin.coroutines.Continuation)
  Attempt to define local of type int as element$iv:java.lang.Object
INFO: D8: Some warnings are typically a sign of using an outdated Java toolchain. To fix, recompile the source with an updated toolchain.
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/00c71244d56e30e29e665a564cec1028/transformed/jetified-kotlinx-coroutines-core-jvm-1.8.1.jar with cache key 6567680495963aa7ae9351a77a0543da
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/e22a32826a2374b00ca4c9be12c3dbb3/transformed/jetified-kotlinx-coroutines-core-jvm-1.8.1 because:
  Caching not enabled.
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/2e90b1ddfe9922cc51a0a3e2fe4c3caa/transformed/jetified-gson-2.8.9.jar with cache key 918e77103a3cd79f005ced6f11ce171a
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/80015cbe5c15b50b19aa0a9266e1a1ef/transformed/jetified-gson-2.8.9 because:
  Caching not enabled.
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/26842c3548c0c8b4a2a895cece1566da/transformed/jetified-kotlin-stdlib-2.0.21.jar with cache key 37e6b562196448ec9f52e9329a4ea26b
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/66ba2afa3da06b6e1255af13849b1d0a/transformed/jetified-kotlin-stdlib-2.0.21 because:
  Caching not enabled.
Stored cache entry for DexingNoClasspathTransform: /home/runner/.gradle/caches/9.6.1/transforms/fce7b73cf0255e07a209dbdc1d220432/transformed/jetified-tink-android-1.8.0.jar with cache key fa43cb3b4ca6e4f6c25b92530612c653
Caching disabled for DexingOutputSplitTransform: /home/runner/.gradle/caches/9.6.1/transforms/9d6b5a48b5d516568dc8a0674d3b5a41/transformed/jetified-tink-android-1.8.0 because:
  Caching not enabled.
Build cache key for task ':app:mergeExtDexDebug' is e0d76b68aece9e860a3e6ea355d562b7
Task ':app:mergeExtDexDebug' is not up-to-date because:
  No history is available.
The input changes require a full rebuild for incremental task ':app:mergeExtDexDebug'.
Merging to '/home/runner/work/Orbitpress/Orbitpress/app/build/intermediates/dex/debug/mergeExtDexDebug' with D8 from all or a subset of dex files in /home/runner/.gradle/caches/9.6.1/transforms/929bea915f28e069414f6160f0b952a5/transformed/material-1.12.0-runtime/material-1.12.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/3c670f59229b18a856db00ab6d2aa89c/transformed/jetified-appcompat-resources-1.7.0-runtime/jetified-appcompat-resources-1.7.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/80d7c0e3426a1d4758bce94b766bc232/transformed/constraintlayout-2.0.1-runtime/constraintlayout-2.0.1-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/1d319b9305c3f0eb8046037011582bc8/transformed/appcompat-1.7.0-runtime/appcompat-1.7.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/d2713db9fad5cc4d08e83f701fe28471/transformed/webkit-1.12.1-runtime/webkit-1.12.1-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/ef03233e3d288b50b6febd6affbb86f5/transformed/jetified-emoji2-views-helper-1.3.0-runtime/jetified-emoji2-views-helper-1.3.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/dc1a5a7e077a2cd4598fe93e1ad5af1b/transformed/jetified-emoji2-1.3.0-runtime/jetified-emoji2-1.3.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/a2a2e68ff6f0dca35f0a7c46f6452698/transformed/jetified-viewpager2-1.0.0-runtime/jetified-viewpager2-1.0.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/81013f3cae8cd6184934706414198b16/transformed/fragment-1.5.4-runtime/fragment-1.5.4-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/317edcbd1b365c6fe883eae438dc84dd/transformed/jetified-activity-1.8.0-runtime/jetified-activity-1.8.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/b114edada4215b1c88e2d87c0aa3e8e4/transformed/drawerlayout-1.1.1-runtime/drawerlayout-1.1.1-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/48621d00476ee6611113f8f1db668739/transformed/coordinatorlayout-1.1.0-runtime/coordinatorlayout-1.1.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/ecdd9a7a0aa999b322da0c3147c6519e/transformed/transition-1.5.0-runtime/transition-1.5.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/0cc65163b76fa8a9d7ff21d315e8e0d8/transformed/dynamicanimation-1.0.0-runtime/dynamicanimation-1.0.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/ac52abfd28f0c66651aabf2766dc27cc/transformed/vectordrawable-animated-1.1.0-runtime/vectordrawable-animated-1.1.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/ed8e49836e6ff409eff037f6eb0c6e41/transformed/vectordrawable-1.1.0-runtime/vectordrawable-1.1.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/272296edee5202d8afa9732329fbc68a/transformed/work-runtime-2.9.1-runtime/work-runtime-2.9.1-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/e187df80341d91f547466072e18d3c78/transformed/legacy-support-core-utils-1.0.0-runtime/legacy-support-core-utils-1.0.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/3907bd52f049a7c41de522c37d35d3fc/transformed/loader-1.0.0-runtime/loader-1.0.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/d93017b69f0c883dda994fdae244f758/transformed/viewpager-1.0.0-runtime/viewpager-1.0.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/bcd7b9bdc6dbc2c77feb546eb8d7b3ba/transformed/recyclerview-1.1.0-runtime/recyclerview-1.1.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/931ffd3e20ea9840b2c097587c1d0e17/transformed/customview-1.1.0-runtime/customview-1.1.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/2e8fa25248a7fb9efd1bd956399b934b/transformed/core-1.13.1-runtime/core-1.13.1-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/d71c2c74fcd8f9932b742d2e3f6d8dc3/transformed/jetified-savedstate-1.2.1-runtime/jetified-savedstate-1.2.1-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/6426ca3fc33b951d1281911564d66ac1/transformed/jetified-lifecycle-viewmodel-release-runtime/jetified-lifecycle-viewmodel-release-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/ecef19f9224a01fbbd4d68c7e0128a22/transformed/jetified-lifecycle-common-jvm-2.8.6/jetified-lifecycle-common-jvm-2.8.6_dex, /home/runner/.gradle/caches/9.6.1/transforms/0603b2d3d8e0f1d9e4d2261d0aa90089/transformed/jetified-lifecycle-runtime-release-runtime/jetified-lifecycle-runtime-release-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/612398f1ce7ccb9bda391f06fbdc6f93/transformed/jetified-lifecycle-service-2.8.6-runtime/jetified-lifecycle-service-2.8.6-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/c16529632bcd61c347235c0353b29e10/transformed/lifecycle-livedata-2.8.6-runtime/lifecycle-livedata-2.8.6-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/1314210b7a21d9c20889499e276bab1f/transformed/jetified-lifecycle-process-2.8.6-runtime/jetified-lifecycle-process-2.8.6-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/6db531ff40da2bf8dfcfc9c32e3861db/transformed/lifecycle-livedata-core-2.8.6-runtime/lifecycle-livedata-core-2.8.6-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/9d5c414fc63b047bc68a9559362722bf/transformed/jetified-lifecycle-viewmodel-savedstate-2.8.6-runtime/jetified-lifecycle-viewmodel-savedstate-2.8.6-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/03b691e96b28f888d159db85e06dba33/transformed/jetified-core-ktx-1.13.1-runtime/jetified-core-ktx-1.13.1-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/e22a32826a2374b00ca4c9be12c3dbb3/transformed/jetified-kotlinx-coroutines-core-jvm-1.8.1/jetified-kotlinx-coroutines-core-jvm-1.8.1_dex, /home/runner/.gradle/caches/9.6.1/transforms/b55a7c2d072b7d37d9903dd17c7c7dd1/transformed/jetified-room-ktx-2.5.0-runtime/jetified-room-ktx-2.5.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/e67785e521c8814cc047efbe6043e4d4/transformed/jetified-kotlinx-coroutines-android-1.8.1/jetified-kotlinx-coroutines-android-1.8.1_dex, /home/runner/.gradle/caches/9.6.1/transforms/1ff28dc1eaba1e8e81934b231c194e40/transformed/room-runtime-2.5.0-runtime/room-runtime-2.5.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/4cdbfb43259bb598c5d0f18545d9fbc8/transformed/jetified-annotation-experimental-1.4.1-runtime/jetified-annotation-experimental-1.4.1-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/10dd566777aa790b16b9984da04c743a/transformed/jetified-security-crypto-1.1.0-alpha06-runtime/jetified-security-crypto-1.1.0-alpha06-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/87193af7bccc351c9cc394add1022db7/transformed/cursoradapter-1.0.0-runtime/cursoradapter-1.0.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/46470b14ae1b5957d440b12d7cf6489a/transformed/jetified-profileinstaller-1.3.1-runtime/jetified-profileinstaller-1.3.1-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/2a30314cd27cbddeaee52f9208d008b3/transformed/jetified-resourceinspection-annotation-1.0.1/jetified-resourceinspection-annotation-1.0.1_dex, /home/runner/.gradle/caches/9.6.1/transforms/b6c289942f118ceb1a5826d9ad9d11bd/transformed/cardview-1.0.0-runtime/cardview-1.0.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/ca6e1bc762f6c5f51702bf04c95ac05b/transformed/versionedparcelable-1.1.1-runtime/versionedparcelable-1.1.1-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/40d02e81a9b5c23de368a314cb01882b/transformed/collection-1.1.0/collection-1.1.0_dex, /home/runner/.gradle/caches/9.6.1/transforms/1b325402043205cbb37f24f1bb5cdd8a/transformed/interpolator-1.0.0-runtime/interpolator-1.0.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/a301e3aefcf5a1dff351164f7ad8debc/transformed/jetified-concurrent-futures-1.1.0/jetified-concurrent-futures-1.1.0_dex, /home/runner/.gradle/caches/9.6.1/transforms/eba4f3b7cfb101bcde97b890f26dfc5a/transformed/jetified-startup-runtime-1.1.1-runtime/jetified-startup-runtime-1.1.1-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/8c83aa39c4f68da504d1183843188a7b/transformed/jetified-tracing-1.0.0-runtime/jetified-tracing-1.0.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/88c56475c3b05dc6af8a9cca39e788dd/transformed/sqlite-framework-2.3.0-runtime/sqlite-framework-2.3.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/c3c4ca516d4fbd06c7c5813588a78572/transformed/documentfile-1.0.0-runtime/documentfile-1.0.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/16c0d5ce5ad28171c1ad1d245e1ed7e8/transformed/localbroadcastmanager-1.0.0-runtime/localbroadcastmanager-1.0.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/99cf13a6b4d65844bc853109143faace/transformed/print-1.0.0-runtime/print-1.0.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/f5ae6ecbb96dc1c70295ff415834b4d5/transformed/core-runtime-2.2.0-runtime/core-runtime-2.2.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/0d6cc5f95d9f86993f5df0307ef5d3a9/transformed/core-common-2.2.0/core-common-2.2.0_dex, /home/runner/.gradle/caches/9.6.1/transforms/b747c6b36d80f1696953e8190deae582/transformed/room-common-2.5.0/room-common-2.5.0_dex, /home/runner/.gradle/caches/9.6.1/transforms/66903924b9a41c62dae4c2f4bb2d0516/transformed/sqlite-2.3.0-runtime/sqlite-2.3.0-runtime_dex, /home/runner/.gradle/caches/9.6.1/transforms/64753baf7321f81d12848e095ddcd02d/transformed/jetified-annotation-jvm-1.8.1/jetified-annotation-jvm-1.8.1_dex, /home/runner/.gradle/caches/9.6.1/transforms/66ba2afa3da06b6e1255af13849b1d0a/transformed/jetified-kotlin-stdlib-2.0.21/jetified-kotlin-stdlib-2.0.21_dex, /home/runner/.gradle/caches/9.6.1/transforms/b35ed3d3f615fb5b60e73d65028eeca7/transformed/jetified-annotations-23.0.0/jetified-annotations-23.0.0_dex, /home/runner/.gradle/caches/9.6.1/transforms/dbc3b52822c6198586a56550ee043f38/transformed/jetified-error_prone_annotations-2.15.0/jetified-error_prone_annotations-2.15.0_dex, /home/runner/.gradle/caches/9.6.1/transforms/9d6b5a48b5d516568dc8a0674d3b5a41/transformed/jetified-tink-android-1.8.0/jetified-tink-android-1.8.0_dex, /home/runner/.gradle/caches/9.6.1/transforms/2d985dc783eb2ff592a0e5242c8c5a37/transformed/jetified-listenablefuture-1.0/jetified-listenablefuture-1.0_dex, /home/runner/.gradle/caches/9.6.1/transforms/be31195669d4c276533f41da7d82617e/transformed/constraintlayout-solver-2.0.1/constraintlayout-solver-2.0.1_dex, /home/runner/.gradle/caches/9.6.1/transforms/80015cbe5c15b50b19aa0a9266e1a1ef/transformed/jetified-gson-2.8.9/jetified-gson-2.8.9_dex, and from all global synthetics files in 
Stored cache entry for task ':app:mergeExtDexDebug' with cache key e0d76b68aece9e860a3e6ea355d562b7

[Incubating] Problems report is available at: file:///home/runner/work/Orbitpress/Orbitpress/build/reports/problems/problems-report.html

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':app:compileDebugKotlin' (registered by plugin 'org.jetbrains.kotlin.android').
> A failure occurred while executing org.jetbrains.kotlin.compilerRunner.GradleCompilerRunnerWithWorkers$GradleKotlinCompilerWorkAction
   > Compilation error. See log for more details

* Try:
> Run with --debug option to get more log output.
> Run with --scan to get full insights from a Build Scan (powered by Develocity).
> Get more help at https://help.gradle.org.

* Exception is:
org.gradle.api.tasks.TaskExecutionException: Execution failed for task ':app:compileDebugKotlin' (registered by plugin 'org.jetbrains.kotlin.android').
	at org.gradle.api.internal.tasks.execution.ExecuteActionsTaskExecuter.lambda$executeIfValid$1(ExecuteActionsTaskExecuter.java:135)
	at org.gradle.internal.Try$Failure.ifSuccessfulOrElse(Try.java:288)
	at org.gradle.api.internal.tasks.execution.ExecuteActionsTaskExecuter.executeIfValid(ExecuteActionsTaskExecuter.java:133)
	at org.gradle.api.internal.tasks.execution.ExecuteActionsTaskExecuter.execute(ExecuteActionsTaskExecuter.java:121)
	at org.gradle.api.internal.tasks.execution.ProblemsTaskPathTrackingTaskExecuter.execute(ProblemsTaskPathTrackingTaskExecuter.java:41)
	at org.gradle.api.internal.tasks.execution.ResolveTaskExecutionModeExecuter.execute(ResolveTaskExecutionModeExecuter.java:51)
	at org.gradle.api.internal.tasks.execution.FinalizePropertiesTaskExecuter.execute(FinalizePropertiesTaskExecuter.java:46)
	at org.gradle.api.internal.tasks.execution.SkipTaskWithNoActionsExecuter.execute(SkipTaskWithNoActionsExecuter.java:57)
	at org.gradle.api.internal.tasks.execution.SkipOnlyIfTaskExecuter.execute(SkipOnlyIfTaskExecuter.java:74)
	at org.gradle.api.internal.tasks.execution.CatchExceptionTaskExecuter.execute(CatchExceptionTaskExecuter.java:36)
	at org.gradle.api.internal.tasks.execution.EventFiringTaskExecuter$1.executeTask(EventFiringTaskExecuter.java:77)
	at org.gradle.api.internal.tasks.execution.EventFiringTaskExecuter$1.call(EventFiringTaskExecuter.java:55)
	at org.gradle.api.internal.tasks.execution.EventFiringTaskExecuter$1.call(EventFiringTaskExecuter.java:52)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$CallableBuildOperationWorker.execute(DefaultBuildOperationRunner.java:210)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$CallableBuildOperationWorker.execute(DefaultBuildOperationRunner.java:205)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:67)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:167)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.call(DefaultBuildOperationRunner.java:54)
	at org.gradle.api.internal.tasks.execution.EventFiringTaskExecuter.execute(EventFiringTaskExecuter.java:52)
	at org.gradle.execution.plan.DefaultNodeExecutor.executeLocalTaskNode(DefaultNodeExecutor.java:55)
	at org.gradle.execution.plan.DefaultNodeExecutor.execute(DefaultNodeExecutor.java:34)
	at org.gradle.execution.taskgraph.DefaultTaskExecutionGraph$InvokeNodeExecutorsAction.execute(DefaultTaskExecutionGraph.java:355)
	at org.gradle.execution.taskgraph.DefaultTaskExecutionGraph$InvokeNodeExecutorsAction.execute(DefaultTaskExecutionGraph.java:343)
	at org.gradle.execution.taskgraph.DefaultTaskExecutionGraph$BuildOperationAwareExecutionAction.lambda$execute$0(DefaultTaskExecutionGraph.java:339)
	at org.gradle.internal.operations.CurrentBuildOperationRef.with(CurrentBuildOperationRef.java:84)
	at org.gradle.execution.taskgraph.DefaultTaskExecutionGraph$BuildOperationAwareExecutionAction.execute(DefaultTaskExecutionGraph.java:339)
	at org.gradle.execution.taskgraph.DefaultTaskExecutionGraph$BuildOperationAwareExecutionAction.execute(DefaultTaskExecutionGraph.java:328)
	at org.gradle.execution.plan.DefaultPlanExecutor$ExecutorWorker.execute(DefaultPlanExecutor.java:459)
	at org.gradle.execution.plan.DefaultPlanExecutor$ExecutorWorker.run(DefaultPlanExecutor.java:376)
	at org.gradle.internal.concurrent.ExecutorPolicy$CatchAndRecordFailures.onExecute(ExecutorPolicy.java:64)
	at org.gradle.internal.concurrent.AbstractManagedExecutor$1.run(AbstractManagedExecutor.java:47)
Caused by: org.gradle.workers.internal.DefaultWorkerExecutor$WorkExecutionException: A failure occurred while executing org.jetbrains.kotlin.compilerRunner.GradleCompilerRunnerWithWorkers$GradleKotlinCompilerWorkAction
	at org.gradle.workers.internal.DefaultWorkerExecutor$WorkItemExecution.waitForCompletion(DefaultWorkerExecutor.java:278)
	at org.gradle.internal.work.DefaultAsyncWorkTracker.lambda$waitForItemsAndGatherFailures$2(DefaultAsyncWorkTracker.java:132)
	at org.gradle.internal.Factories$1.create(Factories.java:30)
	at org.gradle.internal.work.DefaultWorkerLeaseService.lambda$withoutLocksBlocking$3(DefaultWorkerLeaseService.java:410)
	at org.gradle.internal.work.ResourceLockStatistics$1.measure(ResourceLockStatistics.java:43)
	at org.gradle.internal.work.DefaultWorkerLeaseService.withoutLocksBlocking(DefaultWorkerLeaseService.java:405)
	at org.gradle.internal.work.DefaultWorkerLeaseService.blocking(DefaultWorkerLeaseService.java:255)
	at org.gradle.internal.work.DefaultWorkerLeaseService.blocking(DefaultWorkerLeaseService.java:237)
	at org.gradle.internal.work.DefaultAsyncWorkTracker.lambda$waitForItemsAndGatherFailures$3(DefaultAsyncWorkTracker.java:128)
	at org.gradle.internal.Factories$1.create(Factories.java:30)
	at org.gradle.internal.resources.AbstractResourceLockRegistry.whileDisallowingLockChanges(AbstractResourceLockRegistry.java:50)
	at org.gradle.internal.work.DefaultWorkerLeaseService.whileDisallowingProjectLockChanges(DefaultWorkerLeaseService.java:260)
	at org.gradle.internal.work.DefaultAsyncWorkTracker.waitForItemsAndGatherFailures(DefaultAsyncWorkTracker.java:127)
	at org.gradle.internal.work.DefaultAsyncWorkTracker.waitForItemsAndGatherFailures(DefaultAsyncWorkTracker.java:93)
	at org.gradle.internal.work.DefaultAsyncWorkTracker.waitForAll(DefaultAsyncWorkTracker.java:79)
	at org.gradle.internal.work.DefaultAsyncWorkTracker.waitForCompletion(DefaultAsyncWorkTracker.java:67)
	at org.gradle.api.internal.tasks.execution.TaskExecution$3.run(TaskExecution.java:267)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$1.execute(DefaultBuildOperationRunner.java:30)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$1.execute(DefaultBuildOperationRunner.java:27)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:67)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:167)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.run(DefaultBuildOperationRunner.java:48)
	at org.gradle.api.internal.tasks.execution.TaskExecution.executeAction(TaskExecution.java:244)
	at org.gradle.api.internal.tasks.execution.TaskExecution.executeActions(TaskExecution.java:227)
	at org.gradle.api.internal.tasks.execution.TaskExecution.executeWithPreviousOutputFiles(TaskExecution.java:210)
	at org.gradle.api.internal.tasks.execution.TaskExecution.execute(TaskExecution.java:176)
	at org.gradle.internal.execution.steps.ExecuteStep.executeInternal(ExecuteStep.java:167)
	at org.gradle.internal.execution.steps.ExecuteStep.access$000(ExecuteStep.java:47)
	at org.gradle.internal.execution.steps.ExecuteStep$1.call(ExecuteStep.java:137)
	at org.gradle.internal.execution.steps.ExecuteStep$1.call(ExecuteStep.java:134)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$CallableBuildOperationWorker.execute(DefaultBuildOperationRunner.java:210)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$CallableBuildOperationWorker.execute(DefaultBuildOperationRunner.java:205)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:67)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:167)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.call(DefaultBuildOperationRunner.java:54)
	at org.gradle.internal.execution.steps.ExecuteStep.execute(ExecuteStep.java:134)
	at org.gradle.internal.execution.steps.ExecuteStep$Mutable.execute(ExecuteStep.java:80)
	at org.gradle.internal.execution.steps.CancelExecutionStep.execute(CancelExecutionStep.java:42)
	at org.gradle.internal.execution.steps.TimeoutStep.executeWithoutTimeout(TimeoutStep.java:75)
	at org.gradle.internal.execution.steps.TimeoutStep.execute(TimeoutStep.java:55)
	at org.gradle.internal.execution.steps.PreCreateOutputParentsStep.execute(PreCreateOutputParentsStep.java:51)
	at org.gradle.internal.execution.steps.PreCreateOutputParentsStep.execute(PreCreateOutputParentsStep.java:29)
	at org.gradle.internal.execution.steps.RemovePreviousOutputsStep.executeMutable(RemovePreviousOutputsStep.java:67)
	at org.gradle.internal.execution.steps.RemovePreviousOutputsStep.executeMutable(RemovePreviousOutputsStep.java:39)
	at org.gradle.internal.execution.steps.MutableStep.execute(MutableStep.java:26)
	at org.gradle.internal.execution.steps.BroadcastChangingOutputsStep.execute(BroadcastChangingOutputsStep.java:42)
	at org.gradle.internal.execution.steps.BroadcastChangingOutputsStep.execute(BroadcastChangingOutputsStep.java:24)
	at org.gradle.internal.execution.steps.CaptureOutputsAfterExecutionStep.execute(CaptureOutputsAfterExecutionStep.java:69)
	at org.gradle.internal.execution.steps.CaptureOutputsAfterExecutionStep.execute(CaptureOutputsAfterExecutionStep.java:46)
	at org.gradle.internal.execution.steps.ResolveInputChangesStep.executeMutable(ResolveInputChangesStep.java:39)
	at org.gradle.internal.execution.steps.ResolveInputChangesStep.executeMutable(ResolveInputChangesStep.java:28)
	at org.gradle.internal.execution.steps.MutableStep.execute(MutableStep.java:26)
	at org.gradle.internal.execution.steps.BuildCacheStep.executeWithoutCache(BuildCacheStep.java:189)
	at org.gradle.internal.execution.steps.BuildCacheStep.executeAndStoreInCache(BuildCacheStep.java:145)
	at org.gradle.internal.execution.steps.BuildCacheStep.lambda$executeWithCache$4(BuildCacheStep.java:104)
	at org.gradle.internal.execution.steps.BuildCacheStep.lambda$executeWithCache$5(BuildCacheStep.java:104)
	at org.gradle.internal.Try$Success.map(Try.java:170)
	at org.gradle.internal.execution.steps.BuildCacheStep.executeWithCache(BuildCacheStep.java:88)
	at org.gradle.internal.execution.steps.BuildCacheStep.lambda$execute$0(BuildCacheStep.java:75)
	at org.gradle.internal.Either$Left.fold(Either.java:116)
	at org.gradle.internal.execution.caching.CachingState.fold(CachingState.java:62)
	at org.gradle.internal.execution.steps.BuildCacheStep.execute(BuildCacheStep.java:74)
	at org.gradle.internal.execution.steps.BuildCacheStep.execute(BuildCacheStep.java:49)
	at org.gradle.internal.execution.steps.StoreExecutionStateStep.executeMutable(StoreExecutionStateStep.java:46)
	at org.gradle.internal.execution.steps.StoreExecutionStateStep.executeMutable(StoreExecutionStateStep.java:35)
	at org.gradle.internal.execution.steps.MutableStep.execute(MutableStep.java:26)
	at org.gradle.internal.execution.steps.SkipUpToDateStep.executeBecause(SkipUpToDateStep.java:75)
	at org.gradle.internal.execution.steps.SkipUpToDateStep.lambda$execute$2(SkipUpToDateStep.java:53)
	at org.gradle.internal.execution.steps.SkipUpToDateStep.execute(SkipUpToDateStep.java:53)
	at org.gradle.internal.execution.steps.SkipUpToDateStep.execute(SkipUpToDateStep.java:35)
	at org.gradle.internal.execution.steps.legacy.MarkSnapshottingInputsFinishedStep.execute(MarkSnapshottingInputsFinishedStep.java:37)
	at org.gradle.internal.execution.steps.legacy.MarkSnapshottingInputsFinishedStep.execute(MarkSnapshottingInputsFinishedStep.java:27)
	at org.gradle.internal.execution.steps.ResolveMutableCachingStateStep.executeDelegate(ResolveMutableCachingStateStep.java:70)
	at org.gradle.internal.execution.steps.ResolveMutableCachingStateStep.executeDelegate(ResolveMutableCachingStateStep.java:32)
	at org.gradle.internal.execution.steps.AbstractResolveCachingStateStep.execute(AbstractResolveCachingStateStep.java:69)
	at org.gradle.internal.execution.steps.AbstractResolveCachingStateStep.execute(AbstractResolveCachingStateStep.java:37)
	at org.gradle.internal.execution.steps.ResolveChangesStep.executeMutable(ResolveChangesStep.java:63)
	at org.gradle.internal.execution.steps.ResolveChangesStep.executeMutable(ResolveChangesStep.java:34)
	at org.gradle.internal.execution.steps.MutableStep.execute(MutableStep.java:26)
	at org.gradle.internal.execution.steps.ValidateStep$Mutable.executeDelegate(ValidateStep.java:79)
	at org.gradle.internal.execution.steps.ValidateStep$Mutable.executeDelegate(ValidateStep.java:65)
	at org.gradle.internal.execution.steps.ValidateStep.execute(ValidateStep.java:105)
	at org.gradle.internal.execution.steps.ValidateStep$Mutable.execute(ValidateStep.java:65)
	at org.gradle.internal.execution.steps.CaptureMutableStateBeforeExecutionStep.executeMutable(CaptureMutableStateBeforeExecutionStep.java:86)
	at org.gradle.internal.execution.steps.CaptureMutableStateBeforeExecutionStep.execute(CaptureMutableStateBeforeExecutionStep.java:65)
	at org.gradle.internal.execution.steps.CaptureMutableStateBeforeExecutionStep.execute(CaptureMutableStateBeforeExecutionStep.java:45)
	at org.gradle.internal.execution.steps.SkipEmptyMutableWorkStep.executeWithNonEmptySources(SkipEmptyMutableWorkStep.java:210)
	at org.gradle.internal.execution.steps.SkipEmptyMutableWorkStep.executeMutable(SkipEmptyMutableWorkStep.java:90)
	at org.gradle.internal.execution.steps.SkipEmptyMutableWorkStep.executeMutable(SkipEmptyMutableWorkStep.java:53)
	at org.gradle.internal.execution.steps.MutableStep.execute(MutableStep.java:26)
	at org.gradle.internal.execution.steps.legacy.MarkSnapshottingInputsStartedStep.execute(MarkSnapshottingInputsStartedStep.java:38)
	at org.gradle.internal.execution.steps.LoadPreviousExecutionStateStep.executeMutable(LoadPreviousExecutionStateStep.java:36)
	at org.gradle.internal.execution.steps.LoadPreviousExecutionStateStep.executeMutable(LoadPreviousExecutionStateStep.java:23)
	at org.gradle.internal.execution.steps.MutableStep.execute(MutableStep.java:26)
	at org.gradle.internal.execution.steps.HandleStaleOutputsStep.executeMutable(HandleStaleOutputsStep.java:77)
	at org.gradle.internal.execution.steps.HandleStaleOutputsStep.executeMutable(HandleStaleOutputsStep.java:43)
	at org.gradle.internal.execution.steps.MutableStep.execute(MutableStep.java:26)
	at org.gradle.internal.execution.steps.AssignMutableWorkspaceStep.lambda$executeMutable$0(AssignMutableWorkspaceStep.java:34)
	at org.gradle.api.internal.tasks.execution.TaskExecution$4.withWorkspace(TaskExecution.java:305)
	at org.gradle.internal.execution.steps.AssignMutableWorkspaceStep.executeMutable(AssignMutableWorkspaceStep.java:30)
	at org.gradle.internal.execution.steps.AssignMutableWorkspaceStep.executeMutable(AssignMutableWorkspaceStep.java:21)
	at org.gradle.internal.execution.steps.MutableStep.execute(MutableStep.java:26)
	at org.gradle.internal.execution.steps.ChoosePipelineStep.execute(ChoosePipelineStep.java:40)
	at org.gradle.internal.execution.steps.ChoosePipelineStep.execute(ChoosePipelineStep.java:23)
	at org.gradle.internal.execution.steps.ExecuteWorkBuildOperationFiringStep.lambda$execute$2(ExecuteWorkBuildOperationFiringStep.java:67)
	at org.gradle.internal.execution.steps.ExecuteWorkBuildOperationFiringStep.execute(ExecuteWorkBuildOperationFiringStep.java:67)
	at org.gradle.internal.execution.steps.ExecuteWorkBuildOperationFiringStep.execute(ExecuteWorkBuildOperationFiringStep.java:39)
	at org.gradle.internal.execution.steps.IdentityCacheStep.execute(IdentityCacheStep.java:46)
	at org.gradle.internal.execution.steps.IdentityCacheStep.execute(IdentityCacheStep.java:34)
	at org.gradle.internal.execution.steps.IdentifyStep.execute(IdentifyStep.java:56)
	at org.gradle.internal.execution.steps.IdentifyStep.execute(IdentifyStep.java:38)
	at org.gradle.internal.execution.impl.DefaultExecutionEngine$1.execute(DefaultExecutionEngine.java:68)
	at org.gradle.api.internal.tasks.execution.ExecuteActionsTaskExecuter.executeIfValid(ExecuteActionsTaskExecuter.java:132)
	... 30 more
Caused by: org.jetbrains.kotlin.gradle.tasks.CompilationErrorException: Compilation error. See log for more details
	at org.jetbrains.kotlin.gradle.tasks.TasksUtilsKt.throwExceptionIfCompilationFailed(tasksUtils.kt:21)
	at org.jetbrains.kotlin.compilerRunner.GradleKotlinCompilerWork.run(GradleKotlinCompilerWork.kt:119)
	at org.jetbrains.kotlin.compilerRunner.GradleCompilerRunnerWithWorkers$GradleKotlinCompilerWorkAction.execute(GradleCompilerRunnerWithWorkers.kt:76)
	at org.gradle.workers.internal.DefaultWorkerServer.execute(DefaultWorkerServer.java:68)
	at org.gradle.workers.internal.NoIsolationWorkerFactory$1$1.create(NoIsolationWorkerFactory.java:64)
	at org.gradle.workers.internal.NoIsolationWorkerFactory$1$1.create(NoIsolationWorkerFactory.java:61)
	at org.gradle.internal.classloader.ClassLoaderUtils.executeInClassloader(ClassLoaderUtils.java:102)
	at org.gradle.workers.internal.NoIsolationWorkerFactory$1.lambda$execute$0(NoIsolationWorkerFactory.java:61)
	at org.gradle.workers.internal.AbstractWorker$1.call(AbstractWorker.java:44)
	at org.gradle.workers.internal.AbstractWorker$1.call(AbstractWorker.java:41)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$CallableBuildOperationWorker.execute(DefaultBuildOperationRunner.java:210)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$CallableBuildOperationWorker.execute(DefaultBuildOperationRunner.java:205)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:67)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:167)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.call(DefaultBuildOperationRunner.java:54)
	at org.gradle.workers.internal.AbstractWorker.executeWrappedInBuildOperation(AbstractWorker.java:41)
	at org.gradle.workers.internal.NoIsolationWorkerFactory$1.execute(NoIsolationWorkerFactory.java:58)
	at org.gradle.workers.internal.DefaultWorkerExecutor.lambda$submitWork$0(DefaultWorkerExecutor.java:174)
	at org.gradle.internal.work.DefaultConditionalExecutionQueue$ExecutionRunner.runExecution(DefaultConditionalExecutionQueue.java:191)
	at org.gradle.internal.work.DefaultConditionalExecutionQueue$ExecutionRunner.access$500(DefaultConditionalExecutionQueue.java:112)
	at org.gradle.internal.work.DefaultConditionalExecutionQueue$ExecutionRunner$1.run(DefaultConditionalExecutionQueue.java:168)
	at org.gradle.internal.Factories$1.create(Factories.java:30)
	at org.gradle.internal.work.DefaultWorkerLeaseService.lambda$runAndReleaseLocks$0(DefaultWorkerLeaseService.java:300)
	at org.gradle.internal.work.ResourceLockStatistics$1.measure(ResourceLockStatistics.java:43)
	at org.gradle.internal.work.DefaultWorkerLeaseService.runAndReleaseLocks(DefaultWorkerLeaseService.java:298)
	at org.gradle.internal.work.DefaultWorkerLeaseService.withLocksAcquired(DefaultWorkerLeaseService.java:294)
	at org.gradle.internal.work.DefaultWorkerLeaseService.withLocks(DefaultWorkerLeaseService.java:286)
	at org.gradle.internal.work.DefaultWorkerLeaseService.runAsWorkerThread(DefaultWorkerLeaseService.java:130)
	at org.gradle.internal.work.DefaultWorkerLeaseService.runAsWorkerThread(DefaultWorkerLeaseService.java:135)
	at org.gradle.internal.work.DefaultConditionalExecutionQueue$ExecutionRunner.runBatch(DefaultConditionalExecutionQueue.java:163)
	at org.gradle.internal.work.DefaultConditionalExecutionQueue$ExecutionRunner.run(DefaultConditionalExecutionQueue.java:125)
	... 2 more


Deprecated Gradle features were used in this build, making it incompatible with Gradle 10.

You can use '--warning-mode all' to show the individual deprecation warnings and determine if they come from your own scripts or plugins.

For more on this, please refer to https://docs.gradle.org/9.6.1/userguide/command_line_interface.html#sec:command_line_warnings in the Gradle documentation.

BUILD FAILED in 50s
23 actionable tasks: 11 executed, 12 from cache
```

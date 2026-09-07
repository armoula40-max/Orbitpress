# Build failure 34135556525 on arena/01a07be5-orbitpress

## Debug log tail (1000 lines)
```
Initialized native services in: /home/runner/.gradle/native
Initialized jansi services in: /home/runner/.gradle/native

Welcome to Gradle 9.6.1!

Here are the highlights of this release:
 - Improved Configuration Cache hit rates
 - Additional CLI rendering options
 - Important project hierarchy lookup deprecations

For more details see https://docs.gradle.org/9.6.1/release-notes.html

The current JVM process isn't compatible with build requirement. The maximum heap size is insufficient.

To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/9.6.1/userguide/gradle_daemon.html#sec:disabling_the_daemon in the Gradle documentation.
Starting process 'Gradle build daemon'. Working directory: /home/runner/.gradle/daemon/9.6.1 Command: /usr/lib/jvm/temurin-17-jdk-amd64/bin/java --add-opens=java.base/java.lang=ALL-UNNAMED --add-opens=java.base/java.lang.invoke=ALL-UNNAMED --add-opens=java.base/java.util=ALL-UNNAMED --add-opens=java.prefs/java.util.prefs=ALL-UNNAMED --add-exports=jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED --add-exports=jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED --add-opens=java.base/java.nio.charset=ALL-UNNAMED --add-opens=java.base/java.net=ALL-UNNAMED --add-opens=java.base/java.util.concurrent=ALL-UNNAMED --add-opens=java.base/java.util.concurrent.atomic=ALL-UNNAMED --add-opens=java.xml/javax.xml.namespace=ALL-UNNAMED --add-opens=java.base/java.time=ALL-UNNAMED -XX:+UseParallelGC -Xmx4g -Dfile.encoding=UTF-8 -Duser.country -Duser.language=en -Duser.variant -cp /home/runner/.gradle/wrapper/dists/gradle-9.6.1-bin/4ticwg1pgcbps2hj28r8so764/gradle-9.6.1/lib/gradle-daemon-main-9.6.1.jar -javaagent:/home/runner/.gradle/wrapper/dists/gradle-9.6.1-bin/4ticwg1pgcbps2hj28r8so764/gradle-9.6.1/lib/agents/gradle-instrumentation-agent-9.6.1.jar org.gradle.launcher.daemon.bootstrap.GradleDaemon 9.6.1
Successfully started process 'Gradle build daemon'
An attempt to start the daemon took 1.098 secs.
The client will now receive all logging from the daemon (pid: 2614). The daemon log file: /home/runner/.gradle/daemon/9.6.1/daemon-2614.out.log
Daemon will be stopped at the end of the build 
Using 4 worker leases.
Operational build model parameters: {cachingModelBuilding=false, configurationCache=false, configurationCacheDisabledReason=null, configurationCacheParallelLoad=false, configurationCacheParallelStore=false, configureOnDemand=true, invalidateCoupledProjects=false, isolatedProjects=false, isolatedProjectsDiagnostics=false, modelAsProjectDependency=false, modelBuilding=false, parallelModelBuilding=false, parallelProjectConfiguration=false, parallelProjectExecution=true, resilientModelBuilding=false, vintage=true}
Configuration on demand is an incubating feature.
Received JVM installation metadata from '/usr/lib/jvm/temurin-17-jdk-amd64': {JAVA_HOME=/usr/lib/jvm/temurin-17-jdk-amd64, JAVA_VERSION=17.0.20.1, JAVA_VENDOR=Eclipse Adoptium, RUNTIME_NAME=OpenJDK Runtime Environment, RUNTIME_VERSION=17.0.20.1+1, VM_NAME=OpenJDK 64-Bit Server VM, VM_VERSION=17.0.20.1+1, VM_VENDOR=Eclipse Adoptium, OS_ARCH=amd64}
Watching the file system is configured to be enabled if available
Now considering [/home/runner/work/Orbitpress/Orbitpress] as hierarchies to watch
File system watching is active
Starting Build
Settings evaluated using settings file '/home/runner/work/Orbitpress/Orbitpress/settings.gradle.kts'.
Using local directory build cache for the root build (location = /home/runner/.gradle/caches/build-cache-1, remove unused entries = after 7 days).
Projects loaded. Root project using build file '/home/runner/work/Orbitpress/Orbitpress/build.gradle.kts'.
Included projects: [root project 'OrbitPress', project ':app']
Task path ':app:assembleDebug' matched project ':app'

> Configure project :
Evaluating root project 'OrbitPress' using build file '/home/runner/work/Orbitpress/Orbitpress/build.gradle.kts'.
Resolved plugin [id: 'com.android.application', version: '8.7.3', apply: false]
Resolved plugin [id: 'org.jetbrains.kotlin.android', version: '2.0.21', apply: false]

> Configure project :app
Evaluating project ':app' using build file '/home/runner/work/Orbitpress/Orbitpress/app/build.gradle.kts'.
Resolved plugin [id: 'com.android.application']
Resolved plugin [id: 'org.jetbrains.kotlin.android']
Using default execution profile
Using Kotlin Gradle Plugin gradle85 variant
Build cache key for Kotlin DSL script compilation (Project/TopLevel/stage2) is 0dcd650c1d1be2f6d32dc2a6a0cc7a44
e: file:///home/runner/work/Orbitpress/Orbitpress/app/build.gradle.kts:29:7: Unresolved reference 'isShrinkResourcesEnabled'.

[Incubating] Problems report is available at: file:///home/runner/work/Orbitpress/Orbitpress/build/reports/problems/problems-report.html

FAILURE: Build failed with an exception.

* Where:
Build file '/home/runner/work/Orbitpress/Orbitpress/app/build.gradle.kts' line: 29

* What went wrong:
Script compilation error:

  Line 29:       isShrinkResourcesEnabled = false
                 ^ Unresolved reference 'isShrinkResourcesEnabled'.

1 error

* Try:
> Run with --debug option to get more log output.
> Run with --scan to get full insights from a Build Scan (powered by Develocity).
> Get more help at https://help.gradle.org.

* Exception is:
ScriptCompilationException(scriptCompilationErrors=[ScriptCompilationError(message=Unresolved reference 'isShrinkResourcesEnabled'., location=/home/runner/.gradle/.tmp/gradle-kotlin-dsl-16605788756609304347.tmp/build.gradle.kts (29:7))])
	at org.gradle.kotlin.dsl.support.KotlinCompilerKt.reportToMessageCollectorAndThrowOnErrors(KotlinCompiler.kt:211)
	at org.gradle.kotlin.dsl.support.KotlinCompilerKt.compileKotlinScriptModuleTo(KotlinCompiler.kt:180)
	at org.gradle.kotlin.dsl.support.KotlinCompilerKt.compileKotlinScriptToDirectory(KotlinCompiler.kt:134)
	at org.gradle.kotlin.dsl.execution.ResidualProgramCompiler.compileScript_C5AE47M$lambda$0(ResidualProgramCompiler.kt:717)
	at org.gradle.kotlin.dsl.provider.StandardKotlinScriptEvaluator$InterpreterHost$runCompileBuildOperation$1.call(KotlinScriptEvaluator.kt:211)
	at org.gradle.kotlin.dsl.provider.StandardKotlinScriptEvaluator$InterpreterHost$runCompileBuildOperation$1.call(KotlinScriptEvaluator.kt:208)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$CallableBuildOperationWorker.execute(DefaultBuildOperationRunner.java:210)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$CallableBuildOperationWorker.execute(DefaultBuildOperationRunner.java:205)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:67)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:167)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.call(DefaultBuildOperationRunner.java:54)
	at org.gradle.kotlin.dsl.provider.StandardKotlinScriptEvaluator$InterpreterHost.runCompileBuildOperation(KotlinScriptEvaluator.kt:208)
	at org.gradle.kotlin.dsl.execution.Interpreter$ProgramHost$compileSecondStageOf$cacheDir$1$1$1$1$1.invoke(Interpreter.kt:506)
	at org.gradle.kotlin.dsl.execution.Interpreter$ProgramHost$compileSecondStageOf$cacheDir$1$1$1$1$1.invoke(Interpreter.kt:506)
	at org.gradle.kotlin.dsl.execution.ResidualProgramCompiler.compileScript-C5AE47M(ResidualProgramCompiler.kt:715)
	at org.gradle.kotlin.dsl.execution.ResidualProgramCompiler.compileScript-C5AE47M$default(ResidualProgramCompiler.kt:707)
	at org.gradle.kotlin.dsl.execution.ResidualProgramCompiler.emitStage2ProgramFor(ResidualProgramCompiler.kt:366)
	at org.gradle.kotlin.dsl.execution.Interpreter$ProgramHost.compileSecondStageOf$lambda$0(Interpreter.kt:507)
	at org.gradle.kotlin.dsl.provider.StandardKotlinScriptEvaluator$KotlinScriptCompilationAndInstrumentation.compile(KotlinScriptEvaluator.kt:447)
	at org.gradle.internal.scripts.BuildScriptCompilationAndInstrumentation.execute(BuildScriptCompilationAndInstrumentation.java:140)
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
	at org.gradle.internal.execution.steps.ExecuteStep$Immutable.execute(ExecuteStep.java:49)
	at org.gradle.internal.execution.steps.CancelExecutionStep.execute(CancelExecutionStep.java:42)
	at org.gradle.internal.execution.steps.TimeoutStep.executeWithoutTimeout(TimeoutStep.java:75)
	at org.gradle.internal.execution.steps.TimeoutStep.execute(TimeoutStep.java:55)
	at org.gradle.internal.execution.steps.PreCreateOutputParentsStep.execute(PreCreateOutputParentsStep.java:51)
	at org.gradle.internal.execution.steps.PreCreateOutputParentsStep.execute(PreCreateOutputParentsStep.java:29)
	at org.gradle.internal.execution.steps.BroadcastChangingOutputsStep.execute(BroadcastChangingOutputsStep.java:42)
	at org.gradle.internal.execution.steps.BroadcastChangingOutputsStep.execute(BroadcastChangingOutputsStep.java:24)
	at org.gradle.internal.execution.steps.CaptureOutputsAfterExecutionStep.execute(CaptureOutputsAfterExecutionStep.java:69)
	at org.gradle.internal.execution.steps.CaptureOutputsAfterExecutionStep.execute(CaptureOutputsAfterExecutionStep.java:46)
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
	at org.gradle.internal.execution.steps.NeverUpToDateStep.execute(NeverUpToDateStep.java:35)
	at org.gradle.internal.execution.steps.NeverUpToDateStep.execute(NeverUpToDateStep.java:23)
	at org.gradle.internal.execution.steps.legacy.MarkSnapshottingInputsFinishedStep.execute(MarkSnapshottingInputsFinishedStep.java:37)
	at org.gradle.internal.execution.steps.legacy.MarkSnapshottingInputsFinishedStep.execute(MarkSnapshottingInputsFinishedStep.java:27)
	at org.gradle.internal.execution.steps.ResolveImmutableCachingStateStep.executeDelegate(ResolveImmutableCachingStateStep.java:45)
	at org.gradle.internal.execution.steps.ResolveImmutableCachingStateStep.executeDelegate(ResolveImmutableCachingStateStep.java:25)
	at org.gradle.internal.execution.steps.AbstractResolveCachingStateStep.execute(AbstractResolveCachingStateStep.java:69)
	at org.gradle.internal.execution.steps.AbstractResolveCachingStateStep.execute(AbstractResolveCachingStateStep.java:37)
	at org.gradle.internal.execution.steps.ValidateStep$Immutable.executeDelegate(ValidateStep.java:61)
	at org.gradle.internal.execution.steps.ValidateStep$Immutable.executeDelegate(ValidateStep.java:47)
	at org.gradle.internal.execution.steps.ValidateStep.execute(ValidateStep.java:105)
	at org.gradle.internal.execution.steps.ValidateStep$Immutable.execute(ValidateStep.java:47)
	at org.gradle.internal.execution.steps.CaptureImmutableStateBeforeExecutionStep.execute(CaptureImmutableStateBeforeExecutionStep.java:45)
	at org.gradle.internal.execution.steps.CaptureImmutableStateBeforeExecutionStep.execute(CaptureImmutableStateBeforeExecutionStep.java:26)
	at org.gradle.internal.execution.steps.legacy.MarkSnapshottingInputsStartedStep.execute(MarkSnapshottingInputsStartedStep.java:38)
	at org.gradle.internal.execution.steps.AssignImmutableWorkspaceStep.executeInWorkspace(AssignImmutableWorkspaceStep.java:233)
	at org.gradle.internal.execution.steps.AssignImmutableWorkspaceStep.lambda$loadOrCreateWorkspace$2(AssignImmutableWorkspaceStep.java:149)
	at org.gradle.cache.internal.DefaultFineGrainedPersistentCache.withFileLock(DefaultFineGrainedPersistentCache.java:126)
	at org.gradle.cache.internal.DefaultCacheFactory$ReferenceTrackingFineGrainedCache.withFileLock(DefaultCacheFactory.java:294)
	at org.gradle.internal.execution.workspace.impl.CacheBasedImmutableWorkspaceProvider$1.withFileLock(CacheBasedImmutableWorkspaceProvider.java:71)
	at org.gradle.internal.execution.steps.AssignImmutableWorkspaceStep.loadOrCreateWorkspace(AssignImmutableWorkspaceStep.java:141)
	at org.gradle.internal.execution.steps.AssignImmutableWorkspaceStep.lambda$execute$0(AssignImmutableWorkspaceStep.java:115)
	at org.gradle.internal.execution.workspace.impl.CacheBasedImmutableWorkspaceProvider$1.getOrCompute(CacheBasedImmutableWorkspaceProvider.java:89)
	at org.gradle.internal.execution.steps.AssignImmutableWorkspaceStep.execute(AssignImmutableWorkspaceStep.java:115)
	at org.gradle.internal.execution.steps.AssignImmutableWorkspaceStep.execute(AssignImmutableWorkspaceStep.java:80)
	at org.gradle.internal.execution.steps.ChoosePipelineStep.execute(ChoosePipelineStep.java:38)
	at org.gradle.internal.execution.steps.ChoosePipelineStep.execute(ChoosePipelineStep.java:23)
	at org.gradle.internal.execution.steps.ExecuteWorkBuildOperationFiringStep.lambda$execute$0(ExecuteWorkBuildOperationFiringStep.java:53)
	at org.gradle.internal.execution.steps.BuildOperationStep$1.call(BuildOperationStep.java:38)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$CallableBuildOperationWorker.execute(DefaultBuildOperationRunner.java:210)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$CallableBuildOperationWorker.execute(DefaultBuildOperationRunner.java:205)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:67)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:167)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.call(DefaultBuildOperationRunner.java:54)
	at org.gradle.internal.execution.steps.BuildOperationStep.operation(BuildOperationStep.java:35)
	at org.gradle.internal.execution.steps.ExecuteWorkBuildOperationFiringStep.lambda$execute$1(ExecuteWorkBuildOperationFiringStep.java:51)
	at org.gradle.internal.execution.steps.ExecuteWorkBuildOperationFiringStep.execute(ExecuteWorkBuildOperationFiringStep.java:51)
	at org.gradle.internal.execution.steps.ExecuteWorkBuildOperationFiringStep.execute(ExecuteWorkBuildOperationFiringStep.java:39)
	at org.gradle.internal.execution.steps.IdentityCacheStep.execute(IdentityCacheStep.java:46)
	at org.gradle.internal.execution.steps.IdentityCacheStep.execute(IdentityCacheStep.java:34)
	at org.gradle.internal.execution.steps.IdentifyStep.execute(IdentifyStep.java:56)
	at org.gradle.internal.execution.steps.IdentifyStep.execute(IdentifyStep.java:38)
	at org.gradle.internal.execution.impl.DefaultExecutionEngine$1.execute(DefaultExecutionEngine.java:68)
	at org.gradle.kotlin.dsl.provider.StandardKotlinScriptEvaluator$InterpreterHost.cachedDirFor(KotlinScriptEvaluator.kt:306)
	at org.gradle.kotlin.dsl.execution.Interpreter$ProgramHost.compileSecondStageOf(Interpreter.kt:482)
	at Program.loadSecondStageFor(Unknown Source)
	at org.gradle.kotlin.dsl.execution.Interpreter$ProgramHost.evaluateSecondStageOf(Interpreter.kt:446)
	at Program.execute(Unknown Source)
	at org.gradle.kotlin.dsl.execution.Interpreter$ProgramHost$eval$1.run(Interpreter.kt:532)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$1.execute(DefaultBuildOperationRunner.java:30)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$1.execute(DefaultBuildOperationRunner.java:27)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:67)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:167)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.run(DefaultBuildOperationRunner.java:48)
	at org.gradle.kotlin.dsl.execution.Interpreter$ProgramHost.eval(Interpreter.kt:527)
	at org.gradle.kotlin.dsl.execution.Interpreter.eval(Interpreter.kt:223)
	at org.gradle.kotlin.dsl.provider.StandardKotlinScriptEvaluator.evaluate(KotlinScriptEvaluator.kt:133)
	at org.gradle.kotlin.dsl.provider.KotlinScriptPluginFactory.create$lambda$0(KotlinScriptPluginFactory.kt:61)
	at org.gradle.kotlin.dsl.provider.KotlinScriptPlugin.apply(KotlinScriptPlugin.kt:35)
	at org.gradle.configuration.BuildOperationScriptPlugin$1.run(BuildOperationScriptPlugin.java:68)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$1.execute(DefaultBuildOperationRunner.java:30)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$1.execute(DefaultBuildOperationRunner.java:27)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:67)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:167)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.run(DefaultBuildOperationRunner.java:48)
	at org.gradle.configuration.BuildOperationScriptPlugin.lambda$apply$0(BuildOperationScriptPlugin.java:65)
	at org.gradle.internal.code.DefaultUserCodeApplicationContext.apply(DefaultUserCodeApplicationContext.java:44)
	at org.gradle.configuration.BuildOperationScriptPlugin.apply(BuildOperationScriptPlugin.java:65)
	at org.gradle.api.internal.project.DefaultProjectState.lambda$applyToMutableState$0(DefaultProjectState.java:226)
	at org.gradle.api.internal.project.DefaultProjectState.lambda$fromMutableState$1(DefaultProjectState.java:233)
	at org.gradle.api.internal.project.DefaultProjectState.runWithModelLock(DefaultProjectState.java:249)
	at org.gradle.api.internal.project.DefaultProjectState.fromMutableState(DefaultProjectState.java:233)
	at org.gradle.api.internal.project.DefaultProjectState.applyToMutableState(DefaultProjectState.java:225)
	at org.gradle.configuration.project.BuildScriptProcessor.execute(BuildScriptProcessor.java:46)
	at org.gradle.configuration.project.BuildScriptProcessor.execute(BuildScriptProcessor.java:27)
	at org.gradle.configuration.project.ConfigureActionsProjectEvaluator.evaluate(ConfigureActionsProjectEvaluator.java:35)
	at org.gradle.configuration.project.LifecycleProjectEvaluator$EvaluateProject.lambda$run$0(LifecycleProjectEvaluator.java:109)
	at org.gradle.api.internal.project.DefaultProjectState.lambda$applyToMutableState$0(DefaultProjectState.java:226)
	at org.gradle.api.internal.project.DefaultProjectState.lambda$fromMutableState$1(DefaultProjectState.java:233)
	at org.gradle.api.internal.project.DefaultProjectState.runWithModelLock(DefaultProjectState.java:249)
	at org.gradle.api.internal.project.DefaultProjectState.fromMutableState(DefaultProjectState.java:233)
	at org.gradle.api.internal.project.DefaultProjectState.applyToMutableState(DefaultProjectState.java:225)
	at org.gradle.configuration.project.LifecycleProjectEvaluator$EvaluateProject.run(LifecycleProjectEvaluator.java:100)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$1.execute(DefaultBuildOperationRunner.java:30)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$1.execute(DefaultBuildOperationRunner.java:27)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:67)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:167)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.run(DefaultBuildOperationRunner.java:48)
	at org.gradle.configuration.project.LifecycleProjectEvaluator.evaluate(LifecycleProjectEvaluator.java:72)
	at org.gradle.api.internal.project.DefaultProject.evaluateUnchecked(DefaultProject.java:828)
	at org.gradle.api.internal.project.ProjectLifecycleController.lambda$ensureSelfConfigured$2(ProjectLifecycleController.java:96)
	at org.gradle.internal.model.StateTransitionController.lambda$doTransition$15(StateTransitionController.java:293)
	at org.gradle.internal.model.StateTransitionController.doTransition(StateTransitionController.java:304)
	at org.gradle.internal.model.StateTransitionController.doTransition(StateTransitionController.java:292)
	at org.gradle.internal.model.StateTransitionController.lambda$maybeTransitionIfNotCurrentlyTransitioning$11(StateTransitionController.java:237)
	at org.gradle.internal.work.DefaultSynchronizer.withLock(DefaultSynchronizer.java:35)
	at org.gradle.internal.model.StateTransitionController.maybeTransitionIfNotCurrentlyTransitioning(StateTransitionController.java:233)
	at org.gradle.api.internal.project.ProjectLifecycleController.ensureSelfConfigured(ProjectLifecycleController.java:96)
	at org.gradle.api.internal.project.DefaultProjectState.ensureConfigured(DefaultProjectState.java:194)
	at org.gradle.execution.TaskPathProjectEvaluator.configure(TaskPathProjectEvaluator.java:70)
	at org.gradle.execution.DefaultTaskSelector.getSelection(DefaultTaskSelector.java:71)
	at org.gradle.execution.selection.DefaultBuildTaskSelector.resolveTaskName(DefaultBuildTaskSelector.java:108)
	at org.gradle.execution.commandline.CommandLineTaskParser.parseTasks(CommandLineTaskParser.java:49)
	at org.gradle.execution.TaskNameResolvingBuildTaskScheduler.scheduleRequestedTasks(TaskNameResolvingBuildTaskScheduler.java:65)
	at org.gradle.execution.DefaultTasksBuildTaskScheduler.scheduleRequestedTasks(DefaultTasksBuildTaskScheduler.java:70)
	at org.gradle.initialization.DefaultTaskExecutionPreparer.lambda$scheduleRequestedTasks$0(DefaultTaskExecutionPreparer.java:47)
	at org.gradle.internal.build.BuildProjectRegistry.lambda$withMutableStateOfAllProjects$0(BuildProjectRegistry.java:60)
	at org.gradle.internal.build.BuildProjectRegistry.lambda$applyToMutableStateOfAllProjects$2(BuildProjectRegistry.java:78)
	at org.gradle.api.internal.project.DefaultProjectStateRegistry$DefaultBuildProjectRegistry.lambda$fromMutableStateOfAllProjects$0(DefaultProjectStateRegistry.java:278)
	at org.gradle.internal.work.DefaultWorkerLeaseService.lambda$runAndReleaseLocks$0(DefaultWorkerLeaseService.java:300)
	at org.gradle.internal.work.ResourceLockStatistics$1.measure(ResourceLockStatistics.java:43)
	at org.gradle.internal.work.DefaultWorkerLeaseService.runAndReleaseLocks(DefaultWorkerLeaseService.java:298)
	at org.gradle.internal.work.DefaultWorkerLeaseService.withLocksAcquired(DefaultWorkerLeaseService.java:294)
	at org.gradle.internal.work.DefaultWorkerLeaseService.lambda$withReplacedLocks$4(DefaultWorkerLeaseService.java:450)
	at org.gradle.internal.work.DefaultWorkerLeaseService.withoutLocks(DefaultWorkerLeaseService.java:372)
	at org.gradle.internal.work.DefaultWorkerLeaseService.withReplacedLocks(DefaultWorkerLeaseService.java:449)
	at org.gradle.api.internal.project.DefaultProjectStateRegistry$DefaultBuildProjectRegistry.fromMutableStateOfAllProjects(DefaultProjectStateRegistry.java:277)
	at org.gradle.internal.build.BuildProjectRegistry.applyToMutableStateOfAllProjects(BuildProjectRegistry.java:77)
	at org.gradle.internal.build.BuildProjectRegistry.withMutableStateOfAllProjects(BuildProjectRegistry.java:60)
	at org.gradle.initialization.DefaultTaskExecutionPreparer.scheduleRequestedTasks(DefaultTaskExecutionPreparer.java:46)
	at org.gradle.initialization.VintageBuildModelController.lambda$scheduleRequestedTasks$0(VintageBuildModelController.java:75)
	at org.gradle.internal.model.StateTransitionController.lambda$inState$1(StateTransitionController.java:119)
	at org.gradle.internal.model.StateTransitionController.lambda$inState$2(StateTransitionController.java:134)
	at org.gradle.internal.work.DefaultSynchronizer.withLock(DefaultSynchronizer.java:45)
	at org.gradle.internal.model.StateTransitionController.inState(StateTransitionController.java:130)
	at org.gradle.internal.model.StateTransitionController.inState(StateTransitionController.java:118)
	at org.gradle.initialization.VintageBuildModelController.scheduleRequestedTasks(VintageBuildModelController.java:75)
	at org.gradle.internal.build.DefaultBuildLifecycleController$DefaultWorkGraphBuilder.addRequestedTasks(DefaultBuildLifecycleController.java:414)
	at org.gradle.internal.buildtree.DefaultBuildTreeWorkPreparer.lambda$scheduleRequestedTasks$0(DefaultBuildTreeWorkPreparer.java:40)
	at org.gradle.internal.build.DefaultBuildLifecycleController.lambda$populateWorkGraph$8(DefaultBuildLifecycleController.java:199)
	at org.gradle.internal.build.DefaultBuildWorkPreparer.populateWorkGraph(DefaultBuildWorkPreparer.java:42)
	at org.gradle.internal.build.BuildOperationFiringBuildWorkPreparer$PopulateWorkGraph.populateTaskGraph(BuildOperationFiringBuildWorkPreparer.java:106)
	at org.gradle.internal.build.BuildOperationFiringBuildWorkPreparer$PopulateWorkGraph.run(BuildOperationFiringBuildWorkPreparer.java:92)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$1.execute(DefaultBuildOperationRunner.java:30)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$1.execute(DefaultBuildOperationRunner.java:27)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:67)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:167)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.run(DefaultBuildOperationRunner.java:48)
	at org.gradle.internal.build.BuildOperationFiringBuildWorkPreparer.populateWorkGraph(BuildOperationFiringBuildWorkPreparer.java:67)
	at org.gradle.internal.build.DefaultBuildLifecycleController.lambda$populateWorkGraph$9(DefaultBuildLifecycleController.java:199)
	at org.gradle.internal.model.StateTransitionController.lambda$inState$1(StateTransitionController.java:119)
	at org.gradle.internal.model.StateTransitionController.lambda$inState$2(StateTransitionController.java:134)
	at org.gradle.internal.work.DefaultSynchronizer.withLock(DefaultSynchronizer.java:45)
	at org.gradle.internal.model.StateTransitionController.inState(StateTransitionController.java:130)
	at org.gradle.internal.model.StateTransitionController.inState(StateTransitionController.java:118)
	at org.gradle.internal.build.DefaultBuildLifecycleController.populateWorkGraph(DefaultBuildLifecycleController.java:199)
	at org.gradle.internal.build.DefaultBuildWorkGraphController$DefaultBuildWorkGraph.populateWorkGraph(DefaultBuildWorkGraphController.java:169)
	at org.gradle.composite.internal.DefaultBuildController.populateWorkGraph(DefaultBuildController.java:76)
	at org.gradle.composite.internal.DefaultIncludedBuildTaskGraph$DefaultBuildTreeWorkGraphBuilder.withWorkGraph(DefaultIncludedBuildTaskGraph.java:156)
	at org.gradle.internal.buildtree.DefaultBuildTreeWorkPreparer.lambda$scheduleRequestedTasks$1(DefaultBuildTreeWorkPreparer.java:40)
	at org.gradle.composite.internal.DefaultIncludedBuildTaskGraph$DefaultBuildTreeWorkGraph$1.run(DefaultIncludedBuildTaskGraph.java:212)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$1.execute(DefaultBuildOperationRunner.java:30)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$1.execute(DefaultBuildOperationRunner.java:27)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:67)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:167)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.run(DefaultBuildOperationRunner.java:48)
	at org.gradle.composite.internal.DefaultIncludedBuildTaskGraph$DefaultBuildTreeWorkGraph.scheduleWork(DefaultIncludedBuildTaskGraph.java:207)
	at org.gradle.internal.buildtree.DefaultBuildTreeWorkPreparer.scheduleRequestedTasks(DefaultBuildTreeWorkPreparer.java:36)
	at org.gradle.internal.cc.impl.barrier.BarrierAwareBuildTreeWorkPreparer.scheduleRequestedTasks$lambda$0(BarrierAwareBuildTreeWorkPreparer.kt:34)
	at org.gradle.internal.cc.impl.barrier.VintageConfigurationTimeActionRunner.runConfigurationTimeAction(VintageConfigurationTimeActionRunner.kt:48)
	at org.gradle.internal.cc.impl.barrier.BarrierAwareBuildTreeWorkPreparer.scheduleRequestedTasks(BarrierAwareBuildTreeWorkPreparer.kt:33)
	at org.gradle.internal.cc.impl.VintageBuildTreeWorkController$scheduleAndRunRequestedTasks$1$finalizedGraph$1.call(VintageBuildTreeWorkController.kt:37)
	at org.gradle.internal.cc.impl.VintageBuildTreeWorkController$scheduleAndRunRequestedTasks$1$finalizedGraph$1.call(VintageBuildTreeWorkController.kt:37)
	at org.gradle.internal.Try.ofFailable(Try.java:46)
	at org.gradle.internal.cc.impl.VintageBuildTreeWorkController$scheduleAndRunRequestedTasks$1.apply(VintageBuildTreeWorkController.kt:37)
	at org.gradle.internal.cc.impl.VintageBuildTreeWorkController$scheduleAndRunRequestedTasks$1.apply(VintageBuildTreeWorkController.kt:36)
	at org.gradle.composite.internal.DefaultIncludedBuildTaskGraph.withNewWorkGraph(DefaultIncludedBuildTaskGraph.java:115)
	at org.gradle.internal.cc.impl.VintageBuildTreeWorkController.scheduleAndRunRequestedTasks(VintageBuildTreeWorkController.kt:36)
	at org.gradle.internal.buildtree.DefaultBuildTreeLifecycleController.lambda$scheduleAndRunTasks$1(DefaultBuildTreeLifecycleController.java:76)
	at org.gradle.internal.buildtree.DefaultBuildTreeLifecycleController.lambda$runBuild$5(DefaultBuildTreeLifecycleController.java:121)
	at org.gradle.internal.model.StateTransitionController.lambda$transition$7(StateTransitionController.java:207)
	at org.gradle.internal.model.StateTransitionController.doTransition(StateTransitionController.java:304)
	at org.gradle.internal.model.StateTransitionController.lambda$transition$8(StateTransitionController.java:207)
	at org.gradle.internal.work.DefaultSynchronizer.withLock(DefaultSynchronizer.java:45)
	at org.gradle.internal.model.StateTransitionController.transition(StateTransitionController.java:207)
	at org.gradle.internal.buildtree.DefaultBuildTreeLifecycleController.runBuild(DefaultBuildTreeLifecycleController.java:118)
	at org.gradle.internal.buildtree.DefaultBuildTreeLifecycleController.scheduleAndRunTasks(DefaultBuildTreeLifecycleController.java:76)
	at org.gradle.internal.buildtree.DefaultBuildTreeLifecycleController.scheduleAndRunTasks(DefaultBuildTreeLifecycleController.java:71)
	at org.gradle.tooling.internal.provider.ExecuteBuildActionRunner.run(ExecuteBuildActionRunner.java:31)
	at org.gradle.launcher.exec.ChainingBuildActionRunner.run(ChainingBuildActionRunner.java:35)
	at org.gradle.internal.buildtree.ProblemReportingBuildActionRunner.run(ProblemReportingBuildActionRunner.java:55)
	at org.gradle.launcher.exec.BuildOutcomeReportingBuildActionRunner.run(BuildOutcomeReportingBuildActionRunner.java:83)
	at org.gradle.tooling.internal.provider.FileSystemWatchingBuildActionRunner.run(FileSystemWatchingBuildActionRunner.java:135)
	at org.gradle.launcher.exec.BuildCompletionNotifyingBuildActionRunner.run(BuildCompletionNotifyingBuildActionRunner.java:64)
	at org.gradle.launcher.exec.RootBuildLifecycleBuildActionExecutor.lambda$execute$0(RootBuildLifecycleBuildActionExecutor.java:101)
	at org.gradle.composite.internal.DefaultRootBuildState.run(DefaultRootBuildState.java:119)
	at org.gradle.launcher.exec.RootBuildLifecycleBuildActionExecutor.execute(RootBuildLifecycleBuildActionExecutor.java:101)
	at org.gradle.launcher.exec.DefaultBuildTreeActionExecutor.runBuildTreeLifecycle(DefaultBuildTreeActionExecutor.java:126)
	at org.gradle.launcher.exec.DefaultBuildTreeActionExecutor.access$100(DefaultBuildTreeActionExecutor.java:52)
	at org.gradle.launcher.exec.DefaultBuildTreeActionExecutor$2.call(DefaultBuildTreeActionExecutor.java:98)
	at org.gradle.launcher.exec.DefaultBuildTreeActionExecutor$2.call(DefaultBuildTreeActionExecutor.java:94)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$CallableBuildOperationWorker.execute(DefaultBuildOperationRunner.java:210)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$CallableBuildOperationWorker.execute(DefaultBuildOperationRunner.java:205)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:67)
	at org.gradle.internal.operations.DefaultBuildOperationRunner$2.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:167)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.execute(DefaultBuildOperationRunner.java:60)
	at org.gradle.internal.operations.DefaultBuildOperationRunner.call(DefaultBuildOperationRunner.java:54)
	at org.gradle.launcher.exec.DefaultBuildTreeActionExecutor.runAsBuildOperation(DefaultBuildTreeActionExecutor.java:94)
	at org.gradle.launcher.exec.DefaultBuildTreeActionExecutor.lambda$runBuildTreeAction$0(DefaultBuildTreeActionExecutor.java:88)
	at org.gradle.internal.work.DefaultWorkerLeaseService.lambda$runAndReleaseLocks$0(DefaultWorkerLeaseService.java:300)
	at org.gradle.internal.work.ResourceLockStatistics$1.measure(ResourceLockStatistics.java:43)
	at org.gradle.internal.work.DefaultWorkerLeaseService.runAndReleaseLocks(DefaultWorkerLeaseService.java:298)
	at org.gradle.internal.work.DefaultWorkerLeaseService.withLocksAcquired(DefaultWorkerLeaseService.java:294)
	at org.gradle.internal.work.DefaultWorkerLeaseService.withLocks(DefaultWorkerLeaseService.java:286)
	at org.gradle.internal.work.DefaultWorkerLeaseService.runAsWorkerThread(DefaultWorkerLeaseService.java:130)
	at org.gradle.launcher.exec.DefaultBuildTreeActionExecutor.runBuildTreeAction(DefaultBuildTreeActionExecutor.java:88)
	at org.gradle.tooling.internal.provider.continuous.ContinuousBuildActionExecutor.execute(ContinuousBuildActionExecutor.java:111)
	at org.gradle.tooling.internal.provider.SubscribableBuildActionExecutor.execute(SubscribableBuildActionExecutor.java:64)
	at org.gradle.internal.session.DefaultBuildSessionContext.execute(DefaultBuildSessionContext.java:46)
	at org.gradle.internal.buildprocess.execution.BuildSessionLifecycleBuildActionExecutor$ActionImpl.apply(BuildSessionLifecycleBuildActionExecutor.java:106)
	at org.gradle.internal.buildprocess.execution.BuildSessionLifecycleBuildActionExecutor$ActionImpl.apply(BuildSessionLifecycleBuildActionExecutor.java:94)
	at org.gradle.internal.session.BuildSessionState.run(BuildSessionState.java:73)
	at org.gradle.internal.buildprocess.execution.BuildSessionLifecycleBuildActionExecutor.execute(BuildSessionLifecycleBuildActionExecutor.java:67)
	at org.gradle.internal.buildprocess.execution.BuildSessionLifecycleBuildActionExecutor.execute(BuildSessionLifecycleBuildActionExecutor.java:45)
	at org.gradle.internal.buildprocess.execution.StartParamsValidatingActionExecutor.execute(StartParamsValidatingActionExecutor.java:57)
	at org.gradle.internal.buildprocess.execution.StartParamsValidatingActionExecutor.execute(StartParamsValidatingActionExecutor.java:32)
	at org.gradle.internal.buildprocess.execution.SessionFailureReportingActionExecutor.execute(SessionFailureReportingActionExecutor.java:51)
	at org.gradle.internal.buildprocess.execution.SessionFailureReportingActionExecutor.execute(SessionFailureReportingActionExecutor.java:39)
	at org.gradle.internal.buildprocess.execution.SetupLoggingActionExecutor.execute(SetupLoggingActionExecutor.java:47)
	at org.gradle.internal.buildprocess.execution.SetupLoggingActionExecutor.execute(SetupLoggingActionExecutor.java:31)
	at org.gradle.launcher.daemon.server.exec.ExecuteBuild.doBuild(ExecuteBuild.java:70)
	at org.gradle.launcher.daemon.server.exec.BuildCommandOnly.execute(BuildCommandOnly.java:37)
	at org.gradle.launcher.daemon.server.api.DaemonCommandExecution.proceed(DaemonCommandExecution.java:104)
	at org.gradle.launcher.daemon.server.exec.WatchForDisconnection.execute(WatchForDisconnection.java:39)
	at org.gradle.launcher.daemon.server.api.DaemonCommandExecution.proceed(DaemonCommandExecution.java:104)
	at org.gradle.launcher.daemon.server.exec.ResetDeprecationLogger.execute(ResetDeprecationLogger.java:29)
	at org.gradle.launcher.daemon.server.api.DaemonCommandExecution.proceed(DaemonCommandExecution.java:104)
	at org.gradle.launcher.daemon.server.exec.RequestStopIfSingleUsedDaemon.execute(RequestStopIfSingleUsedDaemon.java:35)
	at org.gradle.launcher.daemon.server.api.DaemonCommandExecution.proceed(DaemonCommandExecution.java:104)
	at org.gradle.launcher.daemon.server.exec.ForwardClientInput.lambda$execute$0(ForwardClientInput.java:40)
	at org.gradle.internal.daemon.clientinput.ClientInputForwarder.forwardInput(ClientInputForwarder.java:80)
	at org.gradle.launcher.daemon.server.exec.ForwardClientInput.execute(ForwardClientInput.java:37)
	at org.gradle.launcher.daemon.server.api.DaemonCommandExecution.proceed(DaemonCommandExecution.java:104)
	at org.gradle.launcher.daemon.server.exec.LogAndCheckHealth.execute(LogAndCheckHealth.java:53)
	at org.gradle.launcher.daemon.server.api.DaemonCommandExecution.proceed(DaemonCommandExecution.java:104)
	at org.gradle.launcher.daemon.server.exec.ApplyClientEnvironmentVariables.doBuild(ApplyClientEnvironmentVariables.java:80)
	at org.gradle.launcher.daemon.server.exec.BuildCommandOnly.execute(BuildCommandOnly.java:37)
	at org.gradle.launcher.daemon.server.api.DaemonCommandExecution.proceed(DaemonCommandExecution.java:104)
	at org.gradle.launcher.daemon.server.exec.LogToClient.doBuild(LogToClient.java:63)
	at org.gradle.launcher.daemon.server.exec.BuildCommandOnly.execute(BuildCommandOnly.java:37)
	at org.gradle.launcher.daemon.server.api.DaemonCommandExecution.proceed(DaemonCommandExecution.java:104)
	at org.gradle.launcher.daemon.server.exec.EstablishBuildEnvironment.doBuild(EstablishBuildEnvironment.java:74)
	at org.gradle.launcher.daemon.server.exec.BuildCommandOnly.execute(BuildCommandOnly.java:37)
	at org.gradle.launcher.daemon.server.api.DaemonCommandExecution.proceed(DaemonCommandExecution.java:104)
	at org.gradle.launcher.daemon.server.exec.StartBuildOrRespondWithBusy$1.run(StartBuildOrRespondWithBusy.java:52)
	at org.gradle.launcher.daemon.server.DaemonStateCoordinator.lambda$runCommand$0(DaemonStateCoordinator.java:321)
	at org.gradle.internal.concurrent.ExecutorPolicy$CatchAndRecordFailures.onExecute(ExecutorPolicy.java:64)
	at org.gradle.internal.concurrent.AbstractManagedExecutor$1.run(AbstractManagedExecutor.java:47)


Deprecated Gradle features were used in this build, making it incompatible with Gradle 10.

You can use '--warning-mode all' to show the individual deprecation warnings and determine if they come from your own scripts or plugins.

For more on this, please refer to https://docs.gradle.org/9.6.1/userguide/command_line_interface.html#sec:command_line_warnings in the Gradle documentation.

BUILD FAILED in 12s
```

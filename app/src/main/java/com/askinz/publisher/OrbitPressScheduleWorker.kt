package com.askinz.publisher

import android.content.Context
import androidx.work.Data
import androidx.work.Worker
import androidx.work.WorkerParameters

/**
 * Durable scheduler boundary. Network execution remains behind an explicit foreground
 * action until OAuth/token refresh and encrypted queue storage are configured.
 */
class OrbitPressScheduleWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val operation = inputData.getString(KEY_OPERATION).orEmpty()
    val siteId = inputData.getString(KEY_SITE_ID).orEmpty()
    return try {
      ScheduleContract.validate(inputData.getLong(KEY_DELAY_MINUTES, 1), operation)
      applicationContext.getSharedPreferences("orbitpress_schedule_state", Context.MODE_PRIVATE)
        .edit()
        .putString("last_ready_operation", operation)
        .putString("last_ready_site", siteId)
        .putLong("last_ready_at", System.currentTimeMillis())
        .apply()
      Result.success(Data.Builder().putString("operation", operation).putString("siteId", siteId).build())
    } catch (_: IllegalArgumentException) {
      Result.failure()
    } catch (_: Exception) {
      Result.retry()
    }
  }

  companion object {
    const val KEY_OPERATION = "operation"
    const val KEY_SITE_ID = "siteId"
    const val KEY_DELAY_MINUTES = "delayMinutes"
  }
}

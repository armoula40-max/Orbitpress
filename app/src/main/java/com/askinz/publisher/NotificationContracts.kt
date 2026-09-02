package com.askinz.publisher

object NotificationContracts {
  enum class Kind { SUCCESS, FAILURE, DUPLICATE }

  fun shouldNotify(permissionGranted: Boolean): Boolean = permissionGranted

  fun classify(ok: Boolean, message: String): Kind = when {
    message.contains("duplicate", ignoreCase = true) || message.contains("already exists", ignoreCase = true) -> Kind.DUPLICATE
    ok -> Kind.SUCCESS
    else -> Kind.FAILURE
  }

  fun headline(kind: Kind): String = when (kind) {
    Kind.SUCCESS -> "Published successfully"
    Kind.FAILURE -> "Publishing failed"
    Kind.DUPLICATE -> "Duplicate prevented"
  }
}

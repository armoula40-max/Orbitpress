package com.askinz.publisher

data class WordPressCategoryRecord(val id: Int, val name: String)

object CategorySyncContracts {
  fun normalize(items: List<WordPressCategoryRecord>): List<WordPressCategoryRecord> =
    items.filter { it.id > 0 && it.name.isNotBlank() }
      .distinctBy { it.id }
      .sortedBy { it.name.lowercase() }
}

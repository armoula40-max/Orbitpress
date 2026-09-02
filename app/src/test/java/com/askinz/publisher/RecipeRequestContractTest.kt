package com.askinz.publisher

import org.junit.Assert.assertEquals
import org.junit.Test

class RecipeRequestContractTest {
  @Test
  fun numberedRoundupExtractsExactCount() {
    assertEquals(5, RecipeRequestContract.requestedCount("5 fall recipes"))
    assertEquals(10, RecipeRequestContract.requestedCount("10 easy soup recipes"))
  }

  @Test
  fun countIsBoundedForSafeLongFormRequests() {
    assertEquals(2, RecipeRequestContract.requestedCount("1 recipe"))
    assertEquals(12, RecipeRequestContract.requestedCount("20 winter recipes"))
  }

  @Test
  fun unnumberedRoundupUsesConservativeMultipleRecipeMode() {
    assertEquals(2, RecipeRequestContract.requestedCount("easy recipe roundup"))
    assertEquals(0, RecipeRequestContract.requestedCount("pumpkin bread"))
  }
}

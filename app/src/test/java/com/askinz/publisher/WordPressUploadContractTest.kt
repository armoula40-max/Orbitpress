package com.askinz.publisher

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WordPressUploadContractTest {
  @Test
  fun transcodesWebpOnly() {
    assertTrue(WordPressUploadContract.shouldTranscodeToJpeg("image/webp"))
    assertTrue(WordPressUploadContract.shouldTranscodeToJpeg("IMAGE/WEBP"))
    assertFalse(WordPressUploadContract.shouldTranscodeToJpeg("image/jpeg"))
    assertFalse(WordPressUploadContract.shouldTranscodeToJpeg("image/png"))
  }

  @Test
  fun recognizesWordPressFileTypeRejections() {
    val realWorldError = "Request failed (500): {\"code\":\"rest_upload_sideload_error\"," +
      "\"message\":\"Sorry, you are not allowed to upload this file type.\",\"data\":{\"status\":500}}"
    assertTrue(WordPressUploadContract.isFileTypeRejection(realWorldError))
    assertTrue(WordPressUploadContract.isFileTypeRejection("Request failed (400): rest_upload_image_type_not_supported"))
    assertTrue(WordPressUploadContract.isFileTypeRejection("Sorry, this file type is not permitted for security reasons."))
    // Unrelated failures must not trigger the JPEG retry path.
    assertFalse(WordPressUploadContract.isFileTypeRejection("Request failed (404): media route not found"))
    assertFalse(WordPressUploadContract.isFileTypeRejection(null))
  }

  @Test
  fun recognizesRolePermissionRejections() {
    val roleError = "Request failed (401): {\"code\":\"rest_cannot_create\"," +
      "\"message\":\"Sorry, you are not allowed to upload media on this site.\"}"
    assertTrue(WordPressUploadContract.isUploadPermissionRejection(roleError))
    // The file-type message must not be misclassified as a role problem.
    assertFalse(WordPressUploadContract.isUploadPermissionRejection("Sorry, you are not allowed to upload this file type."))
  }

  @Test
  fun mapsFailuresToActionableGuidance() {
    assertTrue(
      WordPressUploadContract.describeMediaFailure("rest_upload_sideload_error: not allowed to upload this file type")
        .contains("standard JPEG"),
    )
    assertTrue(
      WordPressUploadContract.describeMediaFailure("rest_cannot_create: not allowed to upload media on this site")
        .contains("upload_files"),
    )
    // Unknown messages are passed through unchanged.
    assertEquals("boom", WordPressUploadContract.describeMediaFailure("boom"))
  }

  @Test
  fun detectsProviderImageMagicBytes() {
    val png = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0)
    val jpeg = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte(), 0, 0)
    val webp = byteArrayOf('R'.code.toByte(), 'I'.code.toByte(), 'F'.code.toByte(), 'F'.code.toByte(), 0, 0, 0, 0, 'W'.code.toByte(), 'E'.code.toByte(), 'B'.code.toByte(), 'P'.code.toByte())

    assertEquals("image/png", PublishingContracts.detectImageMimeType(png))
    assertEquals("image/jpeg", PublishingContracts.detectImageMimeType(jpeg))
    assertEquals("image/webp", PublishingContracts.detectImageMimeType(webp))
    assertNull(PublishingContracts.detectImageMimeType(byteArrayOf(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)))
  }
}

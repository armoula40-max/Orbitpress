package com.askinz.publisher

/**
 * Compatibility rules for the WordPress REST media endpoint.
 *
 * WordPress's sideload handler rejects an upload with
 * `rest_upload_sideload_error` / "Sorry, you are not allowed to upload this
 * file type." whenever it cannot match both the file extension and the real
 * content (verified via fileinfo/GD) against the site's allowed MIME types.
 * WebP in particular is rejected by WordPress older than 5.8, by multisite
 * networks whose "Upload file types" list omits it, and by some security
 * plugins. JPEG is accepted by every WordPress install, so it is the safe
 * interchange format.
 */
object WordPressUploadContract {
  const val JPEG_MIME = "image/jpeg"
  const val JPEG_EXTENSION = "jpg"

  /** Longest edge kept when re-encoding an image for WordPress. */
  const val MAX_TRANSCODE_EDGE = 4096

  /** WebP is proactively re-encoded to JPEG at the WordPress boundary. */
  fun shouldTranscodeToJpeg(mimeType: String): Boolean =
    mimeType.equals("image/webp", ignoreCase = true)

  /** True when WordPress refused the upload because of the file type itself. */
  fun isFileTypeRejection(message: String?): Boolean {
    val text = message.orEmpty().lowercase()
    return text.contains("rest_upload_sideload_error") ||
      text.contains("rest_upload_image_type_not_supported") ||
      text.contains("rest_upload_invalid_mime_type") ||
      text.contains("not allowed to upload this file type") ||
      text.contains("this file type is not permitted")
  }

  /** True when the credentials work but the user role lacks upload_files. */
  fun isUploadPermissionRejection(message: String?): Boolean {
    val text = message.orEmpty().lowercase()
    return text.contains("rest_cannot_create") ||
      text.contains("not allowed to upload media")
  }

  /** Maps a raw WordPress media failure to an actionable, user-facing message. */
  fun describeMediaFailure(rawMessage: String?): String {
    val text = rawMessage.orEmpty().trim()
    return when {
      isFileTypeRejection(text) ->
        "WordPress rejected the image upload as a disallowed file type even after OrbitPress " +
          "re-sent it as a standard JPEG. Usually a security plugin or the host firewall " +
          "(WAF/ModSecurity) is stripping the uploaded file, the site is older than WordPress 5.8, " +
          "or JPEG uploads are disabled. Confirm you can add a JPEG in wp-admin → Media, then ask " +
          "your host to allow REST media uploads."
      isUploadPermissionRejection(text) ->
        "WordPress accepted the login, but this user role cannot upload media. " +
          "Use an Administrator, Editor, or Author account (the upload_files capability)."
      text.isBlank() ->
        "WordPress rejected the media upload without a reason. Check the site's security plugin or host firewall."
      else -> text
    }
  }
}

package com.askinz.publisher

import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.EOFException
import java.io.InputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URI
import java.nio.charset.StandardCharsets
import java.util.zip.GZIPInputStream
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SNIHostName
import javax.net.ssl.SNIServerName
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLPeerUnverifiedException
import javax.net.ssl.SSLSocket

/**
 * Minimal HTTPS/1.1 client that connects to an explicit IPv4 address while keeping the TLS handshake
 * (SNI + certificate hostname verification) and the `Host` header bound to the original hostname.
 *
 * Used only for wildcard-DNS hosts (sslip.io / nip.io) whose address is known without a resolver, so the
 * VPS scraper keeps working on carriers that answer "Unable to resolve host" for those providers.
 * Certificates are validated with the platform trust store exactly like HttpsURLConnection.
 */
object DirectTlsHttpClient {
  data class Response(val status: Int, val body: String)

  fun request(
    url: String,
    method: String,
    headers: Map<String, String>,
    body: ByteArray?,
    ipv4: String,
    connectTimeoutMillis: Int,
    readTimeoutMillis: Int,
  ): Response {
    val uri = URI(url)
    require(uri.scheme.equals("https", ignoreCase = true)) { "Direct connections are HTTPS only." }
    val host = uri.host ?: throw IllegalArgumentException("Scraper URL has no host.")
    val port = if (uri.port > 0) uri.port else 443
    val path = buildString {
      append(uri.rawPath?.ifBlank { "/" } ?: "/")
      uri.rawQuery?.let { append('?').append(it) }
    }
    val address = InetAddress.getByAddress(host, EmbeddedIpHostContract.ipv4Bytes(ipv4))
    val plain = Socket()
    var tls: SSLSocket? = null
    try {
      plain.connect(InetSocketAddress(address, port), connectTimeoutMillis)
      plain.soTimeout = readTimeoutMillis
      val socket = SSLContext.getDefault().socketFactory.createSocket(plain, host, port, true) as SSLSocket
      tls = socket
      socket.soTimeout = readTimeoutMillis
      val parameters = socket.sslParameters
      parameters.serverNames = listOf<SNIServerName>(SNIHostName(host))
      parameters.endpointIdentificationAlgorithm = "HTTPS"
      socket.sslParameters = parameters
      socket.startHandshake()
      if (!HttpsURLConnection.getDefaultHostnameVerifier().verify(host, socket.session)) {
        throw SSLPeerUnverifiedException("Certificate does not match $host.")
      }
      val payload = body ?: ByteArray(0)
      val request = StringBuilder()
        .append(method.uppercase()).append(' ').append(path).append(" HTTP/1.1\r\n")
        .append("Host: ").append(host).append(if (port != 443) ":$port" else "").append("\r\n")
      val lowerCaseNames = headers.keys.map { it.lowercase() }.toSet()
      if ("user-agent" !in lowerCaseNames) request.append("User-Agent: OrbitPress/").append(BuildConfig.VERSION_NAME).append("\r\n")
      if ("accept" !in lowerCaseNames) request.append("Accept: application/json\r\n")
      headers.forEach { (name, value) -> request.append(name).append(": ").append(value.replace("\r", "").replace("\n", "")).append("\r\n") }
      request.append("Accept-Encoding: gzip\r\n")
      request.append("Connection: close\r\n")
      if (body != null || method.uppercase() in setOf("POST", "PUT", "PATCH")) request.append("Content-Length: ").append(payload.size).append("\r\n")
      request.append("\r\n")
      socket.outputStream.apply {
        write(request.toString().toByteArray(StandardCharsets.ISO_8859_1))
        write(payload)
        flush()
      }
      return readResponse(BufferedInputStream(socket.inputStream, 16 * 1024))
    } finally {
      runCatching { tls?.close() }
      runCatching { plain.close() }
    }
  }

  private fun readResponse(input: InputStream): Response {
    val statusLine = readLine(input) ?: throw EOFException("Empty response from scraper.")
    val parts = statusLine.split(' ', limit = 3)
    val status = parts.getOrNull(1)?.toIntOrNull() ?: throw IllegalStateException("Malformed status line: $statusLine")
    val headers = linkedMapOf<String, String>()
    while (true) {
      val line = readLine(input) ?: break
      if (line.isEmpty()) break
      val separator = line.indexOf(':')
      if (separator > 0) headers[line.substring(0, separator).trim().lowercase()] = line.substring(separator + 1).trim()
    }
    val raw = when {
      headers["transfer-encoding"]?.contains("chunked", ignoreCase = true) == true -> readChunked(input)
      headers["content-length"]?.trim()?.toLongOrNull() != null -> readExactly(input, headers.getValue("content-length").trim().toLong())
      else -> input.readBytes()
    }
    val decoded = if (headers["content-encoding"]?.contains("gzip", ignoreCase = true) == true) GZIPInputStream(raw.inputStream()).use { it.readBytes() } else raw
    return Response(status, decoded.toString(StandardCharsets.UTF_8))
  }

  private fun readLine(input: InputStream): String? {
    val buffer = ByteArrayOutputStream()
    while (true) {
      val byte = input.read()
      if (byte == -1) return if (buffer.size() == 0) null else buffer.toString(StandardCharsets.ISO_8859_1.name())
      if (byte == '\n'.code) break
      if (byte != '\r'.code) buffer.write(byte)
    }
    return buffer.toString(StandardCharsets.ISO_8859_1.name())
  }

  private fun readExactly(input: InputStream, length: Long): ByteArray {
    require(length in 0..(64L * 1024 * 1024)) { "Response too large ($length bytes)." }
    val output = ByteArrayOutputStream(length.toInt().coerceAtLeast(16))
    val chunk = ByteArray(16 * 1024)
    var remaining = length
    while (remaining > 0) {
      val read = input.read(chunk, 0, minOf(chunk.size.toLong(), remaining).toInt())
      if (read == -1) throw EOFException("Scraper closed the connection early.")
      output.write(chunk, 0, read)
      remaining -= read
    }
    return output.toByteArray()
  }

  private fun readChunked(input: InputStream): ByteArray {
    val output = ByteArrayOutputStream()
    while (true) {
      val sizeLine = readLine(input) ?: throw EOFException("Scraper closed the connection early.")
      val size = sizeLine.substringBefore(';').trim().toLongOrNull(16) ?: throw IllegalStateException("Malformed chunk size: $sizeLine")
      if (size == 0L) {
        while (true) { val trailer = readLine(input) ?: break; if (trailer.isEmpty()) break }
        break
      }
      output.write(readExactly(input, size))
      readLine(input) // CRLF after the chunk
      require(output.size() <= 64 * 1024 * 1024) { "Response too large." }
    }
    return output.toByteArray()
  }
}

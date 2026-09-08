package com.askinz.publisher

import java.net.URI

/**
 * Wildcard-DNS hostnames such as `23.95.186.208.sslip.io` or `app-10-0-0-1.nip.io` carry their own IPv4
 * address. Several mobile carriers and ISP resolvers refuse to resolve those providers ("Unable to resolve
 * host"), so OrbitPress derives the address offline and connects to it directly while TLS SNI, certificate
 * validation and the Host header stay bound to the original hostname (see [DirectTlsHttpClient]).
 */
object EmbeddedIpHostContract {
  private val providers = listOf("sslip.io", "nip.io")
  private val embeddedQuad = Regex("""(?:^|[.-])(\d{1,3})[.-](\d{1,3})[.-](\d{1,3})[.-](\d{1,3})(?=[.-])""")

  fun isWildcardDnsHost(host: String?): Boolean {
    val normalized = normalize(host) ?: return false
    return providers.any { normalized == it || normalized.endsWith(".$it") }
  }

  /** Returns the dotted IPv4 address embedded in a sslip.io / nip.io hostname, or null for every other host. */
  fun embeddedIpv4(host: String?): String? {
    val normalized = normalize(host) ?: return null
    if (!isWildcardDnsHost(normalized)) return null
    val match = embeddedQuad.find(normalized) ?: return null
    val octets = match.groupValues.drop(1).map { it.toInt() }
    if (octets.any { it > 255 }) return null
    return octets.joinToString(".")
  }

  fun embeddedIpv4ForUrl(url: String?): String? = try {
    embeddedIpv4(URI(url?.trim().orEmpty()).host)
  } catch (_: Exception) {
    null
  }

  fun ipv4Bytes(ip: String): ByteArray {
    val parts = ip.split('.')
    require(parts.size == 4 && parts.all { part -> part.toIntOrNull()?.let { it in 0..255 } == true }) { "Invalid IPv4 address: $ip" }
    return ByteArray(4) { index -> parts[index].toInt().toByte() }
  }

  private fun normalize(host: String?): String? = host?.trim()?.trimEnd('.')?.lowercase()?.takeIf { it.isNotBlank() }
}

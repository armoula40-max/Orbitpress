package com.askinz.publisher

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class EmbeddedIpHostContractTest {
  @Test
  fun extractsTheAddressFromSslipAndNipHostnames() {
    assertEquals("23.95.186.208", EmbeddedIpHostContract.embeddedIpv4("23.95.186.208.sslip.io"))
    assertEquals("23.95.186.208", EmbeddedIpHostContract.embeddedIpv4("23-95-186-208.sslip.io"))
    assertEquals("23.95.186.208", EmbeddedIpHostContract.embeddedIpv4("scraper.23.95.186.208.sslip.io"))
    assertEquals("23.95.186.208", EmbeddedIpHostContract.embeddedIpv4("scraper-23-95-186-208.nip.io"))
    assertEquals("10.0.0.1", EmbeddedIpHostContract.embeddedIpv4("10.0.0.1.nip.io"))
    assertEquals("23.95.186.208", EmbeddedIpHostContract.embeddedIpv4(" 23.95.186.208.SSLIP.IO. "))
  }

  @Test
  fun derivesTheAddressFromFullUrls() {
    assertEquals("23.95.186.208", EmbeddedIpHostContract.embeddedIpv4ForUrl("https://23.95.186.208.sslip.io/api/pinterest/scrape"))
    assertEquals("23.95.186.208", EmbeddedIpHostContract.embeddedIpv4ForUrl("https://23.95.186.208.sslip.io:8443/health?x=1"))
    assertNull(EmbeddedIpHostContract.embeddedIpv4ForUrl("https://scraper.example.com/api"))
    assertNull(EmbeddedIpHostContract.embeddedIpv4ForUrl("not a url"))
    assertNull(EmbeddedIpHostContract.embeddedIpv4ForUrl(null))
  }

  @Test
  fun ignoresOrdinaryHostsAndLookalikes() {
    assertNull(EmbeddedIpHostContract.embeddedIpv4("scraper.example.com"))
    assertNull(EmbeddedIpHostContract.embeddedIpv4("1.2.3.4.example.com"))
    assertNull(EmbeddedIpHostContract.embeddedIpv4("sslip.io"))
    assertNull(EmbeddedIpHostContract.embeddedIpv4("evil-sslip.io"))
    assertNull(EmbeddedIpHostContract.embeddedIpv4("999.1.1.1.sslip.io"))
    assertNull(EmbeddedIpHostContract.embeddedIpv4("23.95.186.208"))
    assertNull(EmbeddedIpHostContract.embeddedIpv4(""))
    assertNull(EmbeddedIpHostContract.embeddedIpv4(null))
    assertFalse(EmbeddedIpHostContract.isWildcardDnsHost("example.com"))
    assertTrue(EmbeddedIpHostContract.isWildcardDnsHost("a.b.nip.io"))
  }

  @Test
  fun convertsAddressesToBytesAndRejectsGarbage() {
    assertArrayEquals(byteArrayOf(23, 95, 186.toByte(), 208.toByte()), EmbeddedIpHostContract.ipv4Bytes("23.95.186.208"))
    assertThrows(IllegalArgumentException::class.java) { EmbeddedIpHostContract.ipv4Bytes("23.95.186") }
    assertThrows(IllegalArgumentException::class.java) { EmbeddedIpHostContract.ipv4Bytes("23.95.186.999") }
  }
}

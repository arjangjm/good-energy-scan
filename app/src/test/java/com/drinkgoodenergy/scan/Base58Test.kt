package com.drinkgoodenergy.scan

import org.junit.Assert.assertEquals
import org.junit.Test

class Base58Test {
    @Test
    fun encodesKnownValues() {
        assertEquals("", Base58.encode(ByteArray(0)))
        assertEquals("1", Base58.encode(byteArrayOf(0)))
        // The Solana System Program address is 32 zero bytes.
        assertEquals("11111111111111111111111111111111", Base58.encode(ByteArray(32)))
        assertEquals("2NEpo7TZRRrLZSi2U", Base58.encode("Hello World!".toByteArray()))
    }
}

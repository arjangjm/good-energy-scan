package com.drinkgoodenergy.scan

/** Base58 (Bitcoin alphabet), the format Solana uses for addresses and signatures. */
object Base58 {
    private const val ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

    fun encode(input: ByteArray): String {
        if (input.isEmpty()) return ""
        var zeros = 0
        while (zeros < input.size && input[zeros].toInt() == 0) zeros++

        val number = input.copyOf()
        val out = CharArray(input.size * 2)
        var outStart = out.size
        var start = zeros
        while (start < number.size) {
            var remainder = 0
            for (i in start until number.size) {
                val digit = (number[i].toInt() and 0xFF) + remainder * 256
                number[i] = (digit / 58).toByte()
                remainder = digit % 58
            }
            out[--outStart] = ALPHABET[remainder]
            if (number[start].toInt() == 0) start++
        }
        while (outStart < out.size && out[outStart] == ALPHABET[0]) outStart++
        repeat(zeros) { out[--outStart] = ALPHABET[0] }
        return String(out, outStart, out.size - outStart)
    }
}

# SHA-256 one-block compress using Intel SHA-NI.
# SysV AMD64: rdi = uint32_t state[8], rsi = const uint8_t block[64]
#
# Follows the public Intel SHA extensions algorithm:
#   ABEF/CDGH state layout, SHA256RNDS2 + SHA256MSG1/MSG2.

	.text
	.p2align 4
	.globl	simplefile_sha256_compress_sha_ni
	.type	simplefile_sha256_compress_sha_ni, @function
simplefile_sha256_compress_sha_ni:
	movdqu	xmm10, [rdi]
	movdqu	xmm11, [rdi + 16]
	pshufd	xmm10, xmm10, 0xB1
	pshufd	xmm11, xmm11, 0x1B
	movdqa	xmm8, xmm10
	palignr	xmm8, xmm11, 8
	pblendw	xmm11, xmm10, 0xF0
	movdqa	xmm6, xmm8
	movdqa	xmm7, xmm11

	movdqa	xmm15, [rip + .Lbyteswap]

	# Rounds 0-3
	movdqu	xmm3, [rsi]
	pshufb	xmm3, xmm15
	movdqa	xmm0, xmm3
	paddd	xmm0, [rip + .LK + 0]
	sha256rnds2 xmm11, xmm8
	pshufd	xmm0, xmm0, 0x0E
	sha256rnds2 xmm8, xmm11

	# Rounds 4-7
	movdqu	xmm4, [rsi + 16]
	pshufb	xmm4, xmm15
	movdqa	xmm0, xmm4
	paddd	xmm0, [rip + .LK + 16]
	sha256rnds2 xmm11, xmm8
	pshufd	xmm0, xmm0, 0x0E
	sha256rnds2 xmm8, xmm11
	sha256msg1 xmm3, xmm4

	# Rounds 8-11
	movdqu	xmm5, [rsi + 32]
	pshufb	xmm5, xmm15
	movdqa	xmm0, xmm5
	paddd	xmm0, [rip + .LK + 32]
	sha256rnds2 xmm11, xmm8
	pshufd	xmm0, xmm0, 0x0E
	sha256rnds2 xmm8, xmm11
	sha256msg1 xmm4, xmm5

	# Rounds 12-15
	movdqu	xmm2, [rsi + 48]
	pshufb	xmm2, xmm15
	movdqa	xmm0, xmm2
	paddd	xmm0, [rip + .LK + 48]
	sha256rnds2 xmm11, xmm8
	movdqa	xmm1, xmm2
	palignr	xmm1, xmm5, 4
	paddd	xmm3, xmm1
	sha256msg2 xmm3, xmm2
	pshufd	xmm0, xmm0, 0x0E
	sha256rnds2 xmm8, xmm11
	sha256msg1 xmm5, xmm2

	# Rounds 16-19
	movdqa	xmm0, xmm3
	paddd	xmm0, [rip + .LK + 64]
	sha256rnds2 xmm11, xmm8
	movdqa	xmm1, xmm3
	palignr	xmm1, xmm2, 4
	paddd	xmm4, xmm1
	sha256msg2 xmm4, xmm3
	pshufd	xmm0, xmm0, 0x0E
	sha256rnds2 xmm8, xmm11
	sha256msg1 xmm2, xmm3

	# Rounds 20-23
	movdqa	xmm0, xmm4
	paddd	xmm0, [rip + .LK + 80]
	sha256rnds2 xmm11, xmm8
	movdqa	xmm1, xmm4
	palignr	xmm1, xmm3, 4
	paddd	xmm5, xmm1
	sha256msg2 xmm5, xmm4
	pshufd	xmm0, xmm0, 0x0E
	sha256rnds2 xmm8, xmm11
	sha256msg1 xmm3, xmm4

	# Rounds 24-27
	movdqa	xmm0, xmm5
	paddd	xmm0, [rip + .LK + 96]
	sha256rnds2 xmm11, xmm8
	movdqa	xmm1, xmm5
	palignr	xmm1, xmm4, 4
	paddd	xmm2, xmm1
	sha256msg2 xmm2, xmm5
	pshufd	xmm0, xmm0, 0x0E
	sha256rnds2 xmm8, xmm11
	sha256msg1 xmm4, xmm5

	# Rounds 28-31
	movdqa	xmm0, xmm2
	paddd	xmm0, [rip + .LK + 112]
	sha256rnds2 xmm11, xmm8
	movdqa	xmm1, xmm2
	palignr	xmm1, xmm5, 4
	paddd	xmm3, xmm1
	sha256msg2 xmm3, xmm2
	pshufd	xmm0, xmm0, 0x0E
	sha256rnds2 xmm8, xmm11
	sha256msg1 xmm5, xmm2

	# Rounds 32-35
	movdqa	xmm0, xmm3
	paddd	xmm0, [rip + .LK + 128]
	sha256rnds2 xmm11, xmm8
	movdqa	xmm1, xmm3
	palignr	xmm1, xmm2, 4
	paddd	xmm4, xmm1
	sha256msg2 xmm4, xmm3
	pshufd	xmm0, xmm0, 0x0E
	sha256rnds2 xmm8, xmm11
	sha256msg1 xmm2, xmm3

	# Rounds 36-39
	movdqa	xmm0, xmm4
	paddd	xmm0, [rip + .LK + 144]
	sha256rnds2 xmm11, xmm8
	movdqa	xmm1, xmm4
	palignr	xmm1, xmm3, 4
	paddd	xmm5, xmm1
	sha256msg2 xmm5, xmm4
	pshufd	xmm0, xmm0, 0x0E
	sha256rnds2 xmm8, xmm11
	sha256msg1 xmm3, xmm4

	# Rounds 40-43
	movdqa	xmm0, xmm5
	paddd	xmm0, [rip + .LK + 160]
	sha256rnds2 xmm11, xmm8
	movdqa	xmm1, xmm5
	palignr	xmm1, xmm4, 4
	paddd	xmm2, xmm1
	sha256msg2 xmm2, xmm5
	pshufd	xmm0, xmm0, 0x0E
	sha256rnds2 xmm8, xmm11
	sha256msg1 xmm4, xmm5

	# Rounds 44-47
	movdqa	xmm0, xmm2
	paddd	xmm0, [rip + .LK + 176]
	sha256rnds2 xmm11, xmm8
	movdqa	xmm1, xmm2
	palignr	xmm1, xmm5, 4
	paddd	xmm3, xmm1
	sha256msg2 xmm3, xmm2
	pshufd	xmm0, xmm0, 0x0E
	sha256rnds2 xmm8, xmm11
	sha256msg1 xmm5, xmm2

	# Rounds 48-51
	movdqa	xmm0, xmm3
	paddd	xmm0, [rip + .LK + 192]
	sha256rnds2 xmm11, xmm8
	movdqa	xmm1, xmm3
	palignr	xmm1, xmm2, 4
	paddd	xmm4, xmm1
	sha256msg2 xmm4, xmm3
	pshufd	xmm0, xmm0, 0x0E
	sha256rnds2 xmm8, xmm11
	sha256msg1 xmm2, xmm3

	# Rounds 52-55
	movdqa	xmm0, xmm4
	paddd	xmm0, [rip + .LK + 208]
	sha256rnds2 xmm11, xmm8
	movdqa	xmm1, xmm4
	palignr	xmm1, xmm3, 4
	paddd	xmm5, xmm1
	sha256msg2 xmm5, xmm4
	pshufd	xmm0, xmm0, 0x0E
	sha256rnds2 xmm8, xmm11

	# Rounds 56-59
	movdqa	xmm0, xmm5
	paddd	xmm0, [rip + .LK + 224]
	sha256rnds2 xmm11, xmm8
	movdqa	xmm1, xmm5
	palignr	xmm1, xmm4, 4
	paddd	xmm2, xmm1
	sha256msg2 xmm2, xmm5
	pshufd	xmm0, xmm0, 0x0E
	sha256rnds2 xmm8, xmm11

	# Rounds 60-63
	movdqa	xmm0, xmm2
	paddd	xmm0, [rip + .LK + 240]
	sha256rnds2 xmm11, xmm8
	pshufd	xmm0, xmm0, 0x0E
	sha256rnds2 xmm8, xmm11

	paddd	xmm8, xmm6
	paddd	xmm11, xmm7

	pshufd	xmm10, xmm8, 0x1B
	pshufd	xmm11, xmm11, 0xB1
	movdqa	xmm8, xmm10
	pblendw	xmm8, xmm11, 0xF0
	palignr	xmm11, xmm10, 8
	movdqu	[rdi], xmm8
	movdqu	[rdi + 16], xmm11
	ret
	.size	simplefile_sha256_compress_sha_ni, .-simplefile_sha256_compress_sha_ni

	.section	.rodata
	.p2align 4
.Lbyteswap:
	.byte	3,2,1,0, 7,6,5,4, 11,10,9,8, 15,14,13,12
.LK:
	.long	0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5
	.long	0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5
	.long	0xd807aa98,0x12835b01,0x243185be,0x550c7dc3
	.long	0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174
	.long	0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc
	.long	0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da
	.long	0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7
	.long	0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967
	.long	0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13
	.long	0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85
	.long	0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3
	.long	0xd192e819,0xd6990624,0xf40e3585,0x106aa070
	.long	0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5
	.long	0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3
	.long	0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208
	.long	0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2

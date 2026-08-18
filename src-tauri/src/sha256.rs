use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};

const BLOCK_SIZE: usize = 64;
const DIGEST_SIZE: usize = 32;
const INITIAL_STATE: [u32; 8] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
    0x5be0cd19,
];

#[cfg(target_arch = "x86_64")]
core::arch::global_asm!(include_str!("sha256_sha_ni.s"));

#[cfg(target_arch = "x86_64")]
unsafe extern "C" {
    fn simplefile_sha256_compress_sha_ni(state: *mut u32, block: *const u8);
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Sha256Backend {
    ShaNi,
    Software,
}

pub fn selected_backend() -> Sha256Backend {
    if sha_ni_available() {
        Sha256Backend::ShaNi
    } else {
        Sha256Backend::Software
    }
}

fn sha_ni_available() -> bool {
    #[cfg(target_arch = "x86_64")]
    {
        is_x86_feature_detected!("sha") && is_x86_feature_detected!("sse4.1")
    }
    #[cfg(not(target_arch = "x86_64"))]
    {
        false
    }
}

pub struct Sha256 {
    backend: Sha256Backend,
    bit_len: u64,
    buffer: [u8; BLOCK_SIZE],
    buffer_len: usize,
    software: Option<sha2::Sha256>,
    state: [u32; 8],
}

impl Sha256 {
    pub fn new() -> Self {
        Self::with_backend(selected_backend())
    }

    pub fn with_backend(backend: Sha256Backend) -> Self {
        if backend == Sha256Backend::ShaNi && sha_ni_available() {
            Self {
                backend: Sha256Backend::ShaNi,
                bit_len: 0,
                buffer: [0; BLOCK_SIZE],
                buffer_len: 0,
                software: None,
                state: INITIAL_STATE,
            }
        } else {
            Self {
                backend: Sha256Backend::Software,
                bit_len: 0,
                buffer: [0; BLOCK_SIZE],
                buffer_len: 0,
                software: Some(sha2::Digest::new()),
                state: INITIAL_STATE,
            }
        }
    }

    pub fn update(&mut self, data: &[u8]) {
        if let Some(hasher) = self.software.as_mut() {
            sha2::Digest::update(hasher, data);
            return;
        }

        let mut input = data;
        if self.buffer_len > 0 {
            let take = (BLOCK_SIZE - self.buffer_len).min(input.len());
            self.buffer[self.buffer_len..self.buffer_len + take].copy_from_slice(&input[..take]);
            self.buffer_len += take;
            input = &input[take..];
            if self.buffer_len == BLOCK_SIZE {
                let block = self.buffer;
                self.compress_block(&block);
                self.bit_len += 512;
                self.buffer_len = 0;
            }
        }

        while input.len() >= BLOCK_SIZE {
            let mut block = [0u8; BLOCK_SIZE];
            block.copy_from_slice(&input[..BLOCK_SIZE]);
            self.compress_block(&block);
            self.bit_len += 512;
            input = &input[BLOCK_SIZE..];
        }

        if !input.is_empty() {
            self.buffer[..input.len()].copy_from_slice(input);
            self.buffer_len = input.len();
        }
    }

    pub fn finalize(mut self) -> [u8; DIGEST_SIZE] {
        if let Some(hasher) = self.software.take() {
            let digest = sha2::Digest::finalize(hasher);
            let mut out = [0u8; DIGEST_SIZE];
            out.copy_from_slice(&digest);
            return out;
        }

        let mut block = [0u8; BLOCK_SIZE];
        block[..self.buffer_len].copy_from_slice(&self.buffer[..self.buffer_len]);
        let bit_len = self.bit_len + (self.buffer_len as u64 * 8);
        block[self.buffer_len] = 0x80;

        if self.buffer_len >= 56 {
            self.compress_block(&block);
            block = [0u8; BLOCK_SIZE];
        }

        block[56..].copy_from_slice(&bit_len.to_be_bytes());
        self.compress_block(&block);

        let mut out = [0u8; DIGEST_SIZE];
        for (index, word) in self.state.iter().enumerate() {
            out[index * 4..(index + 1) * 4].copy_from_slice(&word.to_be_bytes());
        }
        out
    }

    fn compress_block(&mut self, block: &[u8; BLOCK_SIZE]) {
        #[cfg(target_arch = "x86_64")]
        if self.backend == Sha256Backend::ShaNi {
            unsafe {
                simplefile_sha256_compress_sha_ni(self.state.as_mut_ptr(), block.as_ptr());
            }
            return;
        }

        let _ = block;
        unreachable!("SHA-NI backend selected without an assembly implementation");
    }
}

pub fn hash_bytes(data: &[u8]) -> [u8; DIGEST_SIZE] {
    hash_bytes_with(data, selected_backend())
}

pub fn hash_bytes_with(data: &[u8], backend: Sha256Backend) -> [u8; DIGEST_SIZE] {
    let mut hasher = Sha256::with_backend(backend);
    hasher.update(data);
    hasher.finalize()
}

pub fn hex_encode(bytes: impl AsRef<[u8]>) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let bytes = bytes.as_ref();
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

pub fn hash_reader<R: Read>(
    reader: &mut R,
    limit: Option<u64>,
    cancel: Option<&AtomicBool>,
) -> Result<[u8; DIGEST_SIZE], std::io::Error> {
    let mut hasher = Sha256::new();
    let mut remaining = limit;
    let mut buffer = [0u8; 65536];

    loop {
        if cancel.is_some_and(|flag| flag.load(Ordering::Relaxed)) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Interrupted,
                "cancelled",
            ));
        }

        let want = match remaining {
            Some(0) => break,
            Some(left) => (left as usize).min(buffer.len()),
            None => buffer.len(),
        };
        let n = reader.read(&mut buffer[..want])?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
        if let Some(left) = remaining.as_mut() {
            *left -= n as u64;
        }
    }

    Ok(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::{hash_bytes_with, hex_encode, selected_backend, Sha256Backend};

    fn assert_vector(input: &[u8], expected: &str) {
        let software = hex_encode(hash_bytes_with(input, Sha256Backend::Software));
        assert_eq!(software, expected, "software SHA-256 mismatch");

        if selected_backend() == Sha256Backend::ShaNi {
            let hardware = hex_encode(hash_bytes_with(input, Sha256Backend::ShaNi));
            assert_eq!(hardware, expected, "SHA-NI assembly SHA-256 mismatch");
        }
    }

    #[test]
    fn matches_nist_vectors() {
        assert_vector(
            b"",
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        );
        assert_vector(
            b"abc",
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        );
        assert_vector(
            b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
        );
        assert_vector(
            &b"a".repeat(1_000_000),
            "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
        );
        let odd = [0u8; 63];
        let expected = hex_encode(hash_bytes_with(&odd, Sha256Backend::Software));
        if selected_backend() == Sha256Backend::ShaNi {
            assert_eq!(hex_encode(hash_bytes_with(&odd, Sha256Backend::ShaNi)), expected);
        }
    }

    #[test]
    fn multi_update_matches_single_shot() {
        let chunks = [b"hello ".as_slice(), b"world", b"!", &[7u8; 80]];
        let whole: Vec<u8> = chunks.concat();
        let expected = hex_encode(hash_bytes_with(&whole, Sha256Backend::Software));

        let mut hasher = super::Sha256::new();
        for chunk in chunks {
            hasher.update(chunk);
        }
        assert_eq!(hex_encode(hasher.finalize()), expected);
    }
}

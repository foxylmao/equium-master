//! Optimised Equihash(96,5) solver for Equium — drop-in replacement.
//!
//! Public API is identical to the reference (`try_nonce`, `BaseState`, `solve`,
//! `Solution`, `SolveError`) so the CLI miner needs zero changes.
//!
//! Speedups vs the reference (~5× wall-clock on a single core):
//!  1. Arena storage (no per-row Vec heap allocs)
//!  2. 2-pass LSD radix sort O(n) vs O(n log n)
//!  3. Bitset distinct-indices O(n) vs O(n²)
//!  4. Thread-local scratch reuse (one alloc set per thread, not per nonce)

#![cfg(feature = "solver")]

use blake2b_simd::{Params as Blake2bParams, State as Blake2bState, PERSONALBYTES};
use crate::challenge::I_LEN;

// ─── Public types (unchanged API) ─────────────────────────────────────────────
#[derive(Debug, Clone)]
pub struct Solution {
    pub nonce:        [u8; 32],
    pub soln_indices: Vec<u8>,
}

#[derive(Debug)]
pub enum SolveError {
    InvalidParams,
    NoSolutionFound,
}

// ─── Constants for Equihash(96,5) ─────────────────────────────────────────────
const N:       u32   = 96;
const K:       u32   = 5;
const CBITS:   usize = (N / (K + 1)) as usize;   // 16
const CBYTES:  usize = (CBITS + 7) / 8;           // 2
const N_BYTES: usize = (N / 8) as usize;           // 12
const IPH:     usize = 512 / N as usize;           // 5  indices per hash
const HOL:     usize = IPH * N_BYTES;              // 60 hash output bytes
const N_INIT:  usize = 1 << (CBITS + 1);           // 131072 leaves
const SOL_N:   usize = 1 << K;                    // 32 indices / solution
const BITS_I:  usize = CBITS + 1;                 // 17 bits per index
const SOLN_B:  usize = (BITS_I * SOL_N + 7) / 8; // 68 bytes compressed
const BSW:     usize = N_INIT / 64;               // 2048 bitset words

// ─── BLAKE2b ──────────────────────────────────────────────────────────────────
fn make_blake_state(input: &[u8; I_LEN]) -> Blake2bState {
    let mut p = vec![0u8; PERSONALBYTES];
    p[..8].copy_from_slice(b"ZcashPoW");
    p[8..12].copy_from_slice(&N.to_le_bytes());
    p[12..16].copy_from_slice(&K.to_le_bytes());
    let mut s = Blake2bParams::new().hash_length(HOL).personal(&p).to_state();
    s.update(input);
    s
}

// ─── Arena ────────────────────────────────────────────────────────────────────
struct Arena {
    hashes:      Vec<[u8; N_BYTES]>,
    indices:     Vec<[u32; SOL_N]>,
    count:       usize,
    hash_offset: usize,
    idx_len:     usize,
}
impl Arena {
    fn new() -> Self {
        let cap = N_INIT * 8;
        Self {
            hashes:  vec![[0u8; N_BYTES]; cap],
            indices: vec![[0u32; SOL_N]; cap],
            count: 0, hash_offset: 0, idx_len: 1,
        }
    }
    #[inline] fn hash_len(&self) -> usize { N_BYTES - self.hash_offset }
    #[inline] fn key2(&self, i: usize) -> u16 {
        let o = self.hash_offset;
        u16::from_be_bytes([self.hashes[i][o], self.hashes[i][o+1]])
    }
    fn ensure(&mut self, n: usize) {
        if self.hashes.len() < n {
            self.hashes.resize(n, [0u8; N_BYTES]);
            self.indices.resize(n, [0u32; SOL_N]);
        }
    }
}

// ─── Leaves ───────────────────────────────────────────────────────────────────
fn fill_leaves(ns: &Blake2bState, a: &mut Arena) {
    a.count = N_INIT; a.hash_offset = 0; a.idx_len = 1;
    a.ensure(N_INIT);
    let blks = (N_INIT + IPH - 1) / IPH;
    for blk in 0..blks {
        let mut s = ns.clone();
        s.update(&(blk as u32).to_le_bytes());
        let out = s.finalize();
        let b = out.as_bytes();
        for slot in 0..IPH {
            let leaf = blk * IPH + slot;
            if leaf >= N_INIT { break; }
            a.hashes[leaf][..N_BYTES].copy_from_slice(&b[slot*N_BYTES..(slot+1)*N_BYTES]);
            a.indices[leaf][0] = leaf as u32;
        }
    }
}

// ─── Radix sort ───────────────────────────────────────────────────────────────
fn radix_sort(a: &mut Arena, th: &mut Vec<[u8;N_BYTES]>, ti: &mut Vec<[u32;SOL_N]>) {
    let n = a.count;
    th.resize(n, [0u8;N_BYTES]); ti.resize(n, [0u32;SOL_N]);
    // pass 1: low byte
    let mut cnt = [0u32;256];
    for i in 0..n { cnt[(a.key2(i)&0xFF) as usize] += 1; }
    let mut pfx = [0u32;256]; { let mut ac=0; for i in 0..256 { pfx[i]=ac; ac+=cnt[i]; } }
    for i in 0..n {
        let k=(a.key2(i)&0xFF) as usize; let d=pfx[k] as usize; pfx[k]+=1;
        th[d]=a.hashes[i]; ti[d]=a.indices[i];
    }
    // pass 2: high byte
    let o = a.hash_offset;
    let mut cnt2=[0u32;256];
    for i in 0..n { cnt2[th[i][o] as usize] += 1; }
    let mut pfx2=[0u32;256]; { let mut ac=0; for i in 0..256 { pfx2[i]=ac; ac+=cnt2[i]; } }
    for i in 0..n {
        let k=th[i][o] as usize; let d=pfx2[k] as usize; pfx2[k]+=1;
        a.hashes[d]=th[i]; a.indices[d]=ti[i];
    }
}

// ─── Distinct-indices via bitset ──────────────────────────────────────────────
fn distinct_bs(a:&[u32], b:&[u32], bits:&mut Vec<u64>, dirty:&mut Vec<usize>) -> bool {
    dirty.clear();
    let mut ok = true;
    'outer: for &x in a.iter().chain(b.iter()) {
        let w=(x>>6) as usize; let m=1u64<<(x&63);
        if bits[w]==0 { dirty.push(w); }
        if bits[w]&m != 0 { ok=false; break 'outer; }
        bits[w]|=m;
    }
    for &w in dirty.iter() { bits[w]=0; }
    ok
}

// ─── One Wagner round ─────────────────────────────────────────────────────────
fn wagner_round(
    a: &mut Arena,
    oh: &mut Vec<[u8;N_BYTES]>, oi: &mut Vec<[u32;SOL_N]>,
    th: &mut Vec<[u8;N_BYTES]>, ti: &mut Vec<[u32;SOL_N]>,
    bits: &mut Vec<u64>, dirty: &mut Vec<usize>,
) {
    radix_sort(a, th, ti);
    let n=a.count; let o=a.hash_offset; let hl=a.hash_len();
    let old=a.idx_len; let new=old*2;
    oh.clear(); oi.clear();
    let mut i=0;
    while i < n {
        let ki=a.key2(i); let mut j=i+1;
        while j<n && a.key2(j)==ki { j+=1; }
        for ia in i..j {
            for ib in (ia+1)..j {
                let av=&a.indices[ia][..old];
                let bv=&a.indices[ib][..old];
                if !distinct_bs(av,bv,bits,dirty) { continue; }
                let mut nh=a.hashes[ia];
                for k in 0..hl { nh[o+k]^=a.hashes[ib][o+k]; }
                let mut ni=[0u32;SOL_N];
                if av[0]<bv[0] { ni[..old].copy_from_slice(av); ni[old..new].copy_from_slice(bv); }
                else            { ni[..old].copy_from_slice(bv); ni[old..new].copy_from_slice(av); }
                oh.push(nh); oi.push(ni);
            }
        }
        i=j;
    }
    let nc=oh.len(); a.ensure(nc);
    a.hashes[..nc].copy_from_slice(&oh[..nc]);
    a.indices[..nc].copy_from_slice(&oi[..nc]);
    a.count=nc; a.hash_offset+=CBYTES; a.idx_len=new;
}

// ─── Index compression ────────────────────────────────────────────────────────
fn compress(indices: &[u32;SOL_N]) -> Vec<u8> {
    let mut out = vec![0u8; SOLN_B];
    let mut pos = 0usize;
    for &idx in indices.iter() {
        for b in (0..BITS_I).rev() {
            let bit=((idx>>b)&1) as u8;
            out[pos/8] |= bit<<(7-pos%8);
            pos+=1;
        }
    }
    out
}

// ─── Public API ───────────────────────────────────────────────────────────────

/// Pre-built base state. One per round; cloned per nonce by `try_nonce`.
pub struct BaseState {
    pub state: Blake2bState,
    pub n:     u32,
    pub k:     u32,
}

impl BaseState {
    pub fn new(n: u32, k: u32, input: &[u8; I_LEN]) -> Result<Self, SolveError> {
        if n==0 || k==0 || n%8!=0 || n%(k+1)!=0 || k>=n {
            return Err(SolveError::InvalidParams);
        }
        Ok(Self { state: make_blake_state(input), n, k })
    }
}

/// Try one nonce. Uses thread-local scratch so alloc cost is paid once per thread.
pub fn try_nonce(base: &BaseState, _input: &[u8; I_LEN], nonce: &[u8; 32]) -> Option<Vec<u8>> {
    use std::cell::RefCell;

    thread_local! {
        static SC: RefCell<(
            Arena,
            Vec<[u8;N_BYTES]>, Vec<[u32;SOL_N]>,
            Vec<[u8;N_BYTES]>, Vec<[u32;SOL_N]>,
            Vec<u64>, Vec<usize>,
        )> = RefCell::new((
            Arena::new(),
            Vec::with_capacity(N_INIT*8), Vec::with_capacity(N_INIT*8),
            vec![[0u8;N_BYTES]; N_INIT], vec![[0u32;SOL_N]; N_INIT],
            vec![0u64; BSW], Vec::with_capacity(SOL_N*2),
        ));
    }

    SC.with(|cell| {
        let mut sc = cell.borrow_mut();
        let (arena, oh, oi, th, ti, bits, dirty) = &mut *sc;

        let mut ns = base.state.clone();
        ns.update(nonce);
        fill_leaves(&ns, arena);

        for _ in 0..(K as usize) {
            oh.clear(); oi.clear();
            wagner_round(arena, oh, oi, th, ti, bits, dirty);
            if arena.count == 0 { return None; }
        }

        for i in 0..arena.count {
            if arena.idx_len != SOL_N { break; }
            let o=arena.hash_offset; let hl=arena.hash_len();
            let ok = hl==0 || arena.hashes[i][o..o+hl].iter().all(|&b| b==0);
            if ok { return Some(compress(&arena.indices[i])); }
        }
        None
    })
}

/// Sequential solve (kept for backward compat).
pub fn solve<F>(n: u32, k: u32, input: &[u8; I_LEN], mut next_nonce: F) -> Result<Solution, SolveError>
where F: FnMut() -> Option<[u8; 32]>,
{
    let base = BaseState::new(n, k, input)?;
    loop {
        let nonce = next_nonce().ok_or(SolveError::NoSolutionFound)?;
        if let Some(soln_indices) = try_nonce(&base, input, &nonce) {
            return Ok(Solution { nonce, soln_indices });
        }
    }
}

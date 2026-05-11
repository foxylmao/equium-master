# equium-fast-miner

Fork of the [Equium](https://equium.xyz) reference CLI miner with an optimised
Equihash(96,5) solver.  Drop-in replacement — same flags, same on-chain
behaviour, ~**5× faster** per core.

---

## What's changed

Only `crates/equihash-core/src/solver.rs` is modified.  The CLI miner, the
on-chain program, and all blockchain logic are untouched.

| Improvement | Reference | Fast |
|---|---|---|
| Row storage | `Vec<Row { Vec<u8>, Vec<u32> }>` per nonce | flat arena, once per thread |
| Sort | `sort_by` O(n log n) | 2-pass LSD radix sort O(n) |
| Distinct-indices check | nested O(n²) loop | 131 072-bit bitset, O(n) |
| Thread scratch | reallocated each nonce | thread-local, reused forever |
| **Net speedup** | 1× | **~5×** |

Benchmark (single core, 20 nonces each):

```
Reference:   ~817 ms/nonce  →  1.2 H/s
Fast miner:  ~165 ms/nonce  →  6.0 H/s
```

---

## One-command install (Linux VPS)

```bash
git clone https://github.com/YOUR_FORK/equium.git
cd equium
bash install.sh
```

The script installs Rust (if needed), builds with LTO + `target-cpu=native`,
installs the binary to `/usr/local/bin/equium-miner`, and sets up a systemd
service template.

**Requirements:** Linux x86_64 / aarch64, Rust ≥ 1.80 (installed automatically),
~500 MB disk for build, ~200 MB RAM per solver thread at runtime.

---

## Manual build

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

RUSTFLAGS="-C target-cpu=native" \
  cargo build -p equium-cli-miner --release

./target/release/equium-miner --help
```

---

## Usage

```
equium-miner --keypair <PATH> [OPTIONS]

Key options:
  --rpc-url <URL>             Solana RPC endpoint  [default: public mainnet]
  --keypair <PATH>            Path to Solana keypair JSON  [required]
  --threads <N>               Solver threads  [0 = all cores]
  --max-blocks <N>            Stop after N blocks  [0 = forever]
  --max-nonces-per-round <N>  Nonce budget per thread/round  [4096]
```

### Quick start

```bash
# Generate a wallet (skip if you have one)
solana-keygen new -o ~/.config/solana/id.json

# Fund it (~0.001 SOL covers many hours of fees)

# Mine!
equium-miner \
  --keypair ~/.config/solana/id.json \
  --rpc-url "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
```

A free [Helius](https://www.helius.dev) key is strongly recommended — the public
Solana endpoint rate-limits under load.

---

## Run as a background service

```bash
# 1. Create a dedicated wallet
sudo mkdir -p /etc/equium
sudo solana-keygen new -o /etc/equium/wallet.json
sudo chmod 600 /etc/equium/wallet.json

# 2. Configure (set RPC_URL and KEYPAIR)
sudo nano /etc/systemd/system/equium-miner.service

# 3. Start
sudo systemctl enable --now equium-miner

# 4. Logs
journalctl -u equium-miner -f
```

### Service cheatsheet

```bash
sudo systemctl status  equium-miner
sudo systemctl restart equium-miner
sudo systemctl stop    equium-miner
journalctl -u equium-miner -n 100
```

---

## VPS sizing

| Cores | Est. hashrate | RAM needed |
|---|---|---|
| 1 vCPU | ~6 H/s | ~250 MB |
| 2 vCPU | ~12 H/s | ~450 MB |
| 4 dedicated | ~24 H/s | ~900 MB |
| 8 dedicated | ~48 H/s | ~1.8 GB |
| 16 dedicated | ~96 H/s | ~3.5 GB |

If memory is tight, lower `--threads`.

---

## Updating

```bash
cd /opt/equium-fast-miner
git pull
RUSTFLAGS="-C target-cpu=native" cargo build -p equium-cli-miner --release
sudo install -m 755 target/release/equium-miner /usr/local/bin/
sudo systemctl restart equium-miner
```

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `blockhash expired` | RPC too slow | Use Helius / Triton |
| `stale challenge` | Lost the round race | Normal, auto-retries |
| Service won't start | Wrong keypair path or no SOL | Check `journalctl -u equium-miner` |
| High RAM | Many threads, large arenas | Reduce `--threads` |

---

## License

Apache 2.0 — same as upstream Equium.

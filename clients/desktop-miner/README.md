# Equium Desktop Miner

Native Tauri 2 app for mining Equium ($EQM) on macOS, Windows, and Linux. Single binary, built-in wallet, no extension required.

## Architecture

```
clients/desktop-miner/
├── src/                  Vite + React frontend (TypeScript)
│   ├── App.tsx           Wallet status router (setup / unlock / dashboard)
│   ├── components/       Setup wizard, dashboard, settings modal
│   └── lib/              Typed wrappers for the Tauri command surface
└── src-tauri/            Rust backend
    └── src/
        ├── lib.rs        Tauri builder + invoke handler registry
        ├── keystore.rs   Argon2id + AES-256-GCM encrypted keystore
        ├── settings.rs   RPC config + on-chain state queries
        ├── miner.rs      Equihash solver loop + Solana submit
        └── state.rs      AppState (decrypted keypair, settings, miner stats)
```

The Rust backend exposes a small set of Tauri commands and emits four event channels:

- `miner://log` — `{ level, message }` activity log entries
- `miner://attempt` — per-nonce solver progress (hashrate, above/below target)
- `miner://block` — block-mined confirmation with signature + cumulative totals
- `miner://round` — new round opened on-chain
- `miner://status` — running/stopped transitions

## Development

```bash
cd clients/desktop-miner
npm install
npm run tauri:dev
```

The first build takes a while because Tauri pulls in Solana, Anchor, and the local `equihash-core` crate. Linux dev requires:

```bash
sudo apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev libgtk-3-dev libdbus-1-dev pkg-config build-essential
```

## Building installers

```bash
npm run tauri:build
```

CI runs `.github/workflows/desktop-build.yml` on every `miner-v*` tag and produces:

| Platform | Artifact |
|----------|----------|
| macOS Apple Silicon | `Equium-Miner_<v>_aarch64.dmg` |
| macOS Intel | `Equium-Miner_<v>_x64.dmg` |
| Windows x64 | `Equium-Miner_<v>_x64-setup.msi` |
| Linux x64 | `Equium-Miner_<v>_amd64.AppImage` |

## Security model

The user's Solana secret key is encrypted at rest with **Argon2id** (m=64MB, t=4, p=1) deriving a 32-byte AES key, then sealed with **AES-256-GCM** (12-byte random nonce). Plaintext only exists in memory between `unlock_wallet` and `lock_wallet`. The encrypted file lives in the platform-standard app data dir (`~/Library/Application Support/xyz.equium.miner` on macOS, `%APPDATA%/xyz.equium.miner` on Windows). There is no remote backup; lose the password and the funds are unreachable unless the user kept the base58 backup string from setup.

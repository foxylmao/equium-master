# Contributing to Equium

Thanks for your interest. The protocol is in active development; expect rapid iteration until M4 (browser miner). PRs and issues welcome.

## Ground rules

- **Don't break the supply curve.** 21M total / 18.9M mineable / halving every 378k blocks at 25 EQM/block initial reward is locked. Changes that alter these numbers won't be merged.
- **Don't break the Equihash parameter choice** without re-running the M0 CU benchmark. (96, 5) was chosen for browser/mobile feasibility (verify cost: 198k CU on-chain).
- **All on-chain code must build to SBF.** Run `anchor build` locally before submitting.
- **Tests required for protocol changes.** Schedule math, retarget logic, and ix surface changes need unit + integration coverage.

## Development setup

```bash
# Install toolchain
rustup toolchain install 1.85
sh -c "$(curl -sSfL https://release.anza.xyz/v2.1.13/install)"  # solana-cli
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --tag v0.31.1

# Clone + build
git clone https://github.com/<your-fork>/equium.git
cd equium
yarn install
anchor build
cargo build -p equihash-core --features solver --release
cargo build -p equium-cli-miner --release

# Run tests
cargo test -p equium                # schedule math
cargo test -p equihash-core         # PoW primitives
yarn test                           # Anchor integration (requires localnet)
```

See [README.md](README.md) for the full build & test recipe.

## Reporting issues

- **Security**: please do NOT open public issues for vulnerabilities. Email the maintainers directly.
- **Bugs**: include reproduction steps + relevant logs. For miner issues, include `RUST_LOG=debug` output and the program version.
- **Design discussions**: open an issue first before sending a large PR — the protocol has tight invariants.

## Pull requests

- Keep diffs focused: one logical change per PR.
- Update tests + relevant docs.
- All commits must build and pass tests.

## License

By contributing, you agree your contributions will be licensed under [Apache-2.0](LICENSE).

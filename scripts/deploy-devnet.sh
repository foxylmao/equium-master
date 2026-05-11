#!/usr/bin/env bash
#
# One-shot devnet deploy + bootstrap.
#
# Prereqs:
#   - Deployer keypair AgbSti5...EQM.json funded with ~5 SOL on devnet
#     (https://faucet.solana.com/ — paste the deployer pubkey)
#   - Program keypair ZKGM...EQM.json present (gives us the vanity program ID)
#   - `anchor build` has produced target/deploy/equium.so and target/idl/equium.json
#
# Steps:
#   1. Deploy programs/equium to devnet (bpf upgradeable, deployer = upgrade authority)
#   2. Pre-mint 21M EQM on a fresh mint, deployer ATA receives them
#   3. Call initialize (sets up config PDA + empty vault PDA)
#   4. Call fund_vault (transfers 18.9M into the vault, opens mining)
#
# Usage:  ./scripts/deploy-devnet.sh

set -euo pipefail
cd "$(dirname "$0")/.."

DEPLOYER_KP="$(pwd)/AgbSti5LyTfYHVytBhNP8HHz3Ko7bZfSvnsm9cJAEQM.json"
PROGRAM_KP="$(pwd)/ZKGMUfxiRCXFPnqz9zgqAnuqJy15jk7fKbR4o6FuEQM.json"
RPC="${RPC_URL:-https://api.devnet.solana.com}"

if [[ ! -f "$DEPLOYER_KP" ]]; then
  echo "missing deployer keypair: $DEPLOYER_KP" >&2; exit 1
fi
if [[ ! -f "$PROGRAM_KP" ]]; then
  echo "missing program keypair: $PROGRAM_KP" >&2; exit 1
fi

DEPLOYER_PK="$(solana-keygen pubkey "$DEPLOYER_KP")"
PROGRAM_PK="$(solana-keygen pubkey "$PROGRAM_KP")"

BAL=$(solana balance --url "$RPC" -k "$DEPLOYER_KP" | awk '{print $1}')
echo "deployer: $DEPLOYER_PK ($BAL SOL)"
echo "program:  $PROGRAM_PK"
echo "rpc:      $RPC"
echo

if (( $(echo "$BAL < 4.5" | bc -l) )); then
  echo "deployer needs at least ~5 SOL on devnet. Current: $BAL SOL." >&2
  echo "Use https://faucet.solana.com/ with pubkey $DEPLOYER_PK" >&2
  exit 1
fi

echo "=== 1/4 deploy program ==="
# Use the program keypair (pre-existing — gives vanity program ID).
# Anchor's `target/deploy/equium-keypair.json` is overwritten by our keypair.
cp "$PROGRAM_KP" target/deploy/equium-keypair.json
solana program deploy target/deploy/equium.so \
  --program-id target/deploy/equium-keypair.json \
  --keypair "$DEPLOYER_KP" \
  --url "$RPC"
echo

echo "=== 2-4/4 pre-mint + initialize + fund_vault ==="
ANCHOR_PROVIDER_URL="$RPC" \
ANCHOR_WALLET="$DEPLOYER_KP" \
  ./node_modules/.bin/ts-node --transpile-only scripts/init-localnet.ts

echo
echo "DONE. To mine on devnet:"
echo "  ./target/release/equium-miner --rpc-url $RPC --keypair <miner-keypair>"

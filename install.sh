#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  equium-fast-miner  —  one-command installer for Linux VPS
#
#  Usage:
#    curl -sSfL https://raw.githubusercontent.com/foxylmao/equim-fast/equium/main/install.sh | bash
#
#  Or, after cloning:
#    bash install.sh
#
#  What this script does:
#    1. Installs Rust (via rustup) if not already present
#    2. Installs system build deps (gcc, libssl-dev, pkg-config)
#    3. Builds the optimised equium-miner binary (release mode, LTO)
#    4. Installs the binary to /usr/local/bin/equium-miner
#    5. Installs a systemd service template
#    6. Prints next-step instructions
#
#  The optimised solver is ~5× faster than the reference implementation:
#    - Arena-based storage  (no per-nonce heap allocation storm)
#    - LSD radix sort       (O(n) vs O(n log n) comparison sort)
#    - Bitset distinct-idx  (O(n) vs O(n²) nested loop)
#    - Thread-local scratch (one alloc per thread, reused forever)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
IFS=$'\n\t'

# ── Colours ──────────────────────────────────────────────────────────────────
BOLD=$'\e[1m'; RESET=$'\e[0m'
RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; CYAN=$'\e[36m'; GRAY=$'\e[90m'

info()    { echo "${CYAN}▶${RESET} $*"; }
success() { echo "${GREEN}✓${RESET} $*"; }
warn()    { echo "${YELLOW}⚠${RESET} $*"; }
die()     { echo "${RED}✗${RESET} $*" >&2; exit 1; }

RULE="${GRAY}──────────────────────────────────────────────────────────${RESET}"

# ── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo "${BOLD}${CYAN}   ███████╗  ██████╗  ███╗   ███╗${RESET}"
echo "${BOLD}${CYAN}   ██╔════╝ ██╔═══██╗ ████╗ ████║${RESET}"
echo "${BOLD}${CYAN}   █████╗   ██║   ██║ ██╔████╔██║  fast-miner installer${RESET}"
echo "${BOLD}${CYAN}   ██╔══╝   ██║▄▄ ██║ ██║╚██╔╝██║  ~5× optimised solver${RESET}"
echo "${BOLD}${CYAN}   ███████╗ ╚██████╔╝ ██║ ╚═╝ ██║${RESET}"
echo "${BOLD}${CYAN}   ╚══════╝  ╚══▀▀═╝  ╚═╝     ╚═╝  \$EQM ⛏${RESET}"
echo "$RULE"
echo ""

# ── Detect OS ────────────────────────────────────────────────────────────────
OS="$(uname -s)"
[[ "$OS" == "Linux" ]] || die "This installer supports Linux only. (macOS: use Homebrew + cargo build manually)"

ARCH="$(uname -m)"
info "System: Linux / $ARCH"

# ── 1. System packages ───────────────────────────────────────────────────────
echo ""
info "Installing system build dependencies..."

if command -v apt-get &>/dev/null; then
    apt-get update -qq
    apt-get install -y -qq build-essential curl pkg-config libssl-dev git
elif command -v yum &>/dev/null; then
    yum install -y gcc openssl-devel pkgconfig git curl
elif command -v dnf &>/dev/null; then
    dnf install -y gcc openssl-devel pkgconfig git curl
elif command -v pacman &>/dev/null; then
    pacman -Sy --noconfirm base-devel openssl pkg-config git curl
else
    warn "Unknown package manager — make sure gcc, openssl-dev, pkg-config, git, curl are installed."
fi
success "System packages OK"

# ── 2. Rust ──────────────────────────────────────────────────────────────────
echo ""
info "Checking Rust toolchain..."

if command -v rustup &>/dev/null; then
    info "rustup found — updating to latest stable"
    rustup update stable --no-self-update
    rustup default stable
else
    info "Installing Rust via rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
        | sh -s -- -y --default-toolchain stable --profile minimal
    # shellcheck source=/dev/null
    source "$HOME/.cargo/env"
fi

RUST_VER="$(rustc --version)"
success "Rust: $RUST_VER"

# Need at least 1.80 for the workspace deps
RUST_MINOR=$(rustc --version | grep -oP '\d+\.\K\d+' | head -1)
if [[ "$RUST_MINOR" -lt 80 ]]; then
    info "Upgrading Rust to stable (need ≥1.80)..."
    rustup update stable
    rustup default stable
fi

# ── 3. Source ────────────────────────────────────────────────────────────────
echo ""
info "Locating source..."

# Determine where we are.  If this script is already inside the repo, use it.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/Cargo.toml" ]] && grep -q 'equium' "$SCRIPT_DIR/Cargo.toml" 2>/dev/null; then
    REPO_DIR="$SCRIPT_DIR"
    info "Using existing source at $REPO_DIR"
else
    REPO_DIR="/opt/equium-fast-miner"
    if [[ -d "$REPO_DIR/.git" ]]; then
        info "Updating existing clone at $REPO_DIR..."
        git -C "$REPO_DIR" pull --ff-only
    else
        info "Cloning equium-fast-miner to $REPO_DIR..."
        git clone https://github.com/foxylmao/equim-fast/equium.git "$REPO_DIR"
    fi
fi
success "Source ready at $REPO_DIR"

# ── 4. Build ─────────────────────────────────────────────────────────────────
echo ""
info "Building equium-miner (release + LTO — this takes 3–8 minutes on first run)..."

NPROC=$(nproc 2>/dev/null || echo 4)
info "Using $NPROC parallel jobs"

# Ensure cargo env is available in this shell
source "$HOME/.cargo/env" 2>/dev/null || true

cd "$REPO_DIR"
RUSTFLAGS="-C target-cpu=native" \
    cargo build -p equium-cli-miner --release -j "$NPROC"

BINARY="$REPO_DIR/target/release/equium-miner"
[[ -f "$BINARY" ]] || die "Build succeeded but binary not found at $BINARY"

BINARY_SIZE=$(du -sh "$BINARY" | cut -f1)
success "Build complete  (${BINARY_SIZE})"

# ── 5. Install binary ────────────────────────────────────────────────────────
echo ""
info "Installing binary to /usr/local/bin/equium-miner..."

if [[ $EUID -eq 0 ]]; then
    install -m 755 "$BINARY" /usr/local/bin/equium-miner
else
    sudo install -m 755 "$BINARY" /usr/local/bin/equium-miner
fi
success "Installed: $(which equium-miner)  ($(equium-miner --version 2>/dev/null || echo 'ok'))"

# ── 6. Systemd service ───────────────────────────────────────────────────────
echo ""
info "Installing systemd service template..."

SERVICE_FILE="/etc/systemd/system/equium-miner.service"
KEYPAIR_DEFAULT="$HOME/.config/solana/id.json"

cat > /tmp/equium-miner.service << SVCEOF
[Unit]
Description=Equium ($EQM) CPU miner — optimised Equihash solver
Documentation=https://equium.xyz/docs
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
# ─── Edit these three values ────────────────────────────────────────────────
Environment="RPC_URL=https://api.mainnet-beta.solana.com"
Environment="KEYPAIR=${KEYPAIR_DEFAULT}"
Environment="THREADS=0"
# ─── Optional overrides ─────────────────────────────────────────────────────
# Environment="MAX_BLOCKS=0"
# Environment="CU_LIMIT=1400000"
# Environment="MAX_NONCES_PER_ROUND=4096"
# ────────────────────────────────────────────────────────────────────────────

ExecStart=/usr/local/bin/equium-miner \
    --rpc-url \${RPC_URL} \
    --keypair \${KEYPAIR} \
    --threads \${THREADS}

Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=equium-miner

# Prevent the miner from consuming all RAM on a runaway
MemoryMax=4G
# Nice value — lower priority than system processes
Nice=5
# CPU affinity: remove to use all cores, or set e.g. 0-3 to pin to cores 0–3
# CPUAffinity=0-3

[Install]
WantedBy=multi-user.target
SVCEOF

if [[ $EUID -eq 0 ]]; then
    cp /tmp/equium-miner.service "$SERVICE_FILE"
    systemctl daemon-reload
else
    sudo cp /tmp/equium-miner.service "$SERVICE_FILE"
    sudo systemctl daemon-reload
fi
success "Service installed at $SERVICE_FILE"

# ── 7. Done ──────────────────────────────────────────────────────────────────
echo ""
echo "$RULE"
echo ""
echo "${BOLD}${GREEN}Installation complete!${RESET}"
echo ""
echo "  ${BOLD}Quick start (foreground):${RESET}"
echo "    equium-miner --keypair ~/.config/solana/id.json \\"
echo "                 --rpc-url https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
echo ""
echo "  ${BOLD}Run as a background service:${RESET}"
echo ""
echo "    1. Edit the service file to set your keypair and RPC URL:"
echo "       ${CYAN}sudo nano /etc/systemd/system/equium-miner.service${RESET}"
echo ""
echo "    2. Enable and start:"
echo "       ${CYAN}sudo systemctl enable --now equium-miner${RESET}"
echo ""
echo "    3. Watch the logs:"
echo "       ${CYAN}journalctl -u equium-miner -f${RESET}"
echo ""
echo "  ${BOLD}Recommended RPC:${RESET}  https://www.helius.dev  (free tier, much faster)"
echo ""
echo "  ${BOLD}Solver performance (vs reference):${RESET}  ~5× faster per core"
echo "  ${GRAY}radix sort + arena storage + bitset distinct-indices${RESET}"
echo ""
echo "$RULE"
echo ""

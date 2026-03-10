#!/usr/bin/env bash
#
# deploy-to-openclaw.sh - Deploy OtaClaw to OpenClaw Canvas
#
# Usage: ./deploy/deploy-to-openclaw.sh [OPTIONS]
#
# Options:
#   --host=HOST         Target host (default: auto-detect or localhost)
#   --user=USER         SSH user (default: admin or pi)
#   --port=PORT         SSH port (default: 22)
#   --canvas-path=PATH  Canvas directory (default: ~/.openclaw/canvas/)
#   --local             Install locally (no SSH) into $HOME/.openclaw/canvas/otaclaw/
#   --restart-kiosk     Restart otaclaw-kiosk service after deploy (remote only)
#   --setup-buzzer     Enable Pi GPIO buzzer for tickle (only when buzzerTickleUrl is null)
#   --fresh             Remove existing install first (clean install, like "git clone")
#   --dry-run           Preview changes without deploying
#   --help              Show this help message
#
# Examples:
#   ./deploy/deploy-to-openclaw.sh --local              # same machine as OpenClaw
#   ./deploy/deploy-to-openclaw.sh --host=YOUR_HOST     # uses User from ~/.ssh/config
#   ./deploy/deploy-to-openclaw.sh --host=YOUR_HOST --user=YOUR_USER
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration (USER from env can block key auth; detect_user fills for remote)
HOST="${HOST:-}"
USER=""
PORT="${PORT:-22}"
CANVAS_PATH="${CANVAS_PATH:-}"
LOCAL_INSTALL="${LOCAL_INSTALL:-false}"
DRY_RUN="${DRY_RUN:-false}"
RESTART_KIOSK="${RESTART_KIOSK:-false}"
SETUP_BUZZER="${SETUP_BUZZER:-false}"
FRESH_INSTALL="${FRESH_INSTALL:-false}"
SOURCE_DIR="${SOURCE_DIR:-$(dirname "$0")/../src}"
CONFIG_DIR="${CONFIG_DIR:-$(dirname "$0")/../config}"

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Help message
show_help() {
    sed -n '2,20p' "$0" | sed 's/^# //'
    exit 0
}

# Parse arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --host=*)
                HOST="${1#*=}"
                shift
                ;;
            --user=*)
                USER="${1#*=}"
                shift
                ;;
            --port=*)
                PORT="${1#*=}"
                shift
                ;;
            --canvas-path=*)
                CANVAS_PATH="${1#*=}"
                shift
                ;;
            --local)
                LOCAL_INSTALL=true
                HOST="localhost"
                CANVAS_PATH="${CANVAS_PATH:-$HOME/.openclaw/canvas/}"
                shift
                ;;
            --restart-kiosk)
                RESTART_KIOSK=true
                shift
                ;;
            --setup-buzzer)
                SETUP_BUZZER=true
                shift
                ;;
            --fresh)
                FRESH_INSTALL=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --help)
                show_help
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                ;;
        esac
    done
}

# Set default canvas path (use ~ for remote so it expands on target)
set_canvas_path() {
    if [[ -z "$CANVAS_PATH" ]]; then
        [[ "$LOCAL_INSTALL" == "true" ]] && CANVAS_PATH="$HOME/.openclaw/canvas/" || CANVAS_PATH="~/.openclaw/canvas/"
    fi
}

# Detect target host
detect_host() {
    if [[ "$LOCAL_INSTALL" == "true" ]]; then
        return
    fi
    if [[ -z "$HOST" ]]; then
        # Try common OpenClaw hostnames
        local hosts=("raspberrypi.local" "raspberrypi" "openclaw.local" "localhost")
        
        for h in "${hosts[@]}"; do
            if ping -c 1 -W 2 "$h" &>/dev/null; then
                HOST="$h"
                log_info "Detected OpenClaw host: $HOST"
                break
            fi
        done
        
        if [[ -z "$HOST" ]]; then
            log_error "Could not detect OpenClaw host. Please specify with --host="
            exit 1
        fi
    fi
}

# Detect SSH user
detect_user() {
    if [[ "$LOCAL_INSTALL" == "true" ]]; then
        return
    fi
    if [[ -z "$USER" ]]; then
        # Try common usernames
        local users=("admin" "pi" "ubuntu")
        
        for u in "${users[@]}"; do
            if ssh -o ConnectTimeout=2 -o BatchMode=yes "${u}@${HOST}" "echo ok" &>/dev/null; then
                USER="$u"
                log_info "Detected SSH user: $USER"
                break
            fi
        done
        
        if [[ -z "$USER" ]]; then
            USER="admin"
            log_warn "Could not detect SSH user, using default: $USER"
        fi
    fi
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if [[ "$LOCAL_INSTALL" != "true" ]]; then
        if ! command -v ssh &>/dev/null; then
            log_error "SSH not found. Please install SSH client."
            exit 1
        fi
        if ! command -v scp &>/dev/null; then
            log_error "SCP not found. Please install SCP."
            exit 1
        fi
    fi
    
    # Check source files exist
    if [[ ! -d "$SOURCE_DIR" ]]; then
        log_error "Source directory not found: $SOURCE_DIR"
        log_error "Please run this script from the OtaClaw project directory"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Fresh install: remove existing OtaClaw (like "git clone" – clean slate)
fresh_install() {
    if [[ "$FRESH_INSTALL" != "true" ]]; then
        return 0
    fi
    set_canvas_path
    if [[ "$LOCAL_INSTALL" == "true" ]]; then
        local dest="${CANVAS_PATH%/}/otaclaw"
        if [[ -d "$dest" ]]; then
            log_info "Fresh install: removing $dest"
            rm -rf "$dest"
        fi
    else
        log_info "Fresh install: removing existing OtaClaw on ${HOST}..."
        ssh "${USER}@${HOST}" -p "$PORT" "rm -rf ${CANVAS_PATH}/otaclaw" || true
        log_success "Cleaned"
    fi
}

# Verify OpenClaw installation on target
verify_openclaw() {
    if [[ "$LOCAL_INSTALL" == "true" ]]; then
        set_canvas_path
        local dest="${CANVAS_PATH%/}/otaclaw"
        log_info "Creating local canvas directory: $dest"
        mkdir -p "$dest"
        log_success "Local install path: $dest"
        return 0
    fi
    set_canvas_path
    log_info "Verifying OpenClaw installation on ${HOST}..."
    if ! ssh -o ConnectTimeout=10 "${USER}@${HOST}" -p "$PORT" "echo ok"; then
        log_error "Cannot connect to ${USER}@${HOST}:${PORT}"
        log_error "  - Use --host=YOUR_OPENCLAW_HOST --user=YOUR_USER"
        log_error "  - Verify: ssh ${USER}@${HOST}"
        exit 1
    fi
    if ! ssh "${USER}@${HOST}" -p "$PORT" "test -d ~/.openclaw || test -d ~/.config/openclaw"; then
        log_warn "OpenClaw directory not found, creating..."
        ssh "${USER}@${HOST}" -p "$PORT" "mkdir -p ${CANVAS_PATH}/otaclaw" || { log_error "Failed to create directory"; exit 1; }
    else
        log_success "OpenClaw installation verified"
    fi
}

# Build file list for deployment
build_file_list() {
    local files=()
    
    # Core HTML
    files+=("${SOURCE_DIR}/index.html")
    [[ -f "${SOURCE_DIR}/widget.html" ]] && files+=("${SOURCE_DIR}/widget.html")
    
    # CSS files
    for css_file in "${SOURCE_DIR}/css/"*.css; do
        [[ -f "$css_file" ]] && files+=("$css_file")
    done
    
    # JS files
    for js_file in "${SOURCE_DIR}/js/"*.js; do
        [[ -f "$js_file" ]] && files+=("$js_file")
    done
    
    # Assets
    if [[ -d "${SOURCE_DIR}/assets" ]]; then
        find "${SOURCE_DIR}/assets" -type f | while read -r asset; do
            files+=("$asset")
        done
    fi

    # Data (frame catalog for Clawdbot)
    if [[ -d "${SOURCE_DIR}/data" ]]; then
        find "${SOURCE_DIR}/data" -type f | while read -r datafile; do
            files+=("$datafile")
        done
    fi
    
    # Config: --fresh always uses example (clean install). Else use config.js if present.
    if [[ "$FRESH_INSTALL" == "true" ]] || [[ ! -f "${CONFIG_DIR}/config.js" ]]; then
        files+=("${CONFIG_DIR}/config.example.js")
        [[ "$FRESH_INSTALL" == "true" ]] && log_info "Fresh install: using config.example.js"
        [[ "$FRESH_INSTALL" != "true" ]] && log_warn "Using example configuration. Please customize config/config.js for production."
    else
        files+=("${CONFIG_DIR}/config.js")
    fi
    
    printf '%s\n' "${files[@]}"
}

# Deploy files locally (--local)
deploy_local() {
    set_canvas_path
    local dest="${CANVAS_PATH%/}/otaclaw"
    log_info "Installing OtaClaw locally to $dest"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "Dry run - would copy to $dest"
        return 0
    fi

    mkdir -p "$dest"/{css,js,assets/sprites,data}
    cp -r "${SOURCE_DIR}"/* "$dest/"
    if [[ "$FRESH_INSTALL" != "true" ]] && [[ -f "${CONFIG_DIR}/config.js" ]]; then
        cp "${CONFIG_DIR}/config.js" "$dest/js/"
    else
        cp "${CONFIG_DIR}/config.example.js" "$dest/js/config.js"
        [[ "$FRESH_INSTALL" != "true" ]] && log_warn "Using example config. Customize $dest/js/config.js for production."
    fi

    log_success "Local installation complete"
}

# Deploy files (remote)
deploy_files() {
    if [[ "$LOCAL_INSTALL" == "true" ]]; then
        deploy_local
        return 0
    fi
    log_info "Preparing deployment to ${USER}@${HOST}:${CANVAS_PATH}/otaclaw/"
    
    local files
    files=$(build_file_list)
    
    if [[ -z "$files" ]]; then
        log_error "No files to deploy"
        exit 1
    fi
    
    log_info "Files to deploy:"
    echo "$files" | while read -r file; do
        echo "  - $(basename "$file")"
    done
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "Dry run - not deploying files"
        return 0
    fi
    
    # Create remote directory
    log_info "Creating remote directory..."
    ssh "${USER}@${HOST}" -p "$PORT" "mkdir -p ${CANVAS_PATH}/otaclaw/{css,js,assets/sprites,data}" || {
        log_error "Failed to create remote directories"
        exit 1
    }
    
    # Deploy files using rsync if available, otherwise scp
    if command -v rsync &>/dev/null; then
        log_info "Using rsync for deployment..."
        
        # Sync all files including assets/sprites (sprites are in repo)
        rsync -avz --delete -e "ssh -p ${PORT}" \
            "${SOURCE_DIR}/" \
            "${USER}@${HOST}:${CANVAS_PATH}/otaclaw/" || {
            log_error "Rsync deployment failed"
            exit 1
        }
        
        # Config: --fresh uses example. Else use config.js if present.
        if [[ "$FRESH_INSTALL" == "true" ]] || [[ ! -f "${CONFIG_DIR}/config.js" ]]; then
            scp -P "$PORT" "${CONFIG_DIR}/config.example.js" "${USER}@${HOST}:${CANVAS_PATH}/otaclaw/js/config.js"
        else
            scp -P "$PORT" "${CONFIG_DIR}/config.js" "${USER}@${HOST}:${CANVAS_PATH}/otaclaw/js/" || {
                log_warn "Could not copy custom config, using example"
                scp -P "$PORT" "${CONFIG_DIR}/config.example.js" "${USER}@${HOST}:${CANVAS_PATH}/otaclaw/js/config.js"
            }
        fi
    else
        log_info "Using scp for deployment..."
        
        local scp_port=(-P "$PORT")
        echo "$files" | while read -r file; do
            if [[ -f "$file" ]]; then
                local rel_path="${file#$SOURCE_DIR/}"
                local target_dir="$(dirname "${CANVAS_PATH}/otaclaw/${rel_path}")"
                scp "${scp_port[@]}" "$file" "${USER}@${HOST}:${target_dir}/" || log_error "Failed: $rel_path"
            fi
        done
    fi
    
    log_success "Files deployed successfully"
}

# Verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    if [[ "$LOCAL_INSTALL" == "true" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "Dry run - skipping verification"
            return 0
        fi
        set_canvas_path
        local index_file="${CANVAS_PATH%/}/otaclaw/index.html"
        if [[ -f "$index_file" ]]; then
            log_success "Local deployment verified"
        else
            log_error "Local deployment verification failed"
            exit 1
        fi
        return 0
    fi

    local result
    result=$(ssh "${USER}@${HOST}" -p "$PORT" "test -f ${CANVAS_PATH}/otaclaw/index.html && echo 'ok' || echo 'missing'")
    
    if [[ "$result" == "ok" ]]; then
        log_success "Deployment verified"
    else
        log_error "Deployment verification failed"
        exit 1
    fi
}

# Interactive configuration for general settings
configure_settings() {
    if [[ "$LOCAL_INSTALL" == "true" || "$DRY_RUN" == "true" ]]; then
        return 0
    fi
    
    # Only prompt if running interactively
    if [[ -t 0 ]]; then
        echo
        echo -e "${BLUE}--- OtaClaw Configuration ---${NC}"
        read -p "Do you want to configure Discord Channel ID and Display Rotation now? [y/N]: " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo
            echo -e "${YELLOW}Discord Tickle Channel ID${NC}"
            echo "When you touch the screen, OtaClaw can send a message back to a specific Discord channel."
            read -p "Enter your Discord Channel ID (leave blank to keep default/null): " discord_channel
            if [[ -n "$discord_channel" ]]; then
                log_info "Setting tickleDiscordChannel to $discord_channel..."
                # Update widget.html and config.js
                ssh "${USER}@${HOST}" -p "$PORT" "sed -i 's/tickleDiscordChannel: null/tickleDiscordChannel: \"$discord_channel\"/' ${CANVAS_PATH%/}/otaclaw/js/config.js 2>/dev/null || true"
                ssh "${USER}@${HOST}" -p "$PORT" "sed -i 's/tickleDiscordChannel: null/tickleDiscordChannel: \"$discord_channel\"/' ${CANVAS_PATH%/}/otaclaw/widget.html 2>/dev/null || true"
            fi
            
            echo
            echo -e "${YELLOW}Display Rotation${NC}"
            echo "Depending on how you mounted your screen, you may need to rotate it."
            read -p "Enter display rotation (0, 90, 180, 270) [leave blank to skip]: " rotation
            if [[ "$rotation" == "0" || "$rotation" == "90" || "$rotation" == "180" || "$rotation" == "270" ]]; then
                log_info "Setting rotation to $rotation..."
                # Update widget URL rotation parameter in the kiosk service or script
                ssh "${USER}@${HOST}" -p "$PORT" "sed -i 's/rotation=[0-9]*/rotation=$rotation/g' ~/.config/systemd/user/otaclaw-kiosk.service ~/.openclaw/scripts/kco-start-otaclaw-kiosk.sh 2>/dev/null || true"
            fi
            echo
        fi
    fi
}

# Restart OpenClaw gateway (optional)
restart_openclaw() {
    if [[ "$LOCAL_INSTALL" == "true" ]]; then
        return 0
    fi
    # Skip prompt when --restart-kiosk (non-interactive flow)
    if [[ "$RESTART_KIOSK" == "true" ]]; then
        return 0
    fi
    read -p "Restart OpenClaw gateway to apply changes? [y/N]: " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Restarting OpenClaw gateway..."
        
        ssh "${USER}@${HOST}" -p "$PORT" "systemctl --user restart openclaw-gateway 2>/dev/null || openclaw gateway restart" || {
            log_warn "Could not restart OpenClaw automatically"
            log_warn "Please restart manually: ssh ${USER}@${HOST} 'systemctl --user restart openclaw-gateway'"
        }
        
        log_info "Waiting for OpenClaw to restart..."
        sleep 3
    fi
}

# Get local network URL with token (runs on the OpenClaw host)
# Returns: http://LAN_IP:18789/__openclaw__/canvas/otaclaw/widget.html?oc_token=...
get_widget_url_with_token() {
    local py_script
    py_script='import json,os,subprocess
p=18789
b="/__openclaw__/canvas/otaclaw/widget.html"
t=""
for path in [os.path.expanduser("~/.openclaw/openclaw.json")]:
    try:
        if os.path.isfile(path):
            with open(path) as f: t=json.load(f).get("gateway",{}).get("auth",{}).get("token","")
            break
    except: pass
if not t:
    try:
        with open(os.path.expanduser("~/.config/systemd/user/openclaw-gateway.service")) as f:
            for l in f:
                if "OPENCLAW_GATEWAY_TOKEN=" in l: t=l.split("=",1)[1].strip(); break
    except: pass
ip="localhost"
try: ip=subprocess.check_output(["hostname","-I"],timeout=2).decode().split()[0].strip()
except: pass
u=f"http://{ip}:{p}{b}"
if t: u+=f"?oc_token={t}"
print(u)'
    if [[ "$LOCAL_INSTALL" == "true" ]]; then
        python3 -c "$py_script"
    else
        ssh "${USER}@${HOST}" -p "$PORT" "python3 -c '$py_script'"
    fi
}

# Print access information
print_access_info() {
    local url
    url=$(get_widget_url_with_token 2>/dev/null) || url="http://${HOST}:18789/__openclaw__/canvas/otaclaw/widget.html"
    
    echo
    log_success "OtaClaw deployed successfully!"
    echo
    echo "OTACLAW_URL: $url"
    echo
    echo -e "${GREEN}Local network URL (open from any device on your LAN):${NC}"
    echo "  $url"
    if [[ "$LOCAL_INSTALL" != "true" ]]; then
        local tunnel_url="http://localhost:18789/__openclaw__/canvas/otaclaw/widget.html?rotation=0"
        [[ "$url" == *"oc_token="* ]] && tunnel_url="${tunnel_url}&oc_token=${url#*oc_token=}"
        echo
        echo -e "${YELLOW}From Mac/PC (tunnel required – connects to ${HOST}):${NC}"
        echo "  1. On your Mac, run:"
        echo "     ssh -L 18789:127.0.0.1:18789 ${USER}@${HOST} -N"
        echo "  2. Open in browser:"
        echo "     $tunnel_url"
        echo
        echo -e "${BLUE}Tickle/wake sync:${NC} For tickle and wake to sync between Pi kiosk and Mac tab, the OpenClaw gateway must broadcast client.interaction to all webchat sessions."
    fi
    echo
    echo -e "${BLUE}Configuration:${NC}"
    echo "  Edit config at: ${CANVAS_PATH%/}/otaclaw/js/config.js"
    echo "  Or locally at:  ${CONFIG_DIR}/config.js"
    if [[ "$LOCAL_INSTALL" == "true" ]]; then
        echo
        echo -e "${YELLOW}Kiosk mode:${NC} chromium --kiosk --app=$url"
    fi
    if [[ "$LOCAL_INSTALL" != "true" ]]; then
        echo
        echo -e "${YELLOW}Note:${NC} If you see 'Configuration Required' page:"
        echo "  1. SSH: ssh ${USER}@${HOST}"
        echo "  2. Edit: nano ${CANVAS_PATH%/}/otaclaw/js/config.js"
        echo "  3. Set OpenClaw host and restart"
    fi
    echo
}

# Main deployment flow
main() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  OtaClaw for OpenClaw - Deploy Script${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo
    
    parse_args "$@"
    detect_host
    detect_user
    check_prerequisites
    fresh_install
    verify_openclaw
    deploy_files
    verify_deployment
    
    if [[ "$DRY_RUN" == "false" ]]; then
        configure_settings
        restart_openclaw
        if [[ "$RESTART_KIOSK" == "true" && "$LOCAL_INSTALL" != "true" ]]; then
            log_info "Updating kiosk script (cache-bust) and restarting..."
            if [[ -f "${REPO_ROOT}/scripts/patch-kiosk-cache-bust.sh" ]]; then
                bash "${REPO_ROOT}/scripts/patch-kiosk-cache-bust.sh" "$HOST" "$USER" 2>/dev/null || true
            fi
            ssh "${USER}@${HOST}" -p "$PORT" 'XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user restart otaclaw-kiosk'
            ssh "${USER}@${HOST}" -p "$PORT" 'DISPLAY=:0 xset dpms force on 2>/dev/null || true'
            log_success "Kiosk restarted"
            log_info "Tip: If screensaver never activates, run: ./scripts/enable-kiosk-screensaver.sh ${HOST} ${USER} 300"
            # Optional: Pi buzzer for tickle sound. Only when --setup-buzzer (avoids overwriting user customization)
            if [[ "$SETUP_BUZZER" == "true" && -f "${REPO_ROOT}/scripts/pi-buzzer-tickle.py" ]]; then
                log_info "Setting up Pi buzzer..."
                scp -P "$PORT" "${REPO_ROOT}/scripts/pi-buzzer-tickle.py" "${USER}@${HOST}:~/"
                # Only set buzzerTickleUrl when it is currently null
                if ssh "${USER}@${HOST}" -p "$PORT" "grep -q 'buzzerTickleUrl: null' ~/.openclaw/canvas/otaclaw/js/config.js 2>/dev/null"; then
                    ssh "${USER}@${HOST}" -p "$PORT" "sed -i 's|buzzerTickleUrl: null|buzzerTickleUrl: \"http://127.0.0.1:18790/tickle\"|' ~/.openclaw/canvas/otaclaw/js/config.js"
                fi
                ssh "${USER}@${HOST}" -p "$PORT" 'pgrep -f pi-buzzer-tickle >/dev/null || (nohup python3 ~/pi-buzzer-tickle.py --audio >> /tmp/buzzer-tickle.log 2>&1 &)'
                log_success "Pi buzzer configured"
            fi
        fi
        print_access_info
    else
        log_info "Dry run complete - no changes made"
    fi
}

# Run main function
main "$@"

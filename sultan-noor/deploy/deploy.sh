#!/usr/bin/env bash
# One-shot production deploy for سلطان نور (Sultan Noor) on a fresh Ubuntu VPS.
#
# Run this yourself on the server (as root), from the repo root:
#   git clone <repo-url> sultan-noor && cd sultan-noor
#   cp .env.production.example .env && nano .env   # fill in real secrets first
#   sudo LETSENCRYPT_EMAIL=you@example.com ./deploy/deploy.sh
#
# Safe to re-run: every step checks whether it already did its job before
# doing it again (idempotent install/config steps, `docker compose up -d`
# only recreates what changed).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

log()  { echo -e "\n\033[1;32m==>\033[0m $*"; }
warn() { echo -e "\033[1;33m!!\033[0m $*"; }
die()  { echo -e "\033[1;31mERROR:\033[0m $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run this as root (sudo ./deploy/deploy.sh)."
[[ -f .env ]] || die ".env not found. Run: cp .env.production.example .env && nano .env — then re-run this script."

# shellcheck disable=SC1091
set -a; source .env; set +a
: "${DOMAIN:?Set DOMAIN in .env}"
: "${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}"
[[ "$POSTGRES_PASSWORD" != "change-me-to-a-long-random-password" ]] || die "POSTGRES_PASSWORD is still the placeholder — edit .env first."
[[ "$JWT_ACCESS_SECRET" != "change-me-access-secret" ]] || die "JWT_ACCESS_SECRET is still the placeholder — edit .env first."
[[ "$JWT_REFRESH_SECRET" != "change-me-refresh-secret" ]] || die "JWT_REFRESH_SECRET is still the placeholder — edit .env first."

LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
[[ -n "$LETSENCRYPT_EMAIL" ]] || die "Set LETSENCRYPT_EMAIL=you@example.com before running (needed for certificate expiry notices)."

# --- 1. Sanity: ports 80/443 must be free for Nginx --------------------------
log "Checking ports 80/443 are free for Nginx"
for p in 80 443; do
  if ss -tlnp 2>/dev/null | grep -q ":$p "; then
    owner=$(ss -tlnp 2>/dev/null | grep ":$p " || true)
    echo "$owner" | grep -q nginx || die "Port $p is already in use by something other than Nginx:\n$owner\nFree it (e.g. if sshd is bound to 443, move it back to 22) and re-run."
  fi
done

# --- 2. Docker ----------------------------------------------------------------
if ! command -v docker >/dev/null; then
  log "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || die "Docker Compose plugin missing — reinstall Docker (curl -fsSL https://get.docker.com | sh)."

# --- 3. Swap file (this VPS has ~2GB RAM — production builds need headroom) --
if [[ "$(swapon --show | wc -l)" -eq 0 ]]; then
  log "No swap detected — creating a 2G swap file"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
else
  log "Swap already configured, skipping"
fi

# --- 4. Nginx + certbot ---------------------------------------------------
if ! command -v nginx >/dev/null || ! command -v certbot >/dev/null; then
  log "Installing Nginx + certbot"
  apt-get update -y
  apt-get install -y nginx certbot python3-certbot-nginx
fi

# certbot rewrites this file in place to add the HTTPS server block — once
# that's happened, re-running the plain HTTP template here would clobber it.
if [[ -f "/etc/nginx/sites-available/$DOMAIN" ]] && grep -q "listen 443" "/etc/nginx/sites-available/$DOMAIN"; then
  log "Nginx site for $DOMAIN already has HTTPS configured, skipping template"
else
  log "Installing Nginx site for $DOMAIN"
  sed "s/__DOMAIN__/$DOMAIN/g" deploy/nginx.conf.template > "/etc/nginx/sites-available/$DOMAIN"
  ln -sf "/etc/nginx/sites-available/$DOMAIN" "/etc/nginx/sites-enabled/$DOMAIN"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx || systemctl restart nginx
fi

if [[ ! -d "/etc/letsencrypt/live/$DOMAIN" ]] || ! grep -q "listen 443" "/etc/nginx/sites-available/$DOMAIN"; then
  log "Requesting/attaching Let's Encrypt certificate for $DOMAIN"
  warn "This requires $DOMAIN's DNS A record to already point at this server's public IP."
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$LETSENCRYPT_EMAIL" --redirect
else
  log "HTTPS for $DOMAIN already configured, skipping certbot (renewal runs automatically via the certbot systemd timer)"
fi

# --- 5. Build and start the app containers ------------------------------------
log "Building Docker images (this can take a few minutes on a 1 vCPU VPS)"
docker compose -f docker-compose.prod.yml build

log "Starting postgres + redis"
docker compose -f docker-compose.prod.yml up -d postgres redis

log "Waiting for postgres to be healthy"
until [[ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose -f docker-compose.prod.yml ps -q postgres)")" == "healthy" ]]; do
  sleep 2
done

log "Running database migrations"
docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy

log "Starting api + web"
docker compose -f docker-compose.prod.yml up -d

log "Done. https://$DOMAIN should be live within a minute."
echo "Check logs with: docker compose -f docker-compose.prod.yml logs -f"

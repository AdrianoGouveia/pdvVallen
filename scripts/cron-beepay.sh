#!/usr/bin/env bash
# Cron da VPS da integração Vallen ⇄ Beepay (mesmo esquema do /opt/sync-vendas.sh).
#
#   produtos → /api/cron/push-produtos-beepay (produto novo/alterado da loja → Beepay)
#              funciona JÁ (login do painel); instalar assim que a migration
#              20261019000000_produto_beepay estiver aplicada e o deploy feito.
#   push     → /api/cron/push-vendas-beepay   (venda aprovada do app → cupom no Beepay)
#   sync     → /api/cron/sync-vendas-beepay   (vendas do PDV Legal → relatório do Vallen)
#              push/sync: só depois de client_secret + terminal do app + go-live
#              (UPDATE integracao.beepay_filial SET ativo=true …). Sem isso respondem
#              ok:false com o que falta e não mexem em nada.
#
# Instalação (na VPS, como root):
#   install -m 750 scripts/cron-beepay.sh /opt/cron-beepay.sh
#   printf 'VALLEN_BASE_URL=https://<domínio da Vercel>\nCRON_SECRET=<o mesmo da Vercel>\n' > /opt/vallen-cron.env
#   chmod 600 /opt/vallen-cron.env
#   crontab -e →
#     */5 * * * *  /opt/cron-beepay.sh produtos >> /var/log/vallen-beepay.log 2>&1
#     */5 * * * *  /opt/cron-beepay.sh push     >> /var/log/vallen-beepay.log 2>&1
#     15 * * * *   /opt/cron-beepay.sh sync     >> /var/log/vallen-beepay.log 2>&1
# E desligar o cron antigo do DWPDV (/opt/push-produtos-check.sh), que agora só responde
# "desligado". Re-sync de um período: /opt/cron-beepay.sh sync 2026-10-01 2026-10-10
set -euo pipefail

ENV_FILE="${VALLEN_CRON_ENV:-/opt/vallen-cron.env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE"
: "${VALLEN_BASE_URL:?defina VALLEN_BASE_URL em $ENV_FILE}"
: "${CRON_SECRET:?defina CRON_SECRET em $ENV_FILE}"

case "${1:-}" in
  produtos) URL="$VALLEN_BASE_URL/api/cron/push-produtos-beepay" ;;
  push)     URL="$VALLEN_BASE_URL/api/cron/push-vendas-beepay" ;;
  sync)     URL="$VALLEN_BASE_URL/api/cron/sync-vendas-beepay"
            [ -n "${2:-}" ] && URL="$URL?desde=$2${3:+&ate=$3}" ;;
  *) echo "uso: $0 produtos | push | sync [desde ate]" >&2; exit 2 ;;
esac

# segredo vai no header (não na URL → não aparece em log de acesso)
RESP=$(curl -sS -m 60 -H "Authorization: Bearer $CRON_SECRET" -w '\n%{http_code}' "$URL")
CODE=$(printf '%s' "$RESP" | tail -n1)
echo "$(date -Is) $1 HTTP $CODE $(printf '%s' "$RESP" | sed '$d')"
[ "$CODE" = "200" ]

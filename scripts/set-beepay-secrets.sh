#!/usr/bin/env bash
# Grava as credenciais do Beepay / API Tablet Cloud como env vars de PRODUÇÃO na Vercel
# e testa se a API gera token. Usadas pelo conector de integração.
#   BEEPAY_EMAIL / BEEPAY_PASSWORD             → usuário e senha
#   BEEPAY_CLIENT_ID / BEEPAY_CLIENT_SECRET    → código e senha da empresa (API, opcional)
# Rode da raiz do projeto (pasta linkada à Vercel):
#   bash scripts/set-beepay-secrets.sh
# Os valores não são exibidos nem gravados em disco. Pode rodar de novo pra trocar.
set -euo pipefail

API=https://api.tabletcloud.com.br
command -v vercel >/dev/null || { echo "Vercel CLI não encontrada (npm i -g vercel)."; exit 1; }
[ -f .vercel/project.json ] || { echo "Rode na raiz do projeto linkado à Vercel."; exit 1; }

read -rp  "Usuário/e-mail do Beepay: " BEEPAY_EMAIL
read -rsp "Senha do Beepay: "          BEEPAY_PASSWORD; echo
read -rp  "Código da empresa (API, Enter p/ pular): " BEEPAY_CLIENT_ID
BEEPAY_CLIENT_SECRET=""
[ -n "$BEEPAY_CLIENT_ID" ] && { read -rsp "Senha da empresa (API): " BEEPAY_CLIENT_SECRET; echo; }
[ -n "$BEEPAY_EMAIL" ] && [ -n "$BEEPAY_PASSWORD" ] || { echo "Usuário e senha são obrigatórios."; exit 1; }

grava() {
  vercel env rm "$1" production --yes >/dev/null 2>&1 || true   # troca se já existir
  printf '%s' "$2" | vercel env add "$1" production >/dev/null
  echo "✓ $1 gravado (production)"
}
grava BEEPAY_EMAIL    "$BEEPAY_EMAIL"
grava BEEPAY_PASSWORD "$BEEPAY_PASSWORD"
if [ -n "$BEEPAY_CLIENT_ID" ] && [ -n "$BEEPAY_CLIENT_SECRET" ]; then
  grava BEEPAY_CLIENT_ID     "$BEEPAY_CLIENT_ID"
  grava BEEPAY_CLIENT_SECRET "$BEEPAY_CLIENT_SECRET"
  # Testa a geração do token (não exibe o token)
  RESP=$(curl -s -m 30 -X POST "$API/token" \
    --data-urlencode "username=$BEEPAY_EMAIL" --data-urlencode "password=$BEEPAY_PASSWORD" \
    --data-urlencode "grant_type=password" \
    --data-urlencode "client_id=$BEEPAY_CLIENT_ID" --data-urlencode "client_secret=$BEEPAY_CLIENT_SECRET" || true)
  printf '%s' "$RESP" | node -e '
    let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{
      try{const j=JSON.parse(s);
        if(j.access_token) console.log("✓ API: token gerado (expira em "+j.expires_in+"s)");
        else console.log("✗ API recusou: "+(j.error_description||j.error||"resposta inesperada"));
      }catch{console.log("✗ API: resposta não-JSON (verifique a conexão)")}
    })'
else
  echo "• Credenciais da API não informadas — pulei o teste de token."
fi
unset BEEPAY_EMAIL BEEPAY_PASSWORD BEEPAY_CLIENT_ID BEEPAY_CLIENT_SECRET RESP
echo "Pronto. As variáveis valem a partir do próximo deploy."

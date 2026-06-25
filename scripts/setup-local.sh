#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  cp .env.example .env
fi

if grep -q "replace-with-a-random-32-plus-character-secret" .env; then
  if command -v openssl >/dev/null 2>&1; then
    secret="$(openssl rand -base64 32)"
  else
    secret="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
  fi
  node -e "const fs=require('fs'); const p='.env'; let s=fs.readFileSync(p,'utf8'); s=s.replace(/SESSION_SECRET=\"replace-with-a-random-32-plus-character-secret\"/, 'SESSION_SECRET=\"' + process.argv[1] + '\"'); fs.writeFileSync(p,s);" "$secret"
fi

mkdir -p data uploads script_narrative_rag/data

echo "Local setup complete."
echo "Next: git lfs install && git lfs pull"
echo "Then: docker compose up --build"

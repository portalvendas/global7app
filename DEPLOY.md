# Global 7 API — Deploy (GitHub → Render)

Stack: NestJS 11 + Prisma 6 (PostgreSQL) · Docker · Blueprint Render.

## 1. Subir para o GitHub

Crie um repositório vazio (ex.: `global7-api`) e envie:

```bash
cd global7-api
git init
git add .
git commit -m "chore: scaffold inicial da API Global 7 (fases 0-1)"
git branch -M main
git remote add origin https://github.com/<SUA_ORG>/global7-api.git
git push -u origin main
```

## 2. Deploy no Render (Blueprint)

O deploy roda direto do GitHub — a cada `git push`, o Render rebuilda
(`autoDeployTrigger: commit`).

1. Render → **New > Blueprint** → conecte o repo `global7-api`.
2. O `render.yaml` provisiona 2 recursos:
   - **global7-db** (PostgreSQL 16)
   - **global7-api** (web service Docker)
3. `DATABASE_URL` e os `JWT_SECRET`/`JWT_REFRESH_SECRET` são preenchidos
   automaticamente. Preencha no painel os marcados como `sync: false`:
   - `CORS_ORIGIN` → domínio do front (ex.: `https://global7-web.onrender.com`)
   - `APP_URL` → URL pública desta API
   - (opcional) `ADMIN_EMAIL` / `ADMIN_PASSWORD` para o seed.
4. Clique em **Apply**. No primeiro boot, o container roda
   `prisma migrate deploy` (cria as tabelas) e sobe a API.
5. Healthcheck: `GET /api/v1/health`. Swagger: `/docs`.

## 3. Migrations

- **Local (dev):** `npx prisma migrate dev --name <nome>` cria a migration.
  Commite a pasta `prisma/migrations/`.
- **Produção:** o `CMD` do Dockerfile roda `prisma migrate deploy` a cada
  deploy (idempotente) — não precisa rodar nada manual no Render.

> ⚠️ Antes do 1º deploy, gere a migration inicial localmente
> (`npx prisma migrate dev --name init`) e commite `prisma/migrations/`.
> Sem ela, `migrate deploy` não tem o que aplicar.

## 4. Primeiro admin

Com `SEED_ON_BOOT` você pode rodar o seed, ou rode manualmente uma vez
(Render Shell): `npm run prisma:seed`. Cria a empresa **Global 7** (OPERATOR)
e o admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD`).

## 5. Fases seguintes

Redis/Key Value (BullMQ) e disco/Storage entram na Fase 3 (Daily offline +
fotos no Google Drive). Aí o `render.yaml` ganha o serviço `keyvalue`.

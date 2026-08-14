# Global 7 — API (App Operacional)

Backend NestJS 11 + Prisma 6 (PostgreSQL) do sistema operacional da Global 7:
empresas, subcontratadas, equipes, projetos, financeiro interno (USD) e Daily
Production. Mesmo padrão do Chat Bullq. Deploy em Docker no Render.

## Rodar local

```bash
cp .env.example .env          # ajuste DATABASE_URL e os segredos JWT
npm install
npx prisma migrate dev        # cria as tabelas
npm run prisma:seed           # cria a empresa Global 7 + admin inicial
npm run start:dev             # API em http://localhost:3001 (Swagger em /docs)
```

## O que já vem pronto (Fases 0-1)

- **Auth multi-tenant**: JWT (access + refresh), `POST /api/v1/auth/login|refresh|register`.
- **Papéis**: `GLOBAL7_ADMIN`, `GLOBAL7_STAFF`, `SUBCONTRACTOR_ADMIN`, `TEAM_MEMBER`, `CLIENT_VIEWER`.
- **Isolamento**: `RolesGuard` + escopo por empresa/equipe derivado do token.
- **companies / teams / projects**: CRUD com escopo multi-tenant e paginação.
- **health**: `GET /api/v1/health` (usado pelo Render healthcheck).
- **Schema completo**: todas as tabelas já criadas (incl. invoices, bills,
  daily_productions, attachments) — os módulos dessas entram nas próximas fases.

## Próximas fases (ordem sugerida)

- **2** — Daily Production (web) + fluxo de aprovação.
- **3** — Daily PWA offline-first + Google Drive (fotos) + BullMQ/Redis.
- **4** — invoices / bills (self-service da subcontratada + aprovação).
- **5** — dashboard (agregações server-side).
- **6** — encaixe QuickBooks (campos `externalRef`/`syncStatus` já reservados).

## Convenções

Prefixo `api/v1`, `ValidationPipe` (whitelist), `GlobalExceptionFilter`,
interceptors de log/response, respostas no formato `{ success, data }`.

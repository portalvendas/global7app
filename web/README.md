# Global 7 — Web (PWA offline-first)

Frontend Next.js (App Router) focado no **Daily Production** de campo:
login, lançar (texto + fotos + GPS), **fila offline** (IndexedDB) que sincroniza
sozinha quando volta a conexão, e fluxo de aprovação (aprovar/rejeitar) para a Global 7.

- Consome a API em `NEXT_PUBLIC_API_URL` (default: https://global7app.onrender.com).
- PWA instalável: `manifest.webmanifest` + service worker (`public/sw.js`).
- Storage offline: Dexie/IndexedDB (`src/lib/db.ts`) + sync (`src/lib/sync.ts`).

## Rodar local
```bash
npm install
npm run dev   # http://localhost:3000
```

## Deploy no Render (Docker)
1. Criar repo GitHub `global7-web` e dar push.
2. Render → New > Blueprint (ou Web Service) apontando pro repo. O `render.yaml`
   provisiona um web service Docker (Starter). Ajuste `NEXT_PUBLIC_API_URL` se a API mudar.
3. No app da API, adicionar o domínio do front em `CORS_ORIGIN`.

## Offline-first (como funciona)
- Cada Daily recebe um `clientUuid` no aparelho → upsert idempotente no backend (não duplica).
- Fotos são comprimidas no cliente (~1MB) e ficam numa fila; sobem quando há conexão.
- O service worker guarda o "shell" do app; os dados offline vivem no IndexedDB.

## Ícones
`public/icons/icon.svg` é um placeholder. Para lojas/installability plena, gerar PNG 192/512.

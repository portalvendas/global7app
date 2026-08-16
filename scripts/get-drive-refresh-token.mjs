#!/usr/bin/env node
/**
 * Obtém o GDRIVE_REFRESH_TOKEN (uma vez só) para o storage do Global 7.
 *
 * Pré-requisitos (no Google Cloud Console, conta do Diogo):
 *   1. Crie/So use um projeto → "APIs & Services" → ative a "Google Drive API".
 *   2. "OAuth consent screen": tipo External, adicione seu e-mail em "Test users".
 *   3. "Credentials" → Create Credentials → OAuth client ID → tipo "Desktop app".
 *      Copie o Client ID e o Client Secret.
 *
 * Uso (no Terminal do Mac, dentro da pasta do projeto):
 *   GDRIVE_CLIENT_ID=xxxx GDRIVE_CLIENT_SECRET=yyyy node scripts/get-drive-refresh-token.mjs
 *
 * Ele abre uma URL, você autoriza com sua conta Google, cola o "code" de volta,
 * e o script imprime o refresh_token. Guarde-o como GDRIVE_REFRESH_TOKEN no Render.
 *
 * (Requer o pacote googleapis — já é dependência do projeto após `npm install`.)
 */
import http from 'node:http';
import { URL } from 'node:url';
import readline from 'node:readline';
import { google } from 'googleapis';

const CLIENT_ID = process.env.GDRIVE_CLIENT_ID;
const CLIENT_SECRET = process.env.GDRIVE_CLIENT_SECRET;
const PORT = 53682;
const REDIRECT = `http://localhost:${PORT}/oauth2callback`;
const SCOPE = ['https://www.googleapis.com/auth/drive.file'];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Defina GDRIVE_CLIENT_ID e GDRIVE_CLIENT_SECRET no ambiente antes de rodar.');
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT);
const authUrl = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // força emissão do refresh_token
  scope: SCOPE,
});

async function exchange(code) {
  const { tokens } = await oauth2.getToken(code);
  console.log('\n==================== COPIE ISTO ====================');
  console.log('GDRIVE_REFRESH_TOKEN=' + (tokens.refresh_token || '(vazio — refaça com prompt=consent)'));
  console.log('====================================================\n');
  console.log('Cole GDRIVE_REFRESH_TOKEN nas variáveis de ambiente do serviço no Render.');
}

// Tenta capturar o code automaticamente via servidor local; se não der, aceita colado.
const server = http
  .createServer(async (req, res) => {
    if (!req.url.startsWith('/oauth2callback')) {
      res.writeHead(404).end();
      return;
    }
    const code = new URL(req.url, REDIRECT).searchParams.get('code');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>Pode fechar esta aba e voltar ao Terminal.</h2>');
    server.close();
    try {
      await exchange(code);
    } catch (e) {
      console.error('Falha ao trocar o code:', e.message);
    }
    process.exit(0);
  })
  .listen(PORT, () => {
    console.log('\n1) Abra esta URL no navegador (logado na conta do Drive):\n');
    console.log(authUrl + '\n');
    console.log('2) Autorize. Você será redirecionado pro localhost e o token aparece aqui.\n');
    console.log('   (Se o navegador não abrir sozinho, copie a URL acima manualmente.)\n');
    console.log('Fallback: se o redirect falhar, cole o "code" da URL aqui e Enter:');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('line', async (line) => {
      const code = line.trim();
      if (code) {
        rl.close();
        try {
          await exchange(code);
        } catch (e) {
          console.error('Falha:', e.message);
        }
        process.exit(0);
      }
    });
  });

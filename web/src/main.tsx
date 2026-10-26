import React from 'react';
import { createRoot } from 'react-dom/client';
import { LogtoProvider } from '@logto/react';
import App from './App';
import './style.css';
export type Config = { endpoint: string; appId: string; resource: string; origin: string };
async function start() {
  const response = await fetch('/config.json', { cache: 'no-store' });
  if (!response.ok) throw Error('Chưa tạo config.json. Chạy server/scripts/configure.py.');
  const config = (await response.json()) as Config;
  if (config.appId === 'CONFIGURE_IN_LOGTO')
    throw Error(
      'Tạo ứng dụng SPA trong Logto, điền LOGTO_APP_ID vào server/.env rồi chạy lại configure.py.',
    );
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <LogtoProvider
        config={{ endpoint: config.endpoint, appId: config.appId, resources: [config.resource], scopes: ["profile"] }}
      >
        <App config={config} />
      </LogtoProvider>
    </React.StrictMode>,
  );
}
start().catch((e) => {
  const p = document.createElement('p');
  p.className = 'setup-error';
  p.textContent = String(e);
  document.getElementById('root')!.append(p);
});

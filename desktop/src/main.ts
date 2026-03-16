import { app, BrowserWindow, session } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';

if (started) {
  app.quit();
}

const DESKTOP_API_BASE_URL = (process.env.DESKTOP_API_BASE_URL ?? 'https://zap.santos-games.com/api').replace(/\/+$/, '');
const DESKTOP_WS_BASE_URL = (process.env.DESKTOP_WS_BASE_URL ?? 'wss://zap.santos-games.com/api').replace(/\/+$/, '');
const WEB_DEV_SERVER_URL = process.env.WEB_DEV_SERVER_URL ?? 'http://localhost:5173';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

let desktopRedirectsRegistered = false;

const getRedirectUrl = (rawUrl: string): string | null => {
  try {
    const url = new URL(rawUrl);
    const isLocalHost = LOCAL_HOSTS.has(url.hostname.toLowerCase());
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
    const isWs = url.protocol === 'ws:' || url.protocol === 'wss:';

    if (!isLocalHost) {
      return null;
    }

    if (isHttp) {
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        const suffix = url.pathname.slice('/api'.length);
        return `${DESKTOP_API_BASE_URL}${suffix}${url.search}`;
      }

      if (url.pathname === '/ws' || url.pathname.startsWith('/ws/')) {
        const suffix = url.pathname.slice('/ws'.length);
        return `${DESKTOP_WS_BASE_URL}${suffix}${url.search}`;
      }

      if (url.port === '5000') {
        return `${DESKTOP_API_BASE_URL}${url.pathname}${url.search}`;
      }
    }

    if (isWs) {
      if (url.pathname === '/ws' || url.pathname.startsWith('/ws/')) {
        const suffix = url.pathname.slice('/ws'.length);
        return `${DESKTOP_WS_BASE_URL}${suffix}${url.search}`;
      }

      if (url.port === '5000') {
        return `${DESKTOP_WS_BASE_URL}${url.pathname}${url.search}`;
      }
    }

    return null;
  } catch {
    return null;
  }
};

const registerDesktopRequestRedirects = () => {
  if (desktopRedirectsRegistered) {
    return;
  }

  session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    const redirectUrl = getRedirectUrl(details.url);

    if (redirectUrl && redirectUrl !== details.url) {
      callback({ redirectURL: redirectUrl });
      return;
    }

    callback({});
  });

  desktopRedirectsRegistered = true;
};

const createWindow = () => {
  registerDesktopRequestRedirects();

  const mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize(); // Maximize the window
    mainWindow.show(); // Show the window after maximization is complete
  });
  

  const fallbackToInternalRenderer = () => {
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
      return;
    }

    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  };

  if (!app.isPackaged) {
    mainWindow.loadURL(WEB_DEV_SERVER_URL).catch(() => {
      fallbackToInternalRenderer();
    });
    return;
  }

  const packagedWebDist = path.resolve(process.resourcesPath, 'web', 'dist', 'index.html');
  const packagedDistOnly = path.resolve(process.resourcesPath, 'dist', 'index.html');
  const localWebDist = path.resolve(app.getAppPath(), '..', 'web', 'dist', 'index.html');

  if (existsSync(packagedWebDist)) {
    mainWindow.loadFile(packagedWebDist);
    return;
  }

  if (existsSync(packagedDistOnly)) {
    mainWindow.loadFile(packagedDistOnly);
    return;
  }

  if (existsSync(localWebDist)) {
    mainWindow.loadFile(localWebDist);
    return;
  }

  fallbackToInternalRenderer();
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});


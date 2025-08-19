/**
 * Xdemon Bug Bot – Baileys WhatsApp bot
 * Features:
 * - Pairing by phone number (code returned to web UI)
 * - Multi-session support + connect/disconnect
 * - Auto presence + optional profile "About" status
 * - Auto-reaction to incoming messages (configurable emoji)
 * - Commands:
 *    .menu -> sends your menu image + commands list
 *    .ping -> pong
 *    .dp [@mention or number] -> saves their DP to /downloads
 */
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchProfilePictureUrl,
  Browsers
} from "@whiskeysockets/baileys";
import Pino from "pino";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SESSIONS_DIR = path.join(__dirname, "..", "sessions");
const DOWNLOADS_DIR = path.join(__dirname, "..", "downloads");
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

const AUTO_STATUS_TEXT = process.env.AUTO_STATUS_TEXT || "Xdemon Bug Bot online ⚡";
const AUTO_REACT = process.env.AUTO_REACT ?? "👍"; // set empty to disable
const MENU_IMAGE_URL = process.env.MENU_IMAGE_URL || "https://i.postimg.cc/B6w4rV6T/20250611-123112.png";
const OWNER_NUMBER = (process.env.OWNER_NUMBER || "").replace(/\D/g, ""); // optional, to notify on connect

// in-memory store of sockets + state
const sessions = new Map(); // id -> { sock, state }

function sessionPath(sessionId) {
  return path.join(SESSIONS_DIR, sessionId);
}

export function listActiveSessions() {
  // include folders even if not running
  const dirs = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  // include running ones not yet persisted
  for (const id of sessions.keys()) if (!dirs.includes(id)) dirs.push(id);
  return dirs;
}

export function getSessionState(sessionId) {
  const s = sessions.get(sessionId);
  return s?.state || "stopped";
}

export async function startOrAttachBot(sessionId) {
  const authDir = sessionPath(sessionId);
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    logger: Pino({ level: process.env.LOG_LEVEL || "info" }),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: "fatal" })),
    },
    browser: Browsers.ubuntu("Chrome"),
    markOnlineOnConnect: true,
    syncFullHistory: false,
  });

  sessions.set(sessionId, { sock, state: "connecting" });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (u) => {
    const { connection, lastDisconnect } = u;
    if (connection === "open") {
      sessions.set(sessionId, { sock, state: "connected" });
      try {
        await sock.sendPresenceUpdate("available");
      } catch {}
      try {
        if (AUTO_STATUS_TEXT && typeof sock.updateProfileStatus === "function") {
          await sock.updateProfileStatus(AUTO_STATUS_TEXT).catch(() => {});
        }
      } catch {}
      // Optionally notify owner with menu image
      if (OWNER_NUMBER) {
        try {
          const ownerJid = OWNER_NUMBER + "@s.whatsapp.net";
          const img = await (await fetch(MENU_IMAGE_URL)).arrayBuffer();
          const caption = getMenuText();
          await sock.sendMessage(ownerJid, { image: Buffer.from(img), caption });
        } catch {}
      }
      console.log("✅ Connected:", sessionId);
    } else if (connection === "close") {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      sessions.set(sessionId, { sock, state: "closed" });
      console.log("❌ Connection closed:", sessionId, "reconnect:", shouldReconnect);
      if (shouldReconnect) {
        startOrAttachBot(sessionId).catch(console.error);
      }
    } else if (connection === "connecting") {
      sessions.set(sessionId, { sock, state: "connecting" });
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      const from = msg.key.remoteJid;
      const isFromMe = msg.key.fromMe;
      const isGroup = from?.endsWith("@g.us");
      if (isFromMe) continue;

      // Auto-react (only in private chats)
      try {
        if (!isGroup && AUTO_REACT) {
          await sock.sendMessage(from, { react: { text: AUTO_REACT, key: msg.key } });
        }
      } catch {}

      const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        "";

      if (!body.startsWith(".")) continue;
      const [cmd, ...rest] = body.trim().split(/\s+/);

      if (cmd === ".ping") {
        await sock.sendMessage(from, { text: "pong" });
      }

      if (cmd === ".menu") {
        try {
          const ab = await (await fetch(MENU_IMAGE_URL)).arrayBuffer();
          const caption = getMenuText();
          await sock.sendMessage(from, { image: Buffer.from(ab), caption });
        } catch (e) {
          await sock.sendMessage(from, { text: "Menu image fetch failed. Please check MENU_IMAGE_URL." });
        }
      }

      if (cmd === ".dp") {
        let targetJid = null;
        const context = msg.message?.extendedTextMessage?.contextInfo;
        if (context?.mentionedJid?.length) targetJid = context.mentionedJid[0];
        if (!targetJid && rest.length) {
          const raw = rest[0].replace(/\D/g, "");
          if (raw) targetJid = `${raw}@s.whatsapp.net`;
        }
        if (!targetJid) targetJid = msg.key.participant || from;

        try {
          const url = await fetchProfilePictureUrl(sock, targetJid, "image");
          if (!url) throw new Error("No profile photo");
          const buf = await (await fetch(url)).arrayBuffer();
          const fileName = targetJid.replace(/[@:]/g, "_") + ".jpg";
          fs.writeFileSync(path.join(DOWNLOADS_DIR, fileName), Buffer.from(buf));
          await sock.sendMessage(from, { text: `✅ DP saved: ${fileName}` });
        } catch (err) {
          await sock.sendMessage(from, { text: `❌ Could not fetch DP: ${String(err?.message || err)}` });
        }
      }
    }
  });

  return sock;
}

export async function logoutAndDeleteSession(sessionId) {
  const s = sessions.get(sessionId);
  if (s?.sock) {
    try { await s.sock.logout(); } catch {}
    try { s.sock.end?.(); } catch {}
  }
  sessions.delete(sessionId);
  const dir = sessionPath(sessionId);
  if (fs.existsSync(dir)) {
    // remove folder
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function requestPairingCodeForNumber(phone, sessionId) {
  if (!/^\d{8,15}$/.test(phone)) throw new Error("Phone must be digits only (8–15).");
  const authDir = sessionPath(sessionId);
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const sock = makeWASocket({
    logger: Pino({ level: process.env.LOG_LEVEL || "info" }),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: "fatal" })),
    },
    mobile: {},
    browser: Browsers.ubuntu("Chrome"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  sock.ev.on("creds.update", saveCreds);
  const code = await sock.requestPairingCode(phone);
  return code;
}

function getMenuText() {
  return [
    "🧿 *Xdemon Bug Bot*",
    "",
    "Commands:",
    "• .menu — show this menu",
    "• .ping — health check",
    "• .dp @user | .dp <number> — save profile photo",
    "",
    "Auto: presence, reactions",
  ].join("\n");
}

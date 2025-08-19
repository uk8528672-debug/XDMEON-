import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import {
  requestPairingCodeForNumber,
  startOrAttachBot,
  listActiveSessions,
  getSessionState,
  logoutAndDeleteSession
} from "./src/bot.js";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// Pair by phone -> return code, choose sessionId (default: phone)
app.post("/api/pair", async (req, res) => {
  try {
    const phone = String(req.body.phone || "").replace(/\D/g, "");
    const sessionId = (req.body.sessionId && String(req.body.sessionId).trim()) || phone;
    if (!phone) return res.status(400).json({ ok: false, error: "Phone required" });
    const code = await requestPairingCodeForNumber(phone, sessionId);
    res.json({ ok: true, code, sessionId });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Start/attach
app.post("/api/start", async (req, res) => {
  try {
    const sessionId = (req.body.sessionId && String(req.body.sessionId).trim()) || null;
    if (!sessionId) return res.status(400).json({ ok: false, error: "sessionId required" });
    await startOrAttachBot(sessionId);
    res.json({ ok: true, sessionId });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Logout & delete session
app.post("/api/logout", async (req, res) => {
  try {
    const sessionId = (req.body.sessionId && String(req.body.sessionId).trim()) || null;
    if (!sessionId) return res.status(400).json({ ok: false, error: "sessionId required" });
    await logoutAndDeleteSession(sessionId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// List sessions + state
app.get("/api/sessions", (_req, res) => {
  try {
    const sessions = listActiveSessions().map(id => ({ id, state: getSessionState(id) }));
    res.json({ ok: true, sessions });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Xdemon Bug Bot dashboard → http://localhost:${PORT}`));

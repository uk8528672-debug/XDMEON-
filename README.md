# Xdemon Bug Bot (Baileys + Express)

Multi-session WhatsApp bot with pairing-by-number page, dashboard (connect/disconnect), auto-status, auto-reactions, a **.menu** image, and DP saver.

## Features
- **Pair by number** → Get the *pairing code* in your browser; enter it in WhatsApp: **Linked devices → Link a device → Enter code**.
- **Multi-session dashboard** → List sessions, Connect, Logout/Delete.
- **Auto presence** and optional profile “About” update.
- **Auto-reaction** (emoji configurable via `.env`).
- **Commands**:
  - `.menu` — sends your menu image + commands list
  - `.ping` — health check
  - `.dp @mention` or `.dp 923001234567` — save profile photo into `downloads/`

> Note: WhatsApp does **not** send the pairing code as a notification to your chats. It is designed to show in your browser/terminal and be entered manually in the app. This keeps your account secure.

## Quick Start
```bash
npm install
cp .env.example .env
npm start
# open http://localhost:3000
```
1) Enter your phone (digits only) and click **Get Pairing Code**.  
2) On your phone: **WhatsApp → Linked devices → Link a device → Enter code**, type the code shown.  
3) After linking, click **Connect** for that session in the dashboard (or it may auto-connect).  
4) In any chat, send `.menu` to see the image menu, `.ping` to test, `.dp @user` to save profile photo.

### Customization
- Change auto reaction: set `AUTO_REACT=` to disable or to some emoji (e.g., `❤️`).
- Change menu image: set `MENU_IMAGE_URL=` to your hosted image link.
- Set `OWNER_NUMBER=` (optional) to get a DM when the bot connects (sends menu automatically).

### Troubleshooting
- If logout needed, use **Logout/Delete**. Then pair again.
- If image does not send on `.menu`, check `MENU_IMAGE_URL` is reachable from your server.

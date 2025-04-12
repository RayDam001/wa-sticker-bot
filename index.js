const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");

const P = require("pino");
const { Boom } = require("@hapi/boom");
const fs = require("fs");
const express = require("express");
const qrcode = require("qrcode");
const { Sticker, StickerTypes } = require("wa-sticker-formatter");

const app = express();
let qrImgData = "";

app.get("/", (req, res) => {
  if (!qrImgData) {
    return res.send("❌ QR belum siap. Tunggu koneksi...");
  }

  res.send(`
    <html>
      <body style="text-align:center; font-family:sans-serif;">
        <h2>📱 Scan QR WhatsApp</h2>
        <img src="${qrImgData}" />
        <p>Scan dari WhatsApp HP kamu untuk login</p>
      </body>
    </html>
  `);
});

app.listen(3000, () => {
  console.log("🌐 QR Web aktif ➜ buka di browser Replit kamu (/)");
});

const store = makeInMemoryStore({
  logger: P().child({ level: "silent", stream: "store" }),
});

const startBot = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

  const sock = makeWASocket({
    version: (await fetchLatestBaileysVersion()).version,
    logger: P({ level: "silent" }),
    auth: state,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    console.log("🔁 Update:", update);

    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      qrcode.toDataURL(qr, (err, url) => {
        qrImgData = url;
        console.log("✅ QR siap di-scan, buka browser Replit kamu");
      });
    }

    if (connection === "open") {
      console.log("✅ Bot terkoneksi ke WhatsApp");
    }

    if (connection === "close") {
      const shouldReconnect =
        new Boom(lastDisconnect?.error)?.output?.statusCode !==
        DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
      else console.log("❌ Bot logout");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const type = Object.keys(msg.message)[0];

    if (type === "imageMessage") {
      const buffer = await downloadMediaMessage(
        msg,
        "buffer",
        {},
        {
          logger: P().child({ level: "silent" }),
          reuploadRequest: sock,
        },
      );

      const sticker = new Sticker(buffer, {
        pack: "My Sticker",
        author: "R",
        type: StickerTypes.FULL,
      });

      const stickerBuffer = await sticker.toBuffer();
      await sock.sendMessage(
        sender,
        { sticker: stickerBuffer },
        { quoted: msg },
      );
    }
  });
};

startBot();

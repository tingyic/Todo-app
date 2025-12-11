const functions = require("firebase-functions");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const webpush = require("web-push");
require("dotenv").config(); // optional for local dev

// Prefer Functions config (set with firebase functions:config:set)
const VAPID_PUBLIC = (functions.config && functions.config().push && functions.config().push.vapid_public) || process.env.VAPID_PUBLIC;
const VAPID_PRIVATE = (functions.config && functions.config().push && functions.config().push.vapid_private) || process.env.VAPID_PRIVATE;

const MAX_TIMEOUT = 2_147_483_000;
const subscriptions = new Map();
const scheduledJobs = new Map();

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails("mailto:you@example.com", VAPID_PUBLIC, VAPID_PRIVATE);
} else {
  console.warn("VAPID keys not set in functions config or .env. Set them with `firebase functions:config:set push.vapid_public=... push.vapid_private=...`");
}

const app = express();
app.use(cors({ origin: true }));
app.use(bodyParser.json());

function scheduleSendForSubscription(endpoint, sub, key, whenMs, payloadObj) {
  // compute remaining delay
  const now = Date.now();
  const remaining = Math.max(0, whenMs - now);

  // If the remaining delay is larger than the safe max, set a bridging timer
  if (remaining > MAX_TIMEOUT) {
    // schedule to try again after MAX_TIMEOUT
    const timeoutId = setTimeout(() => {
      // re-enter and schedule remaining time
      scheduleSendForSubscription(endpoint, sub, key, whenMs, payloadObj);
    }, MAX_TIMEOUT);

    const rec = { key, whenMs, timeoutId };
    const arr = scheduledJobs.get(endpoint) || [];
    arr.push(rec);
    scheduledJobs.set(endpoint, arr);
    return rec;
  }

  // Normal scheduling path: set a single timeout that will fire the push
  const timeoutId = setTimeout(async () => {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payloadObj));
      console.log("sent scheduled push", key);
    } catch (err) {
      console.error("scheduled send failed", key, err && err.stack ? err.stack : err);
    } finally {
      // cleanup one-shot job record
      const arr = scheduledJobs.get(endpoint) || [];
      scheduledJobs.set(endpoint, arr.filter(r => r.key !== key));
    }
  }, remaining);

  const rec = { key, whenMs, timeoutId };
  const arr = scheduledJobs.get(endpoint) || [];
  arr.push(rec);
  scheduledJobs.set(endpoint, arr);
  return rec;
}

app.get("/config/push-public-key", (req, res) => {
  if (!VAPID_PUBLIC) return res.status(500).json({ error: "vapid key not configured" });
  res.json({ publicKey: VAPID_PUBLIC });
});

app.post("/api/subscribe", (req, res) => {
  const sub = req.body.subscription;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: "bad subscription" });
  subscriptions.set(sub.endpoint, sub);
  console.log("new sub:", sub.endpoint, "count:", subscriptions.size);
  return res.json({ ok: true });
});

app.post("/api/unsubscribe", (req, res) => {
  const { endpoint } = req.body || {};
  if (!endpoint) return res.status(400).json({ error: "missing endpoint" });
  subscriptions.delete(endpoint);
  scheduledJobs.delete(endpoint);
  console.log("unsubscribed:", endpoint, "remaining:", subscriptions.size);
  return res.json({ ok: true });
});

app.post("/notify-test", async (req, res) => {
  try {
    if (!subscriptions.size) return res.status(400).json({ error: "No subscriptions" });
    const payload = JSON.stringify({ title: "Test push", body: "If you see this, your push setup is working!" });
    const results = [];
    for (const sub of subscriptions.values()) {
      try {
        await webpush.sendNotification(sub, payload);
        results.push({ endpoint: sub.endpoint, ok: true });
      } catch (err) {
        console.error("notify-test error", err);
        results.push({ endpoint: sub.endpoint, err: String(err) });
      }
    }
    res.json({ results, count: subscriptions.size });
  } catch (err) {
    console.error("notify-test crashed", err);
    res.status(500).json({ error: "failed" });
  }
});

// dev helper: send an immediate payload to all subs
app.post("/api/push/send", async (req, res) => {
  const payload = req.body.payload || { title: "Test", body: "Hello" };
  const results = [];
  for (const sub of subscriptions.values()) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      results.push({ endpoint: sub.endpoint, ok: true });
    } catch (err) {
      results.push({ endpoint: sub.endpoint, err: String(err) });
    }
  }
  res.json({ results });
});

app.post("/api/schedule", (req, res) => {
  try {
    const { endpoint, schedules } = req.body;
    if (!endpoint || !Array.isArray(schedules)) return res.status(400).json({ error: "bad payload" });
    const sub = subscriptions.get(endpoint);
    if (!sub) return res.status(404).json({ error: "subscription not found on server" });

    let scheduled = 0;
    for (const s of schedules) {
      if (!s.key || typeof s.whenMs !== "number" || !s.payload) continue;
      if (Number(s.whenMs) <= Date.now()) continue;
      scheduleSendForSubscription(endpoint, sub, s.key, Number(s.whenMs), s.payload);
      scheduled++;
    }
    return res.json({ ok: true, scheduled });
  } catch (err) {
    console.error("/api/schedule error", err);
    return res.status(500).json({ error: "failed" });
  }
});

app.post("/api/schedule/cancel", (req, res) => {
  try {
    const { endpoint, key } = req.body;
    if (!endpoint || !key) return res.status(400).json({ error: "bad payload" });
    const arr = scheduledJobs.get(endpoint) || [];
    const rec = arr.find(r => r.key === key);
    if (!rec) return res.status(404).json({ error: "not found" });
    try {
      clearTimeout(rec.timeoutId);
    } catch (e) {
      // swallow any clearTimeout errors
    }
    scheduledJobs.set(endpoint, arr.filter(r => r.key !== key));
    return res.json({ ok: true });
  } catch (err) {
    console.error("/api/schedule/cancel error", err);
    return res.status(500).json({ error: "failed" });
  }
});

/* Export Express app as Cloud Function */
exports.pushServer = functions.https.onRequest(app);
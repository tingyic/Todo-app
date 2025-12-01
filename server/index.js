require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const webpush = require("web-push");

const VAPID_PUBLIC = process.env.VAPID_PUBLIC;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE;
if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error("Set VAPID_PUBLIC and VAPID_PRIVATE in env");
  process.exit(1);
}

webpush.setVapidDetails("mailto:you@example.com", VAPID_PUBLIC, VAPID_PRIVATE);

const app = express();
app.use(cors());
app.use(bodyParser.json());

const subscriptions = new Map();

app.get("/", (req, res) => res.send("todo-push server ok"));

app.get("/config/push-public-key", (req, res) => {
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
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: "missing endpoint" });

    const existed = subscriptions.delete(endpoint);
    scheduledJobs.delete(endpoint);
    console.log("unsub:", endpoint, "removed:", !!existed, "subs now:", subscriptions.size);

    return res.json({ ok: true, removed: !!existed });
  } catch (err) {
    console.error("/api/unsubscribe error", err);
    return res.status(500).json({ error: "failed" });
  }
});

app.post("/notify-test", async (req, res) => {
  try {
    if (!subscriptions.size) {
      return res.status(400).json({ error: "No subscriptions" });
    }

    const payload = JSON.stringify({
      title: "Test push",
      body: "If you see this, your push setup is working!",
    });

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


// dev helper: send a payload to all subs (for testing)
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

app.listen(process.env.PORT || 4000, () => console.log("Push server running"));

const scheduledJobs = new Map(); // key: subscription endpoint -> [{ key, whenMs, timeoutId }]

function scheduleSendForSubscription(endpoint, sub, key, whenMs, payloadObj) {
  const delay = Math.max(0, whenMs - Date.now());
  const timeoutId = setTimeout(async () => {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payloadObj));
      console.log("sent scheduled push", key);
    } catch (err) {
      console.error("scheduled send failed", key, err && err.stack ? err.stack : err);
    }
    // cleanup one-shot job record
    const arr = scheduledJobs.get(endpoint) || [];
    scheduledJobs.set(endpoint, arr.filter(r => r.key !== key));
  }, delay);

  const rec = { key, whenMs, timeoutId };
  const arr = scheduledJobs.get(endpoint) || [];
  arr.push(rec);
  scheduledJobs.set(endpoint, arr);
  return rec;
}

app.post("/api/schedule", (req, res) => {
  try {
    const { endpoint, schedules } = req.body;
    if (!endpoint || !Array.isArray(schedules)) {
      return res.status(400).json({ error: "bad payload" });
    }
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
    clearTimeout(rec.timeoutId);
    scheduledJobs.set(endpoint, arr.filter(r => r.key !== key));
    return res.json({ ok: true });
  } catch (err) {
    console.error("/api/schedule/cancel error", err);
    return res.status(500).json({ error: "failed" });
  }
});

require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const webpush = require('web-push');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

app.use(express.json());
// QUESTA RIGA SERVE PER MOSTRARE LA TUA PAGINA IN PUBLIC
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/push/public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

app.post('/api/push/subscribe', async (req, res) => {
  const { subscription, role } = req.body;
  try {
    const subRes = await pool.query(
      'INSERT INTO push_subscriptions (endpoint, p256dh, auth) VALUES ($1, $2, $3) ON CONFLICT (endpoint) DO UPDATE SET endpoint = EXCLUDED.endpoint RETURNING id',
      [subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]
    );
    const subId = subRes.rows[0].id;
    await pool.query(
      'INSERT INTO owner_device_vehicle_roles (subscription_id, role, target_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [subId, role || 'owner', 'all']
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore iscrizione' });
  }
});

app.post('/submit-report', async (req, res) => {
  const { poi_id, poi_name, issue_type } = req.body;
  try {
    await pool.query('INSERT INTO reports (poi_id, issue_type) VALUES ($1, $2)', [poi_id, issue_type]);
    const subs = await pool.query('SELECT s.* FROM push_subscriptions s JOIN owner_device_vehicle_roles r ON s.id = r.subscription_id WHERE r.role = $1', ['owner']);
    
    const payload = JSON.stringify({
      title: '⚠️ NUOVA SEGNALAZIONE',
      body: `${poi_name}: ${issue_type}`,
      url: '/admin/reports'
    });

    subs.rows.forEach(sub => {
      const pushConfig = { endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } };
      webpush.sendNotification(pushConfig, payload).catch(err => console.error("Errore push:", err));
    });
    res.send('<h1>✅ Segnalazione inviata!</h1>');
  } catch (err) {
    res.status(500).send('Errore.');
  }
});

app.get('/report/:slug', async (req, res) => {
  const { slug } = req.params;
  const result = await pool.query('SELECT * FROM points_of_interest WHERE slug = $1', [slug]);
  if (result.rows.length === 0) return res.send('Non trovato');
  const poi = result.rows[0];
  res.send(`
    <div style="font-family:sans-serif; text-align:center; padding:20px; background:#f4f7f6; height:100vh;">
      <h2>Segnala per: ${poi.description}</h2>
      <form action="/submit-report" method="POST" style="background:white; padding:20px; border-radius:15px;">
        <input type="hidden" name="poi_id" value="${poi.id}">
        <input type="hidden" name="poi_name" value="${poi.description}">
        <select name="issue_type" style="padding:15px; width:100%; border-radius:10px; margin-bottom:20px;">
          <option>Pieno</option><option>Rotto</option><option>Sporco</option>
        </select>
        <button style="padding:15px; background:#ff3b30; color:white; width:100%; border:none; border-radius:10px; font-weight:bold;">INVIA SEGNALAZIONE</button>
      </form>
    </div>
  `);
});

app.listen(port, '0.0.0.0', () => console.log('Server pronto sulla porta ' + port));

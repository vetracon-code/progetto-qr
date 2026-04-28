require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Pagina iniziale
app.get('/', (req, res) => res.send('Sistema Segnalazioni QR Attivo!'));

// Visualizza il form di segnalazione
app.get('/report/:slug', async (req, res) => {
  const { slug } = req.params;
  try {
    const result = await pool.query('SELECT * FROM points_of_interest WHERE slug = $1', [slug]);
    if (result.rows.length === 0) return res.status(404).send('QR non trovato.');
    const poi = result.rows[0];

    res.send(`
      <div style="font-family:sans-serif; max-width:400px; margin:auto; text-align:center;">
        <h1>⚠️ Segnala Problema</h1>
        <p>Stai segnalando per: <strong>${poi.description}</strong></p>
        <form action="/submit-report" method="POST">
          <input type="hidden" name="poi_id" value="${poi.id}">
          <select name="issue_type" style="width:100%; padding:10px; margin-bottom:10px;">
            <option value="pieno">È pieno/intasato</option>
            <option value="rotto">È rotto/danneggiato</option>
            <option value="sporco">È molto sporco</option>
            <option value="altro">Altro problema</option>
          </select>
          <button type="submit" style="background:red; color:white; padding:15px; width:100%; border:none; border-radius:5px; font-weight:bold;">INVIA SEGNALAZIONE ANONIMA</button>
        </form>
      </div>
    `);
  } catch (err) { res.status(500).send('Errore DB'); }
});

// Riceve la segnalazione e la salva nel DB
app.post('/submit-report', async (req, res) => {
  const { poi_id, issue_type } = req.body;
  try {
    await pool.query('INSERT INTO reports (poi_id, issue_type) VALUES ($1, $2)', [poi_id, issue_type]);
    res.send('<h1>✅ Grazie!</h1><p>La tua segnalazione anonima è stata inviata ai responsabili.</p><a href="/">Torna alla home</a>');
  } catch (err) {
    console.error(err);
    res.status(500).send('Errore durante l invio');
  }
});

app.listen(port, () => console.log('Server aggiornato su port ' + port));

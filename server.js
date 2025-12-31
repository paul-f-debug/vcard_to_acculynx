const express = require('express');
const multer = require('multer');
const vcard = require('vcard-parser');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(cookieParser());

// This line tells Express to automatically serve any file inside the 'public' folder
// For example: your-app.onrender.com/index.html
app.use(express.static(path.join(__dirname, 'public')));

// --- ACCULYNX V2 HELPERS ---

async function getAccessToken() {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', process.env.ACCULYNX_CLIENT_ID);
    params.append('client_secret', process.env.ACCULYNX_CLIENT_SECRET);

    const response = await axios.post('https://identity.acculynx.com/connect/token', params);
    return response.data.access_token;
}

// --- ROUTES ---

// Login check
app.post('/api/login', (req, res) => {
    if (req.body.password === process.env.SHARED_APP_PASSWORD) {
        res.cookie('auth', 'true', { httpOnly: true });
        return res.sendStatus(200);
    }
    res.status(401).send('Invalid Password');
});

// Upload and Sync
app.post('/api/upload', upload.single('vcfFile'), async (req, res) => {
    try {
        const rawData = req.file.buffer.toString();
        const parsed = vcard.parse(rawData);
        const email = parsed.email ? parsed.email[0].value : null;

        if (!email) return res.status(400).send("No email found in vCard.");

        const token = await getAccessToken();
        const headers = { 'Authorization': `Bearer ${token}` };

        // Auto-fetch "General" type ID
        const typesRes = await axios.get('https://api.acculynx.com/v2/contacts/types', { headers });
        const type = typesRes.data.find(t => t.name.toLowerCase().includes('general'));
        if (!type) return res.status(500).send("Could not find 'General' contact type.");

        // Create Contact
        await axios.post('https://api.acculynx.com/v2/contacts', {
            firstName: parsed.n[0].value[1] || "New",
            lastName: parsed.n[0].value[0] || "Contact",
            typeId: type.contactTypeId,
            emails: [{ address: email, isPrimary: true }]
        }, { headers });

        res.send("Successfully uploaded to AccuLynx!");
    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).send("Sync failed. Check logs.");
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

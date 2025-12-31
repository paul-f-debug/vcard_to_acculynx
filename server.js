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
app.use(express.static(path.join(__dirname, 'public')));

// --- THE ROBUST AUTHENTICATION FIX ---

async function getAccessToken() {
    try {
        // Using the formal object instead of a manual string
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('client_id', process.env.ACCULYNX_CLIENT_ID);
        params.append('client_secret', process.env.ACCULYNX_CLIENT_SECRET);

        const response = await axios.post(
            'https://identity.acculynx.com/connect/token',
            params, // Axios handles the string conversion and headers automatically here
            {
                headers: { 
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        return response.data.access_token;
    } catch (err) {
        // This will now log the EXACT response from AccuLynx
        console.error('AUTH FAILED:', err.response ? err.response.data : err.message);
        throw err;
    }
}

// --- ROUTES ---

app.post('/api/login', (req, res) => {
    if (req.body.password === process.env.SHARED_APP_PASSWORD) {
        res.cookie('auth', 'true', { httpOnly: true });
        return res.sendStatus(200);
    }
    res.status(401).send('Invalid Password');
});

app.post('/api/upload', upload.single('vcfFile'), async (req, res) => {
    try {
        const rawData = req.file.buffer.toString();
        const parsed = vcard.parse(rawData);
        const email = parsed.email ? parsed.email[0].value : null;

        if (!email) return res.status(400).send("No email found in this vCard.");

        const token = await getAccessToken();
        const headers = { 'Authorization': `Bearer ${token}` };

        const search = await axios.get(`https://api.acculynx.com/v2/leads?email=${email}`, { headers });
        if (search.data.totalCount > 0) {
            return res.status(409).send("Duplicate: This contact is already in AccuLynx.");
        }

        await axios.post('https://api.acculynx.com/v2/contacts', {
            firstName: parsed.n[0].value[1] || "New",
            lastName: parsed.n[0].value[0] || "Contact",
            typeId: process.env.ACCULYNX_DEFAULT_CONTACT_TYPE_ID, 
            emails: [{ address: email, isPrimary: true }]
        }, { headers });

        res.send("Successfully uploaded to AccuLynx!");

    } catch (err) {
        console.error('SYNC ERROR DETAILS:', err.response ? err.response.data : err.message);
        res.status(500).send("Sync failed. Please check your Render logs.");
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

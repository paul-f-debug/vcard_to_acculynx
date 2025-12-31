const express = require('express');
const multer = require('multer');
const vcard = require('vcard-parser');
const axios = require('axios');
const qs = require('qs'); // Required for v2 OAuth form formatting
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// --- ACCULYNX V2 AUTHENTICATION ---

async function getAccessToken() {
    // Formatting data as x-www-form-urlencoded to fix 'unsupported_grant_type'
    const data = qs.stringify({
        grant_type: 'client_credentials',
        client_id: process.env.ACCULYNX_CLIENT_ID,
        client_secret: process.env.ACCULYNX_CLIENT_SECRET
    });

    const config = {
        method: 'post',
        url: 'https://identity.acculynx.com/connect/token',
        headers: { 
            'Content-Type': 'application/x-www-form-urlencoded' 
        },
        data: data
    };

    const response = await axios(config);
    return response.data.access_token;
}

// --- ACCULYNX V2 HELPERS ---

async function getGeneralContactTypeId(headers) {
    const response = await axios.get('https://api.acculynx.com/v2/contacts/types', { headers });
    // Searches for 'General' in your specific contact type list
    const type = response.data.find(t => t.name.toLowerCase().includes('general'));
    return type ? type.contactTypeId : null;
}

// --- ROUTES ---

// Simple password check for team access
app.post('/api/login', (req, res) => {
    if (req.body.password === process.env.SHARED_APP_PASSWORD) {
        res.cookie('auth', 'true', { httpOnly: true });
        return res.sendStatus(200);
    }
    res.status(401).send('Invalid Password');
});

// Main sync route
app.post('/api/upload', upload.single('vcfFile'), async (req, res) => {
    try {
        const rawData = req.file.buffer.toString();
        const parsed = vcard.parse(rawData);
        const email = parsed.email ? parsed.email[0].value : null;

        if (!email) return res.status(400).send("No email found in this vCard.");

        // Step 1: Get v2 Token
        const token = await getAccessToken();
        const headers = { 'Authorization': `Bearer ${token}` };

        // Step 2: Duplicate Check (Search by email)
        const search = await axios.get(`https://api.acculynx.com/v2/leads?email=${email}`, { headers });
        if (search.data.totalCount > 0) {
            return res.status(409).send("Duplicate: Contact already exists in AccuLynx.");
        }

        // Step 3: Find "General" Type ID automatically
        const typeId = await getGeneralContactTypeId(headers);
        if (!typeId) return res.status(500).send("Could not find 'General' contact type in your account.");

        // Step 4: Create Contact in AccuLynx
        await axios.post('https://api.acculynx.com/v2/contacts', {
            firstName: parsed.n[0].value[1] || "New",
            lastName: parsed.n[0].value[0] || "Contact",
            typeId: typeId,
            emails: [{ address: email, isPrimary: true }]
        }, { headers });

        res.send("Successfully uploaded to AccuLynx!");

    } catch (err) {
        // Log detailed error for Render troubleshooting
        console.error('Sync Error:', err.response ? err.response.data : err.message);
        res.status(500).send("Sync failed. Check your API credentials and Render logs.");
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

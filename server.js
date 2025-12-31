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
        
        // Extracting Data
        const firstName = parsed.n ? parsed.n[0].value[1] : "New";
        const lastName = parsed.n ? parsed.n[0].value[0] : "Contact";
        const email = parsed.email ? parsed.email[0].value : null;

        if (!email) return res.status(400).send("No email found in this vCard.");

        // UPDATED HEADERS: Using the API Key correctly
        const headers = { 
            'Authorization': `Bearer ${process.env.ACCULYNX_API_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        // 1. Duplicate Check
        console.log(`Checking for existing email: ${email}`);
        const search = await axios.get(`https://api.acculynx.com/v2/leads?email=${email}`, { headers });
        
        if (search.data && search.data.totalCount > 0) {
            return res.status(409).send("Duplicate: This contact is already in AccuLynx.");
        }

        // 2. Create Contact using your GUID
        console.log("Creating contact in AccuLynx...");
        await axios.post('https://api.acculynx.com/v2/contacts', {
            firstName: firstName,
            lastName: lastName,
            typeId: process.env.ACCULYNX_DEFAULT_CONTACT_TYPE_ID, 
            emails: [{ address: email, isPrimary: true }]
        }, { headers });

        res.send("Successfully uploaded to AccuLynx!");

    } catch (err) {
        // This will now capture the specific reason AccuLynx is saying "no"
        const errorData = err.response ? JSON.stringify(err.response.data) : err.message;
        console.error('Sync Error Details:', errorData);
        res.status(500).send(`Sync failed: ${errorData}`);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

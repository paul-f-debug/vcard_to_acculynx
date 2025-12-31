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
        
        // Extraction for Betty Collins file
        const nameData = parsed.n ? parsed.n[0].value : [];
        const lastName = nameData[0] || "Contact";
        const firstName = nameData[1] || "New";
        const email = parsed.email ? parsed.email[0].value : null;

        if (!email) return res.status(400).send("Email required for this strict test.");

        const headers = { 
            'Authorization': `Bearer ${process.env.ACCULYNX_API_KEY}`,
            'Content-Type': 'application/json'
        };

        // 1. DUPLICATE CHECK
        console.log(`Checking AccuLynx for: ${email}`);
        const search = await axios.get(`https://api.acculynx.com/v2/leads?email=${email}`, { headers });
        
        if (search.data && search.data.totalCount > 0) {
            return res.status(409).send("This contact is already in AccuLynx.");
        }

        // 2. CREATE CONTACT
        console.log("Sending contact data to AccuLynx...");
        await axios.post('https://api.acculynx.com/v2/contacts', {
            firstName: firstName,
            lastName: lastName,
            typeId: process.env.ACCULYNX_DEFAULT_CONTACT_TYPE_ID, 
            emails: [{ address: email, isPrimary: true }]
        }, { headers });

        res.send("Successfully uploaded to AccuLynx!");

    } catch (err) {
        // Log the full error to Render so we can see why it's failing
        const errorDetail = err.response ? JSON.stringify(err.response.data) : err.message;
        console.error('CRITICAL SYNC ERROR:', errorDetail);
        res.status(500).send(`Sync failed: ${errorDetail}`);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

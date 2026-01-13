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

// --- HARD-CODED LOGIN FOR TESTING ---
app.post('/api/login', (req, res) => {
    console.log("Login attempt received...");
    // We are temporarily forcing the password to be '3m' inside the code
    if (req.body.password === "3m") {
        res.cookie('auth', 'true', { httpOnly: true });
        return res.sendStatus(200);
    }
    res.status(401).send('Incorrect password.');
});

// --- STABLE BETTY COLLINS SYNC ---
app.post('/api/upload', upload.single('vcfFile'), async (req, res) => {
    try {
        const rawData = req.file.buffer.toString();
        const parsed = vcard.parse(rawData);
        
        const nameData = parsed.n ? parsed.n[0].value : [];
        const lastName = nameData[0] || "Contact";
        const firstName = nameData[1] || "New";
        const email = parsed.email ? parsed.email[0].value : null;

        // Use the API key from your Render dashboard
        const headers = { 
            'Authorization': `Bearer ${process.env.ACCULYNX_API_KEY.trim()}`,
            'Content-Type': 'application/json'
        };

        const contactData = {
            firstName: firstName,
            lastName: lastName,
            typeId: process.env.ACCULYNX_DEFAULT_CONTACT_TYPE_ID, 
            emails: email ? [{ address: email, isPrimary: true }] : []
        };

        const response = await axios.post('https://api.acculynx.com/v2/contacts', contactData, { headers });
        res.send(`Success! Contact created with ID: ${response.data.contactId}`);

    } catch (err) {
        const errorDetail = err.response ? JSON.stringify(err.response.data) : err.message;
        console.error('SYNC ERROR:', errorDetail);
        res.status(500).send(`Sync failed: ${errorDetail}`);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

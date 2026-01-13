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

// Hardcoded for stability
app.post('/api/login', (req, res) => {
    if (req.body.password === "3m") {
        res.cookie('auth', 'true', { httpOnly: true });
        return res.sendStatus(200);
    }
    res.status(401).send('Incorrect password.');
});

app.post('/api/upload', upload.single('vcfFile'), async (req, res) => {
    try {
        const rawData = req.file.buffer.toString();
        const parsed = vcard.parse(rawData);
        
        const nameData = parsed.n ? parsed.n[0].value : [];
        const lastName = nameData[0] || "Contact";
        const firstName = nameData[1] || "New";
        const email = parsed.email ? parsed.email[0].value : null;

        // Clean API Key and verify endpoint
        const apiKey = process.env.ACCULYNX_API_KEY.trim();
        const contactTypeId = process.env.ACCULYNX_DEFAULT_CONTACT_TYPE_ID.trim();

        const headers = { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        const contactData = {
            firstName: firstName,
            lastName: lastName,
            typeId: contactTypeId,
            emails: email ? [{ address: email, isPrimary: true }] : []
        };

        // UPDATED URL: Using the explicit v2 path
        const response = await axios.post('https://api.acculynx.com/api/v2/contacts', contactData, { headers });

        res.send(`Success! Contact created with ID: ${response.data.contactId}`);

    } catch (err) {
        let detailedError = "Unknown Error";
        if (err.response) {
            // Detailed diagnostic to catch why the 404 is happening
            detailedError = `AccuLynx Error (${err.response.status}): ${JSON.stringify(err.response.data)}`;
        } else {
            detailedError = err.message;
        }
        res.status(500).send(`Sync Failed. Diagnostic Info: ${detailedError}`);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

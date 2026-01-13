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

// 1. STABLE PASSWORD SYSTEM
app.post('/api/login', (req, res) => {
    if (req.body.password === "3m") {
        res.cookie('auth', 'true', { httpOnly: true });
        return res.sendStatus(200);
    }
    res.status(401).send('Incorrect password.');
});

// 2. GREEDY DATA SYNC LOGIC
app.post('/api/upload', upload.single('vcfFile'), async (req, res) => {
    try {
        const rawData = req.file.buffer.toString();
        const parsed = vcard.parse(rawData);
        
        // --- DATA EXTRACTION ---
        const nameData = parsed.n ? parsed.n[0].value : [];
        const lastName = nameData[0] || "";
        const firstName = nameData[1] || "New Contact";
        
        // Google often puts extra info in 'Note' or 'Org' (Organization)
        const company = parsed.org ? parsed.org[0].value : "";
        const googleNotes = parsed.note ? parsed.note[0].value : "";
        
        // Loop through all emails and phone numbers
        const emailAddresses = (parsed.email || []).map((e, i) => ({
            address: e.value,
            isPrimary: i === 0
        }));

        const phoneNumbers = (parsed.tel || []).map((p, i) => ({
            number: p.value,
            isPrimary: i === 0
        }));

        // --- AUTH & CONFIG ---
        const apiKey = process.env.ACCULYNX_API_KEY.trim();
        const contactTypeId = process.env.ACCULYNX_DEFAULT_CONTACT_TYPE_ID.trim();

        const headers = { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        // --- ACCULYNX V2 PAYLOAD ---
        const contactData = {
            firstName: firstName,
            lastName: lastName,
            companyName: company,
            contactTypeIds: [contactTypeId], // FIX: Plural array format required
            emailAddresses: emailAddresses,
            phoneNumbers: phoneNumbers,
            notes: googleNotes // Syncs the Google "Notes" field directly
        };

        // POST request to the official v2 Contacts endpoint
        const response = await axios.post('https://api.acculynx.com/api/v2/contacts', contactData, { headers });

        res.send(`Success! Contact created: ${firstName} ${lastName}`);

    } catch (err) {
        let detailedError = "Sync Failed.";
        if (err.response) {
            detailedError = `AccuLynx Error (${err.response.status}): ${JSON.stringify(err.response.data)}`;
        } else {
            detailedError = err.message;
        }
        console.error('SERVER LOG:', detailedError);
        res.status(500).send(`Sync Failed. Diagnostic Info: ${detailedError}`);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

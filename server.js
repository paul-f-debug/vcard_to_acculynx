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

// Stable login check
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
        
        // 1. EXTRACT CORE DATA
        const nameData = parsed.n ? parsed.n[0].value : [];
        const lastName = nameData[0] || "";
        const firstName = nameData[1] || "New Contact";
        
        // Extract company/organization
        const company = parsed.org ? parsed.org[0].value : "";
        
        // Extract multiple emails and phones if they exist
        const emails = (parsed.email || []).map((e, i) => ({ address: e.value, isPrimary: i === 0 }));
        const phones = (parsed.tel || []).map((p, i) => ({ number: p.value, isPrimary: i === 0 }));

        const apiKey = process.env.ACCULYNX_API_KEY.trim();
        const contactTypeId = process.env.ACCULYNX_DEFAULT_CONTACT_TYPE_ID.trim();

        const headers = { 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        // 2. CONSTRUCT PAYLOAD
        const contactData = {
            firstName: firstName,
            lastName: lastName,
            companyName: company,
            contactTypeIds: [contactTypeId], // Required list format
            emailAddresses: emails,
            phoneNumbers: phones
        };

        const response = await axios.post('https://api.acculynx.com/api/v2/contacts', contactData, { headers });
        res.send(`Success! Contact created: ${firstName} ${lastName}`);

    } catch (err) {
        let detailedError = err.response ? JSON.stringify(err.response.data) : err.message;
        res.status(500).send(`Sync Failed. Diagnostic Info: ${detailedError}`);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

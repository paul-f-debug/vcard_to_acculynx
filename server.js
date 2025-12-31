const express = require('express');
const multer = require('multer');
const vcard = require('vcard-parser');
const axios = require('axios');
const upload = multer({ storage: multer.memoryStorage() });
const app = express();

app.use(express.static('public')); // For your HTML file

// V-CARD UPLOAD & SYNC ROUTE
app.post('/api/upload-vcard', upload.single('vcfFile'), async (req, res) => {
    try {
        // 1. Parse the V-Card
        const stringData = req.file.buffer.toString();
        const card = vcard.parse(stringData);
        
        const firstName = card.n[0].value[1];
        const lastName = card.n[0].value[0];
        const email = card.email ? card.email[0].value : null;

        if (!email) return res.status(400).send('No email found in V-Card');

        // 2. AccuLynx Duplicate Check
        const ACC_URL = 'https://api.acculynx.com/v1/leads';
        const headers = { 'Authorization': `Bearer ${process.env.ACCULYNX_API_KEY}` };

        const check = await axios.get(`${ACC_URL}?emailAddress=${email}`, { headers });
        
        if (check.data.totalResults > 0) {
            return res.status(409).send(`Duplicate found: ${firstName} ${lastName} already exists.`);
        }

        // 3. Create General Contact in AccuLynx
        await axios.post('https://api.acculynx.com/v1/contacts', {
            firstName,
            lastName,
            contactTypeId: 'General', // Replace with your specific ID if known
            emailAddresses: [{ address: email, type: 'Work' }]
        }, { headers });

        res.send(`Success! ${firstName} ${lastName} added to AccuLynx.`);

    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error processing V-Card');
    }
});

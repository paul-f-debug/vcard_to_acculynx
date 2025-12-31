const express = require('express');
const multer = require('multer');
const vcard = require('vcard-parser');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/upload', upload.single('vcfFile'), async (req, res) => {
    try {
        console.log("Starting New Sync Attempt...");
        const rawData = req.file.buffer.toString();
        const parsed = vcard.parse(rawData);
        
        // Extracting basic info from vCard
        const nameData = parsed.n ? parsed.n[0].value : [];
        const lastName = nameData[0] || "Contact";
        const firstName = nameData[1] || "New";
        const email = parsed.email ? parsed.email[0].value : null;

        // Using the API Key from your Render Environment
        const headers = { 
            'Authorization': `Bearer ${process.env.ACCULYNX_API_KEY.trim()}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        const contactData = {
            firstName: firstName,
            lastName: lastName,
            typeId: process.env.ACCULYNX_DEFAULT_CONTACT_TYPE_ID,
            emails: email ? [{ address: email, isPrimary: true }] : []
        };

        // Posting directly to the v2 Contacts endpoint
        const response = await axios.post('https://api.acculynx.com/v2/contacts', contactData, { headers });

        console.log("SYNC SUCCESSFUL!");
        res.send(`Success! Contact created with ID: ${response.data.contactId}`);

    } catch (err) {
        // This ensures the error is never blank in the logs again
        const errorDetail = err.response ? JSON.stringify(err.response.data) : err.message;
        console.error('SYNC ERROR DETAILS:', errorDetail);
        res.status(500).send(`Sync Failed: ${errorDetail}`);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

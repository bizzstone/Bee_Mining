const { fetch } = require('undici');

async function debug() {
    try {
        console.log("Melakukan fetch ke:", "https://mainnet.ackinacki.org");
        const res = await fetch("https://mainnet.ackinacki.org", {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });
        console.log("Status:", res.status);
    } catch (err) {
        console.error("DETAIL ERROR:", err);
        console.error("CAUSE:", err.cause);
    }
}
debug();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const PROXY_FILE_PATH = path.join(__dirname, 'proxies.txt');

// Fungsi pengecekan
async function checkProxy(proxy) {
    try {
        const [host, port] = proxy.split(':');
        await axios.get('https://mainnet.ackinacki.org', {
            proxy: { host, port: parseInt(port) },
            timeout: 5000
        });
        return true;
    } catch (e) {
        return false;
    }
}

async function startMiningScanner() {
    const url = "https://api.proxyscrape.com/v2/?request=getproxies&protocol=HTTP&timeout=10000&country=all&ssl=all&anonymity=all";
    
    console.log("Mengambil data...");
    const res = await axios.get(url);
    const proxies = res.data.split(/\r?\n/).map(p => p.trim()).filter(p => p !== "");
    console.log(`Total: ${proxies.length} proxy dimuat.`);

    let alive = [];
    
    // Menggunakan loop tradisional untuk menghindari masalah scope
    for (let i = 0; i < proxies.length; i++) {
        const p = proxies[i];
        console.log(`Mengecek (${i+1}/${proxies.length}): ${p}...`);
        
        const isAlive = await checkProxy(p);
        
        if (isAlive) {
            alive.push(p);
            console.log(`✅ BERHASIL: ${p} (Total: ${alive.length})`);
            fs.writeFileSync(PROXY_FILE_PATH, alive.join('\n'), 'utf8');
            
            if (alive.length >= 20) {
                console.log("Target 20 tercapai!");
                process.exit(0); // Memaksa keluar setelah target 20
            }
        }
    }
    console.log("Selesai mencari, tidak mencapai 20.");
}

// Menjalankan dengan cara yang paling aman di Windows
startMiningScanner().then(() => {
    console.log("Proses berakhir secara normal.");
}).catch(err => {
    console.error("Terjadi fatal error:", err);
});
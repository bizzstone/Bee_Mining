const { loadBeeSdk } = require("./src/confirmMiningKeys");
const fs = require('fs');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Konfigurasi
const APP_ID = "0x0000000000000000000000000000000000000000000000000000000000000007";
const ENDPOINTS = ["https://mainnet.ackinacki.org"];

// Fungsi Utility
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Memuat daftar proxy dari file
function getProxyList() {
    try {
        const data = fs.readFileSync(path.join(__dirname, 'proxies.txt'), 'utf8');
        return data.split(/\r?\n/).map(p => p.trim()).filter(p => p !== "");
    } catch (e) {
        console.warn("Tidak ada proxy.txt ditemukan, menjalankan tanpa proxy.");
        return [];
    }
}

const proxyList = getProxyList();

function getRandomProxy() {
    if (proxyList.length === 0) return null;
    return proxyList[Math.floor(Math.random() * proxyList.length)];
}

class Account {
    constructor(WallName, minerAddress, publicKey, secretKey) {
        this.WallName = WallName;
        this.minerAddress = minerAddress;
        this.publicKey = publicKey;
        this.secretKey = secretKey;
        //this.proxy = getRandomProxy(); // Inisialisasi proxy pertama kali
        this.miner = null;
        this.resolveEpoch = null;
    }

    static loadFromFile(filePath) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return data.map(item => new Account(item.WallName, item.minerAddress, item.publicKey, item.secretKey));
    }
}

const credentialsPath = path.join(__dirname, 'user3.json');
const accounts = Account.loadFromFile(credentialsPath);

async function getReward(minerInstance) {
    try {
        if (minerInstance) await minerInstance.get_reward();
    } catch (e) {
        console.warn("Reward claim skipped:", e.message);
    }
}

async function startMining(acc) {
    let shouldSleep = false;
    // Mengambil proxy terbaru untuk sesi ini
    const PROXY_URL ="http://"+ getRandomProxy();
    const agent = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : null;
    
    console.log(` [${acc.WallName}] Menggunakan PROXY : ${PROXY_URL || 'NONE'}`);
    
    try {
        const sdk = await loadBeeSdk();
        acc.miner = await sdk.Miner.new(
            ENDPOINTS, 
            APP_ID, 
            acc.minerAddress, 
            acc.publicKey, 
            acc.secretKey,
            agent ? { agent } : {},
        );
        
        await sleep(3000);
        await getReward(acc.miner);
        await sleep(3000);

        const minerData = await acc.miner.get_miner_data();
        const totalTaps = Number(minerData.tap_sum);
        console.log(` [${acc.WallName}] Current Taps:`, totalTaps);

        if (totalTaps >= 7000) {
            console.log(` [${acc.WallName}] Taps >= 7000. Mempersiapkan jeda 2 jam.`);
            shouldSleep = true;
            return;
        }

        acc.miner.start(290000, (m) => {
            const blacklist = ["tap_computed", "Read miner events thread","Error"];
            if (!blacklist.some(term => m.includes(term))) {
                if(m.includes("Error")){
                  console.log(`[ERROR : ${acc.WallName}]`);
                }else{
                    console.log(`[${acc.WallName}] [Info]: ${m}`);
                    if (m.includes("miner_state_corrupted") && acc.resolveEpoch) {
                        acc.resolveEpoch();
                        acc.resolveEpoch = null;
                    }
                }

            }
        });

        await sleep(2000);
        console.log(` [${acc.WallName}] Mining started.`);

        for (let i = 1; i <= 70; i++) {
            await acc.miner.add_tap(1, 1);
            if (i % 25 === 0){
                await getReward(acc.miner);
                const data = await acc.miner.get_miner_data();
                console.log(` [${acc.WallName}] Total Taps:`, data.tap_sum);
            }
            await sleep(3800);
        }

        await Promise.race([
            new Promise((resolve) => { acc.resolveEpoch = resolve; }),
            sleep(120000).then(() => console.warn("Timeout epoch, melanjutkan..."))
        ]);

    } catch (e) {
        console.error(`Mining Error [${acc.WallName}]:`, e.message);
    } finally {
        if (acc.miner && typeof acc.miner.free === 'function') {
            try { acc.miner.free(); } catch(err) {}
        }
        acc.miner = null;

        // ROTASI PROXY: Ganti proxy setiap kali loop/rekursi
        if (proxyList.length > 0) {
            acc.proxy = getRandomProxy();
            console.log(` [${acc.WallName}] Proxy dirotasi ke: ${acc.proxy}`);
        }

        if (shouldSleep) {
            console.log(` [${acc.WallName}] Memulai jeda 2 jam...`);
            await sleep(7200000);
        } else {
            console.log(` [${acc.WallName}] Restarting cycle in 5 seconds...`);
            await sleep(5000);
        }
        
        startMining(acc); // Rekursi dengan proxy baru
    }
}

const startAll = async () => {
    for (const account of accounts) {
        console.log(`Memulai mining untuk akun: ${account.WallName}`);
        startMining(account);
        await sleep(5000);
    }
}

startAll();
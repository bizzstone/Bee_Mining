const { loadBeeSdk } = require("./src/confirmMiningKeys");
const fs = require('fs');
const path = require('path');

const APP_ID = "0x0000000000000000000000000000000000000000000000000000000000000007";
const ENDPOINTS = ["https://mainnet.ackinacki.org"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Account {
    constructor(WallName, minerAddress, publicKey, secretKey) {
        this.WallName = WallName;
        this.minerAddress = minerAddress;
        this.publicKey = publicKey;
        this.secretKey = secretKey;
        this.miner = null;
        this.resolveEpoch = null;
        this.canTap = true; // Dipindahkan ke sini
    }

    static loadFromFile(filePath) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return data.map(item => new Account(item.WallName, item.minerAddress, item.publicKey, item.secretKey));
    }
}

//const credentialsPath = path.join(__dirname, './Data/user0.json');
//const accounts = Account.loadFromFile(credentialsPath);
const batchId = process.argv[2] || '1';
const credentialsPath = path.join(__dirname, `./Data/batch${batchId}.json`);

console.log(`--- Menjalankan proses untuk Batch: ${batchId} ---`);

const accounts = Account.loadFromFile(credentialsPath);
async function getReward(minerInstance) {
    try {
        if (minerInstance) await minerInstance.get_reward();
    } catch (e) {
        console.warn(" [Reward] Skip:", e.message);
    }
}

async function miningCycle(acc) {
    try {
        const sdk = await loadBeeSdk();
        acc.miner = await sdk.Miner.new(ENDPOINTS, APP_ID, acc.minerAddress, acc.publicKey, acc.secretKey);
        
        await sleep(3000);
        
        const minerData = await acc.miner.get_miner_data();
        const totalTaps = Number(minerData.tap_sum);
        console.log(` [${acc.WallName}] Current Taps: ${totalTaps}`);

        if (totalTaps >= 12000) {
            console.log(` [${acc.WallName}] Limit reached. Cooldown 2 hours.`);
            await sleep(7200000);
            return;
        }

        acc.canTap = true;
        acc.miner.start(330000, (m) => {
            if (m.includes("submit_session_proof") || m.includes("submit_session_root")) {
                acc.canTap = false;
            }
            if (m.includes("miner_state_corrupted") && acc.resolveEpoch) {
                acc.resolveEpoch();
                acc.resolveEpoch = null;
            }
        });

        for (let i = 1; i <= 70; i++) {
            if (!acc.canTap) break;
            await acc.miner.add_tap(1, 1);
            if (i % 25 === 0) await getReward(acc.miner);
            await sleep(4300);
        }

        console.log(` [${acc.WallName}] Waiting for epoch...`);
        await Promise.race([
            new Promise((resolve) => { acc.resolveEpoch = resolve; }),
            sleep(120000)
        ]);

    } catch (e) {
        console.error(` [${acc.WallName}] Error:`, e.message);
    } finally {
        if (acc.miner) {
            try { acc.miner.free(); } catch(err) {}
            acc.miner = null;
        }
        await sleep(5000);
    }
}
async function startMining(acc) {
    let shouldSleep = false; // Flag untuk jeda 2 jam
    let cantap = false;
    try {
        const sdk = await loadBeeSdk();
        acc.miner = await sdk.Miner.new(
            ENDPOINTS, 
            APP_ID, 
            acc.minerAddress, 
            acc.publicKey, 
            acc.secretKey,
        );
        
        await sleep(2000);
        await getReward(acc.miner);
        await sleep(2000);

        // Pengecekan sebelum mining
        const minerData = await acc.miner.get_miner_data();
        const totalTaps = Number(minerData.tap_sum);
        console.log(` [${acc.WallName}] Current Taps:`, totalTaps);

        if (totalTaps >= 10000) {
            console.log(` [${acc.WallName}] Taps >= 7000. Mempersiapkan jeda 2 jam.`);
            shouldSleep = true;
            return; // Melompat ke blok finally
        }

        acc.miner.start(330000, (m) => {
            const blacklist = ["tap_computed", "Read miner events thread"];
            const whitelist = ["submit_session_proof", "submit_session_root", "session_accepted"];
            cantap = true ;
            if (!blacklist.some(term => m.includes(term))) {
                console.log(`[${acc.WallName}] [Info]: ${m}`);
                if (m.includes("miner_state_corrupted") && acc.resolveEpoch) {
                    acc.resolveEpoch();
                    acc.resolveEpoch = null;
                }
            }
            if (whitelist.some(term => m.includes(term))) {
                cantap = false ;
            }

        });

        await sleep(2000);
        console.log(` [${acc.WallName}] Mining started.`);

        for (let i = 1; i <= 70; i++) {
            if (!cantap) {
                break; // Keluar dari loop jika tidak bisa menambahkan tap
            }
            await acc.miner.add_tap(1, 1);
            if (i % 25 === 0){
                await getReward(acc.miner);
                const data = await acc.miner.get_miner_data();
                console.log(` [${acc.WallName}] Total Taps:`, data.tap_sum);
            }
            await sleep(4300);
        }

        console.log(` [${acc.WallName}] 70 Tap selesai. Menunggu sinyal epoch...`);
        await Promise.race([
            new Promise((resolve) => { acc.resolveEpoch = resolve; }),
            sleep(120000).then(() => console.warn("Timeout epoch, melanjutkan..."))
        ]);

    } catch (e) {
        console.error("Mining Error:", e.message);
    } finally {
        // Membersihkan instance
        if (acc.miner && typeof acc.miner.free === 'function') {
            try { acc.miner.free(); } catch(err) {}
        }
        acc.miner = null;

        // Logika jeda berdasarkan flag
        if (shouldSleep) {
            console.log(` [${acc.WallName}] Memulai jeda 2 jam...`);
            await sleep(7200000); 
        } else {
            console.log(` [${acc.WallName}] Restarting cycle in 5 seconds...`);
            await sleep(5000);
        }
        
        startMining(acc); // Rekursi
    }
}
// Main loop dengan async/await yang bersih
const startAll = async () => {


        for (const account of accounts) {
        console.log(`Memulai mining untuk akun: ${account.WallName}`);
        startMining(account);
        await sleep(5000);
    }
}

startAll();
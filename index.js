const fs = require('fs');
const readline = require('readline'); // Akses module readline
const BeeSDK = require('./SDK/bee_sdk.js'); 

const CREDENTIALS_FILE = 'credentials.json';
const APP_ID = "0x0000000000000000000000000000000000000000000000000000000000000007";
const ENDPOINTS = ["https://mainnet.ackinacki.org"];

// Perbaikan: Gunakan readline.createInterface
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startMining(authData) {
    console.log(`[${new Date().toLocaleTimeString()}] Memulai mining untuk: ${authData.walletName}`);
    
    try {
        const miner = await BeeSDK.Miner.new(
            ENDPOINTS, 
            APP_ID, 
            authData.minerAddress, 
            authData.publicKey, 
            authData.secretKey
        );

        await miner.get_reward();
        miner.start(290000, (m) => console.log(`[Callback] ${m}`));

        for (let i = 1; i <= 70; i++) {
            try {
                await miner.add_tap(1, 1);
                if (i % 25 === 0) await miner.get_reward();
            } catch (e) {
                console.error("Error tap:", e.message);
            }
            await sleep(3800);
        }
        miner.free();
    } catch (err) {
        console.error("Gagal saat mining:", err);
    }
}

function main() {
    if (fs.existsSync(CREDENTIALS_FILE)) {
        const data = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
        startMining(data[0]);
    } else {
        rl.question('Masukkan Wallet Name: ', async (walletName) => {
            try {
                const minerInfo = await BeeSDK.get_miner_address_by_wallet_name({
                    client_config: { network: { endpoints: ENDPOINTS } },
                    wallet_name: walletName,
                });
                const keys = await BeeSDK.gen_mining_keys(APP_ID);
                
                const authData = { 
                    minerAddress: minerInfo.miner_address || minerInfo, 
                    publicKey: keys.public, 
                    secretKey: keys.secret, 
                    walletName 
                };

                fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify([authData], null, 2));
                console.log("Credentials disimpan.");
                startMining(authData);
            } catch (err) {
                console.error("Gagal mendapatkan info wallet:", err.message);
            }
            rl.close();
        });
    }
}

main();
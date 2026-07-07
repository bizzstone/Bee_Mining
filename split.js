const fs = require('fs');
const accounts = JSON.parse(fs.readFileSync('./Data/user.json', 'utf8'));

const BATCH_SIZE = 5;
for (let i = 0; i < Math.ceil(accounts.length / BATCH_SIZE); i++) {
    const batch = accounts.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    fs.writeFileSync(`./Data/batch${i + 1}.json`, JSON.stringify(batch, null, 2));
    console.log(`Dibuat: batch${i + 1}.json berisi ${batch.length} akun`);
}
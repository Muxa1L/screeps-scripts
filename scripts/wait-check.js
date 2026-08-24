require('dotenv').config();
const { ScreepsHttpClient } = require('screeps-api');
const client = new ScreepsHttpClient({
  hostname: 'screeps.com', port: 443, protocol: 'https', path: '/',
  token: process.env.SCREEPS_TOKEN,
});
async function run() {
  // Проверка гипотезы 'просто подождать': есть ли пассивный приток энергии в спавн.
  await client.req('POST', '/api/user/console', { shard: 'shard3',
    expression: "var s=Game.rooms['W47N45'].find(FIND_MY_SPAWNS)[0];Memory._w1=s.energy+'@'+Game.time" });
  await new Promise(r => setTimeout(r, 60000));
  await client.req('POST', '/api/user/console', { shard: 'shard3',
    expression: "var s=Game.rooms['W47N45'].find(FIND_MY_SPAWNS)[0];Memory._w2=s.energy+'@'+Game.time+'|creeps='+Object.keys(Game.creeps).length" });
  await new Promise(r => setTimeout(r, 12000));
  const mem = await client.req('GET', '/api/user/memory', { shard: 'shard3' });
  const data = typeof mem === 'string' ? JSON.parse(mem) : mem;
  const parsed = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
  console.log('was:', parsed._w1);
  console.log('now:', parsed._w2);
}
run().catch(e => console.error(e.message));

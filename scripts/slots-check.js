require('dotenv').config();
const { ScreepsHttpClient } = require('screeps-api');
const client = new ScreepsHttpClient({
  hostname: 'screeps.com', port: 443, protocol: 'https', path: '/',
  token: process.env.SCREEPS_TOKEN,
});
async function run() {
  // Слоты обоих source + позиция контейнера относительно слотов source2.
  await client.req('POST', '/api/user/console', { shard: 'shard3',
    expression: "var ids=Object.keys(Memory.sources);var out=[];for(var i in ids){var s=Memory.sources[ids[i]];out.push('src@'+s.x+','+s.y+' slots='+JSON.stringify(s.slots.map(function(x){return x.x+','+x.y+':'+(x.claimedBy?'CL':'-')})))}Memory._b2=out.join(' || ')" });
  await new Promise(r => setTimeout(r, 12000));
  const mem = await client.req('GET', '/api/user/memory', { shard: 'shard3' });
  const data = typeof mem === 'string' ? JSON.parse(mem) : mem;
  const parsed = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
  console.log(parsed._b2);
}
run().catch(e => console.error(e.message));

require('dotenv').config();
const { ScreepsHttpClient } = require('screeps-api');
const client = new ScreepsHttpClient({
  hostname: 'screeps.com', port: 443, protocol: 'https', path: '/',
  token: process.env.SCREEPS_TOKEN,
});
async function run() {
  const res = await client.req('POST', '/api/user/console', { shard: 'shard3',
    expression:
      "var r=Game.rooms['W47N45'];var c=r.controller;var up=0,upW=0;" +
      "for(var n in Game.creeps){var cr=Game.creeps[n];if(cr.memory.role==='upgrader'&&cr.room.name==='W47N45'){up++;upW+=cr.getActiveBodyparts(WORK)}}" +
      "Memory._st='ctrl='+c.progress+'/'+c.progressTotal+'|upgraders='+up+'('+upW+'W)|storage='+(r.storage?r.storage.store.energy:'none')+'|ttd='+c.ticksToDowngrade" });
  await new Promise(r => setTimeout(r, 12000));
  const mem = await client.req('GET', '/api/user/memory', { shard: 'shard3' });
  const data = typeof mem === 'string' ? JSON.parse(mem) : mem;
  const parsed = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
  console.log(parsed._st);
}
run().catch(e => console.error(e.message));

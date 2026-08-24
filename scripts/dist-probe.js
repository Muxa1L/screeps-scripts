require('dotenv').config();
const { ScreepsHttpClient } = require('screeps-api');
const client = new ScreepsHttpClient({
  hostname: 'screeps.com', port: 443, protocol: 'https', path: '/',
  token: process.env.SCREEPS_TOKEN,
});
async function run() {
  // Один запрос: состояние дистрибьютора + ручные withdraw/moveTo пробы.
  await client.req('POST', '/api/user/console', { shard: 'shard3',
    expression: "var c=null;for(var n in Game.creeps){c=Game.creeps[n];break}var st=Game.rooms['W47N45'].storage;var w=c.withdraw(st,RESOURCE_ENERGY);var m=c.moveTo(st);Memory._z3='w='+w+'|m='+m+'|pos='+c.pos.x+','+c.pos.y+'|e='+c.store.energy+'|fatigue='+c.fatigue" });
  await new Promise(r => setTimeout(r, 12000));
  const mem = await client.req('GET', '/api/user/memory', { shard: 'shard3' });
  const data = typeof mem === 'string' ? JSON.parse(mem) : mem;
  const parsed = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
  console.log(parsed._z3);
}
run().catch(e => console.error(e.message));

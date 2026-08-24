global.MOVE='move'; global.WORK='work'; global.CARRY='carry'; global.ATTACK='attack';
global.HEAL='heal'; global.RANGED_ATTACK='ranged_attack'; global.TOUGH='tough';
global.CLAIM='claim'; global.RESOURCE_ENERGY='energy';
global.Memory = {};
global.Game = { time: 1000, rooms: {}, creeps: {}, getObjectById: function(){ return null; } };
const mocks = require('../tests/mocks/screeps.js');
mocks.resetGame();
const energyService = require('../src/services/energyService.js');
const creep = { name: 'U1', pos: { x: 25, y: 25, roomName: 'W1N1' }, room: null,
  body: [{type:'work',hits:100},{type:'carry',hits:100}],
  getActiveBodyparts: function(p){ return p==='work'?1:p==='carry'?1:0; },
  store: { energy: 10 }, memory: {} };
creep.room = { name: 'W1N1', controller: {}, find: function(t,o){
  if(t===2) return [{id:'src1',energy:3000,pos:{x:25,y:26,roomName:'W1N1'}}];
  return []; } };
creep.pos.findClosestByPath = function(list){ return list && list.length ? list[0] : null; };
const snap = { controller: { id: 'c1' }, sources: [{id:'src1', energy:3000,
  pos:{x:25,y:26,roomName:'W1N1'}}] };
const src = energyService.findEnergySource(creep, snap, { anchor: snap.controller, allowHarvest: true });
console.log('findEnergySource returned:', src ? src.id : 'NULL');

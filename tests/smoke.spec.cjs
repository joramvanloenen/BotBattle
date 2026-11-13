const {test,expect}=require('@playwright/test');
test('editor, live physics, localized destruction, and opponent mode',async ({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.__botbattleDebug,{timeout:30000});
 await expect(page.locator('#statParts')).toHaveText('8');
 await expect(page.locator('#game')).toBeVisible();
 await page.locator('[data-mode="test"]').click();
 await expect(page.locator('#stageTitle')).toContainText('TEST CHAMBER');
 const before=await page.evaluate(()=>{
  const {player,enemy,engine}=window.__botbattleDebug.state();
  const wheel=enemy.parts.find(p=>p.type==='wheel');
  return {wheelHP:wheel.hp,coreHP:enemy.core.hp,alive:enemy.alive,links:enemy.links.filter(l=>l.active).length,bodies:engine.world.bodies.length};
 });
 expect(before.wheelHP).toBeGreaterThan(1);
 expect(before.alive).toBe(true);
 await page.evaluate(()=>window.__botbattleDebug.damagePart('enemy','wheel',1000));
 const after=await page.evaluate(()=>{
  const {enemy,engine}=window.__botbattleDebug.state();
  const wheel=enemy.parts.find(p=>p.type==='wheel');
  return {wheelHP:wheel.hp,wheelDead:wheel.dead,coreHP:enemy.core.hp,alive:enemy.alive,links:enemy.links.filter(l=>l.active).length,wreckageExists:engine.world.bodies.includes(wheel.body)};
 });
 expect(after.wheelDead).toBe(true);
 expect(after.wheelHP).toBe(0);
 expect(after.coreHP).toBe(before.coreHP);
 expect(after.alive).toBe(true);
 expect(after.links).toBeLessThan(before.links);
 expect(after.wreckageExists).toBe(true);
 await page.evaluate(()=>window.__botbattleDebug.damagePart('enemy','core',10000));
 await expect(page.locator('#message')).toContainText('TARGET DESTROYED');
 await page.locator('[data-mode="battle"]').click();
 await expect(page.locator('#stageTitle')).toContainText('SCRAP ARENA');
 const npc=await page.evaluate(()=>{
  const {player,enemy}=window.__botbattleDebug.state();
  return {ai:enemy.ai,parts:enemy.parts.length,playerParts:player.parts.length,gun:enemy.parts.some(p=>p.type==='cannon')};
 });
 expect(npc).toEqual({ai:true,parts:9,playerParts:8,gun:true});
 expect(errors).toEqual([]);
});

test('the robot drives using wheel motors and fires real projectiles',async ({page})=>{
 await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.__botbattleDebug);
 await page.locator('[data-mode="test"]').click();
 // Shoot while the gun is intact, before driving into the training ground.
 // A late projectile count is not reliable: bullets can hit something and despawn.
 await page.keyboard.down('j');
 await page.waitForFunction(()=>window.__botbattleDebug.state().projectiles.length>0,{timeout:3000});
 const count=await page.evaluate(()=>window.__botbattleDebug.state().projectiles.length);
 await page.keyboard.up('j');
 expect(count).toBeGreaterThan(0);
 // Let the chassis settle onto the ground before driving.
 await page.waitForTimeout(900);
 const start=await page.evaluate(()=>window.__botbattleDebug.state().player.core.body.position.x);
 await page.keyboard.down('d');
 await page.waitForTimeout(1400);
 await page.keyboard.up('d');
 const finish=await page.evaluate(()=>window.__botbattleDebug.state().player.core.body.position.x);
 expect(finish-start).toBeGreaterThan(2);
});


test('build rotations carry through rigid joints and pivot mounts in both play modes',async ({page})=>{
 await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.__botbattleDebug);
 // Deliberately include 90°, negative 45°, and 60° rotations on
 // both rigid components and moving weapon/servo mounts.
 await page.evaluate(()=>{
  const design=window.__botbattleDebug.state().blueprint;
  design.splice(0,design.length,
   {id:1,type:'core',x:0,y:0,angle:0},
   {id:2,type:'beam',x:-70,y:0,angle:-Math.PI/4},
   {id:3,type:'armor',x:-125,y:0,angle:Math.PI/2},
   {id:4,type:'cannon',x:70,y:0,angle:Math.PI/3,bind:'primary'},
   {id:5,type:'servo',x:0,y:-70,angle:-Math.PI/3,bind:'utility'},
   {id:6,type:'thruster',x:0,y:70,angle:Math.PI/2,bind:'boost'});
 });
 const expected={beam:-Math.PI/4,armor:Math.PI/2,cannon:Math.PI/3,servo:-Math.PI/3,thruster:Math.PI/2};
 const measure=()=>page.evaluate(()=>{
  const {player}=window.__botbattleDebug.state();
  return Object.fromEntries(player.parts.filter(p=>p.type!=='core').map(p=>[
   p.type,Math.atan2(Math.sin(p.body.angle-player.core.body.angle),Math.cos(p.body.angle-player.core.body.angle))
  ]));
 });
 for(const mode of ['test','battle']){
  await page.locator('[data-mode="'+mode+'"]').click();
  const initial=await measure();
  for(const type of Object.keys(expected)){
   expect(Math.abs(Math.atan2(Math.sin(initial[type]-expected[type]),Math.cos(initial[type]-expected[type]))),
    mode+' / '+type+' should spawn with editor angle').toBeLessThan(.045);
  }
  // Give the engine time to settle its joints. The player has not aimed,
  // so turret and servo must not lose their deliberate design rotation.
  await page.evaluate(()=>{
   for(let i=0;i<35;i++)window.__botbattleDebug.step();
  });
  const settled=await measure();
  for(const type of Object.keys(expected)){
   expect(Math.abs(Math.atan2(Math.sin(settled[type]-expected[type]),Math.cos(settled[type]-expected[type]))),
    mode+' / '+type+' must retain its chassis-relative orientation').toBeLessThan(.42);
  }
 }
});

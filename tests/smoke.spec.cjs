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

import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {createArenaServer} from '../server.mjs';

async function arena(t,options={}){
  const server=createArenaServer({dataFile:null,trustProxy:'',requireHttps:false,...options});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  });
  const origin=`http://127.0.0.1:${server.address().port}`;
  async function request(route,data,status=200){
    const response=await fetch(origin+'/api/'+route,{
      ...(data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(data)}),
      signal:AbortSignal.timeout(5000)
    });
    assert.equal(response.status,status,route);
    assert.equal(response.headers.get('cache-control'),'no-store');
    return response.json();
  }
  const password=randomBytes(24).toString('base64url');
  const register=login=>request('register',{login,password});
  const online=async expected=>assert.deepEqual(await request('online'),{online:expected});
  return {request,register,online,password};
}

test('online counts unique authenticated people in lobby and battle, excluding bots',async t=>{
  const {request,register,online,password}=await arena(t);
  await online(0);
  const first=await register('online_first');
  await online(1);
  const second=await register('online_second');
  await online(2);
  const secondTab=await request('login',{login:'online_first',password});
  await online(2);
  await request('presence',{accountToken:first.accountToken});
  await request('presence',{accountToken:secondTab.accountToken});
  await online(2);
  const battle=await request('join',{accountToken:first.accountToken,mode:'train'});
  // Training creates three bots; the real account is already present in the lobby.
  await online(2);
  await request('leave',{token:battle.token});
  await online(2);
  await request('logout',{accountToken:first.accountToken});
  await online(2); // Another authenticated tab of this account is still present.
  await request('presence',{accountToken:first.accountToken},401);
  await request('logout',{accountToken:secondTab.accountToken});
  await online(1);
  await request('logout',{accountToken:second.accountToken});
  await online(0);
});

test('only a valid heartbeat restores an expired lobby presence',async t=>{
  const {request,register,online}=await arena(t,{presenceTimeoutMs:120});
  const account=await register('online_expiry');
  await online(1);
  await pause(180);
  await online(0);
  await request('presence',{accountToken:'invalid'},401);
  await online(0);
  assert.deepEqual(await request('presence',{accountToken:account.accountToken}),{online:1});
  await request('logout',{accountToken:account.accountToken});
  await request('presence',{accountToken:account.accountToken},401);
  await online(0);
});

test('live game sessions count when lobby presence expires and leaving restores lobby',async t=>{
  const {request,register,online}=await arena(t,{presenceTimeoutMs:120});
  const account=await register('online_battle');
  const battle=await request('join',{accountToken:account.accountToken,mode:'range'});
  await pause(180);
  await online(1);
  await request('leave',{token:battle.token});
  await online(1);
  await pause(180);
  await online(0);
  await request('profile',{accountToken:account.accountToken});
  await online(1);
});

test('heartbeat enforces same-origin before recording presence',async t=>{
  const server=createArenaServer({dataFile:null,trustProxy:'',requireHttps:false});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const origin=`http://127.0.0.1:${server.address().port}`;
  const response=await fetch(origin+'/api/presence',{
    method:'POST',headers:{'Content-Type':'application/json',Origin:'https://another.example'},body:'{}'
  });
  assert.equal(response.status,403);
  await response.arrayBuffer();
  assert.deepEqual(await (await fetch(origin+'/api/online')).json(),{online:0});
});

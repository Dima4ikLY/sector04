const screen=document.getElementById('startupScreen');

try{
  const {startup}=await import('./app.mjs');
  await startup;
  screen.hidden=true;
  document.getElementById('gameShell').inert=false;
}catch(error){
  screen.setAttribute('data-startup-error','');
  document.getElementById('startupStatus').textContent='Не удалось загрузить игру.';
  document.getElementById('startupRetry').hidden=false;
  console.error('SECTOR 04 startup failed.',error);
}

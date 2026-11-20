export function rankPlayers(players){return [...players].sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths);}
export function matchSummary(world,id){
  const sorted=rankPlayers(world.results||world.players),p=sorted.find(p=>p.id===id),reward=world.rewards||{};
  const summary={place:p?sorted.indexOf(p)+1:0,total:sorted.length,kills:p?.kills||0,deaths:p?.deaths||0,damage:Math.round(p?.damageDealt||0),rating:reward.rating||0,coins:reward.coins||0,rankBonus:reward.rankBonus||0,winner:sorted[0]?.name||'—',won:sorted[0]?.id===id};
  if(!world.teams)return summary;
  const {winner,scores}=world.teams,team=p?.team??null;
  const won=winner!==null&&team===winner;
  if(world.match?.mode==='1v1'&&winner!==null){
    summary.place=p?(won?1:sorted.length):0;
    summary.winner=sorted.find(player=>player.team===winner)?.name||'—';
  }
  return {...summary,team,teamWinner:winner,teamScores:[...scores],draw:world.ended&&winner===null,won};
}
// Server events can occur and disappear between screen frames. Consume IDs once,
// group shotgun pellets, and discard stale reconnect events instead of replaying.
export class CombatFeedback{
  constructor(){this.reset();}
  reset(){this.seen=0;this.markerUntil=0;this.killUntil=0;this.hurtUntil=0;this.armoredHit=false;this.armorOnlyHurt=false;this.numbers=[];}
  consume(events,id,worldTime,now){
    for(const event of events||[]){
      if(event.id<=this.seen)continue;this.seen=event.id;
      if(event.time-worldTime>.35)continue;
      const armorDamage=event.armorDamage??0;
      const armorOnly=armorDamage>0&&event.amount===0;
      if(event.victim===id){this.hurtUntil=now+300;this.armorOnlyHurt=armorOnly;}
      if(event.attacker!==id||event.victim===id)continue;
      this.markerUntil=now+180;this.armoredHit=armorOnly;if(event.kill)this.killUntil=now+350;
      let number=this.numbers.find(n=>n.victim===event.victim&&now-n.updated<100);
      if(number){number.amount+=event.amount;number.armorDamage+=armorDamage;number.kill ||= event.kill;number.updated=now;}
      else this.numbers.push({victim:event.victim,x:event.x,y:event.y,amount:event.amount,armorDamage,kill:event.kill,born:now,updated:now});
    }
    this.numbers=this.numbers.filter(n=>now-n.born<700).slice(-16);
  }
  draw(c,{now,x=0,y=0,zoom=1,width=1440,height=810,aimX=width/2,aimY=height/2,numbers=true}={}){
    c.save();
    if(numbers)for(const n of this.numbers){
      const age=now-n.born;if(age>700)continue;
      c.globalAlpha=Math.max(0,1-age/700);c.font='bold 22px Consolas,monospace';c.textAlign='center';c.lineWidth=3;c.strokeStyle='#1c3028';
      c.fillStyle=n.kill?'#ffce87':n.amount>0?'#eeffd2':'#91d4ff';
      const parts=[];
      if(n.amount>0)parts.push(String(n.amount));
      if(n.armorDamage>0)parts.push(`${n.armorDamage} БР`);
      const label=parts.join(' · '),sx=(n.x-x)*zoom,sy=(n.y-y)*zoom-16-age*.035;
      c.strokeText(label,sx,sy);c.fillText(label,sx,sy);
    }
    c.globalAlpha=1;
    if(now<this.markerUntil||now<this.killUntil){const kill=now<this.killUntil;c.strokeStyle=kill?'#ffbd73':this.armoredHit?'#91d4ff':'#efffd4';c.lineWidth=kill?3:2;for(const dx of [-1,1])for(const dy of [-1,1]){c.beginPath();c.moveTo(aimX+dx*11,aimY+dy*11);c.lineTo(aimX+dx*20,aimY+dy*20);c.stroke();}}
    if(now<this.hurtUntil){c.globalAlpha=(this.hurtUntil-now)/300*.65;c.strokeStyle=this.armorOnlyHurt?'#91d4ff':'#d96c52';c.lineWidth=10;c.strokeRect(5,5,width-10,height-10);}
    c.restore();
  }
}

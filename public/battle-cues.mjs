export const BATTLE_START_NOTICE_MS=1000;
const START_CUE_GRACE_MS=700;

export function advanceBattleCue(previous,countdown,ready,now){
  if(!countdown){
    const freshStart=ready&&previous&&now<=previous.expectedStart+START_CUE_GRACE_MS;
    return {state:null,cue:freshStart?'start':null};
  }

  const {endsAt,remainingMs}=countdown;
  const sameCountdown=previous&&previous.endsAt===endsAt;
  const number=Math.max(1,Math.min(3,Math.ceil(remainingMs/1000)));
  const digit=sameCountdown?Math.min(previous.digit,number):number;
  const expectedStart=sameCountdown?Math.min(previous.expectedStart,now+remainingMs):now+remainingMs;
  const newDigit=!sameCountdown||digit!==previous.digit;
  return {
    state:{endsAt,digit,expectedStart},
    cue:newDigit&&now<=expectedStart+START_CUE_GRACE_MS?digit:null
  };
}

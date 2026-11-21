// Three original combat scores. Notes are semitone offsets from each theme's tonic.
const themes = [
  {
    bpm: 128, beats: 4, tonic: 38,
    chords: [[0,3,7],[-4,0,3],[-2,2,5],[-5,-1,2],[0,3,7],[3,7,10],[-7,-4,0],[-5,-1,2]],
    melody: [
      [[0,0,.7],[.75,7,.6],[1.5,5,.45],[2,3,1.6]],
      [[0,3,.7],[1,5,.65],[2,8,.6],[3,7,.8]],
      [[0,10,1.2],[1.5,7,.5],[2.25,5,1.3]],
      [[0,2,.65],[1,5,.55],[2,7,.6],[3,11,.75]],
      [[0,12,1.65],[2,10,.65],[3,7,.7]],
      [[0,8,1],[1.5,7,.65],[2.25,3,1.35]],
      [[0,5,1.35],[1.5,8,.55],[2.25,12,1.5]],
      [[0,11,1.1],[1.25,7,.65],[2.25,5,1.35]]
    ],
    pattern: [0,1,0,2,0,1,2,1], accents: [0,1.5,2.5], backbeat: [1,3],
    lead: 'brass', pulse: 'strings'
  },
  {
    bpm: 154, beats: 6, tonic: 40,
    chords: [[0,3,7],[3,7,10],[-2,2,5],[-4,0,3],[-7,-4,0],[0,3,7],[-2,2,5],[-5,-1,2]],
    melody: [
      [[0,0,1.8],[2,2,.7],[3,3,2.4]],
      [[0,7,2.8],[3.5,5,.75],[4.5,3,.9]],
      [[0,2,1.6],[2,5,.8],[3,10,2.5]],
      [[0,8,1.75],[2,7,.8],[3,3,2.4]],
      [[0,5,2.55],[3,8,1.65],[5,7,.7]],
      [[0,12,2.5],[3,7,1.75],[5,3,.75]],
      [[0,10,1.7],[2,7,.8],[3,5,2.5]],
      [[0,7,1.4],[2,11,1],[3.5,5,1.7]]
    ],
    pattern: [0,2,1,2,1,0], accents: [0,3,5], backbeat: [3],
    lead: 'horn', pulse: 'glass'
  },
  {
    bpm: 143, beats: 4, tonic: 42,
    chords: [[0,3,7],[-2,2,5],[-4,0,3],[3,7,10],[0,3,7],[5,8,12],[-4,0,3],[-5,-1,2]],
    melody: [
      [[0,12,.38],[.5,10,.33],[1.25,7,.6],[2.5,3,1.25]],
      [[0,2,.65],[1,5,.3],[1.5,7,1.75]],
      [[.5,8,.66],[1.5,3,.55],[2.75,7,.95]],
      [[0,10,.42],[.5,12,.42],[1.5,15,.6],[2.5,10,1.3]],
      [[0,12,1.45],[1.75,15,.58],[2.75,19,.95]],
      [[0,17,1.5],[2,12,.62],[3,8,.66]],
      [[0,15,.43],[.5,12,.67],[1.5,8,.9],[2.75,7,.95]],
      [[0,11,1.65],[2,14,.65],[3,11,.8]]
    ],
    pattern: [0,0,2,0,1,2,0,0], accents: [0,.75,2,3.5], backbeat: [1,3],
    lead: 'signal', pulse: 'signal'
  }
];

const sampleRate = 24000;
const bars = 16;
const ceil = .48;
const pitch = note => 440 * 2 ** ((note - 69) / 12);
const floor = .0001;
const harmonics = {
  strings: [1,.33,.28,.15,.12,.075,.058,.04],
  brass: [1,.59,.33,.18,.10,.06],
  horn: [1,.23,.24,.055,.07],
  glass: [1,.02,.35,.032,.12,.045],
  signal: [1,.28,.065,.14,.025,.07],
  bass: [1,.53,.16,.08]
};

function makeVoice(context, out, waves) {
  return (time, note, duration, volume, {wave, attack=.022, release=.14, detune=0}={}) => {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.setPeriodicWave(waves[wave]);
    oscillator.frequency.value = pitch(note);
    oscillator.detune.value = detune;
    const peak = time + Math.min(duration*.4, attack);
    envelope.gain.setValueAtTime(floor, time);
    envelope.gain.exponentialRampToValueAtTime(Math.max(floor, volume), peak);
    envelope.gain.exponentialRampToValueAtTime(Math.max(floor, volume*.58), time+duration);
    envelope.gain.exponentialRampToValueAtTime(floor, time+duration+release);
    oscillator.connect(envelope).connect(out);
    oscillator.start(time);
    oscillator.stop(time+duration+release+.004);
  };
}

function makeDrums(context, out) {
  const noise = context.createBuffer(1, sampleRate, sampleRate);
  const samples = noise.getChannelData(0);
  let seed = 17933;
  for (let sample = 0; sample < samples.length; sample++) {
    seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
    samples[sample] = seed / 2**31 - 1;
  }
  function hit(time, level, {high, low, duration}) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.frequency.setValueAtTime(high, time);
    oscillator.frequency.exponentialRampToValueAtTime(low, time+duration*.55);
    envelope.gain.setValueAtTime(floor,time);
    envelope.gain.exponentialRampToValueAtTime(level,time+.007);
    envelope.gain.exponentialRampToValueAtTime(floor,time+duration);
    oscillator.connect(envelope).connect(out);
    oscillator.start(time);
    oscillator.stop(time+duration);
  }
  function texture(time, level, {frequency, duration, type='highpass', rise=.005}) {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = noise;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = .75;
    envelope.gain.setValueAtTime(floor,time);
    envelope.gain.exponentialRampToValueAtTime(level,time+rise);
    envelope.gain.exponentialRampToValueAtTime(floor,time+duration);
    source.connect(filter).connect(envelope).connect(out);
    source.start(time);
    source.stop(time+duration);
  }
  return {
    kick(time, volume) {
      hit(time,volume,{high:134, low:48, duration:.28});
      texture(time,volume*.32,{frequency:1800,duration:.043});
    },
    tom(time, volume) {
      hit(time,volume,{high:158, low:73, duration:.32});
      texture(time,volume*.39,{frequency:1400,duration:.092,type:'bandpass'});
    },
    snare(time, volume) {
      hit(time,volume*.44,{high:240,low:118,duration:.16});
      texture(time,volume,{frequency:2360,duration:.24,type:'bandpass'});
    },
    tick(time, volume) {
      texture(time,volume,{frequency:5100,duration:.061});
    },
    accent(time, volume) {
      texture(time,volume,{frequency:3600,duration:.7,rise:.022});
    }
  };
}

async function renderTheme(theme, Offline) {
  const beat = 60 / theme.bpm;
  const barLength = beat * theme.beats;
  const warmup = Math.ceil(barLength * sampleRate);
  const loopFrames = Math.round(bars * barLength * sampleRate);
  const context = new Offline(2, warmup+loopFrames, sampleRate);
  const mix = context.createGain();
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -17;
  compressor.knee.value = 13;
  compressor.ratio.value = 2.5;
  compressor.release.value = .17;
  mix.gain.value = .76;
  mix.connect(compressor).connect(context.destination);

  const pads = context.createGain();
  const lead = context.createGain();
  const pulses = context.createGain();
  pads.connect(mix);
  lead.connect(mix);
  pulses.connect(mix);
  // Short stereo reflections make the lead and string ensemble feel wider.
  for (const [seconds, side, level] of [[.145,-.7,.15],[.265,.7,.09]]) {
    const delay = context.createDelay(.4);
    const wet = context.createGain();
    delay.delayTime.value = seconds;
    wet.gain.value = level;
    lead.connect(delay);
    pads.connect(delay);
    if (typeof context.createStereoPanner === 'function') {
      const pan = context.createStereoPanner();
      pan.pan.value = side;
      delay.connect(pan).connect(wet);
    } else delay.connect(wet);
    wet.connect(mix);
  }
  const waves = Object.fromEntries(Object.entries(harmonics).map(([name, amplitudes]) => [
    name, context.createPeriodicWave(new Float32Array(amplitudes.length+1),new Float32Array([0,...amplitudes]))
  ]));
  const string = makeVoice(context,pads,waves);
  const melody = makeVoice(context,lead,waves);
  const pulse = makeVoice(context,pulses,waves);
  const bass = makeVoice(context,mix,waves);
  const drums = makeDrums(context,mix);

  // Run the last bar first so the reflections and releases wrap with no gap.
  for (let bar = -1; bar < bars; bar++) {
    const index = (bar+bars)%bars;
    const slot = index%theme.chords.length;
    const chord = theme.chords[slot];
    const start = warmup/sampleRate+bar*barLength;
    const stinger = [0,4,12].includes(index);
    const sparse = index>=8&&index<12;
    const lift = index>=12;
    const strength = sparse?.58:lift?1:.81;
    const lowNote = theme.tonic+chord[0];
    chord.forEach((interval, voice) => {
      const note = theme.tonic+12+interval;
      const attack = .075+voice*.026;
      string(start,note,barLength*.94,.048*strength,{wave:'strings',attack,release:.32,detune:-6});
      string(start,note+(voice===0?12:0),barLength*.92,.036*strength,{wave:'strings',attack:.17,release:.32,detune:7});
    });
    if (stinger) drums.accent(start,.10*strength);
    for (const [index, accent] of theme.accents.entries()) {
      if (sparse&&index>0) continue;
      const when = start+accent*beat;
      bass(when,lowNote,beat*(index===0?.82:.36),.13*strength,{wave:'bass',attack:.014,release:.10});
      if (index===0||accent===2||accent===3) drums.kick(when,.27*strength);
      else drums.tom(when,.14*strength);
    }
    for (const accent of theme.backbeat) {
      if (!sparse) drums.snare(start+accent*beat,.20*strength);
    }
    const divisions = theme.beats===6?6:8;
    for (let index = 0; index < divisions; index++) {
      if (sparse&&index%2) continue;
      const subdivision = theme.beats/divisions;
      const when = start+index*beat*subdivision;
      const lower = theme.pattern[index%theme.pattern.length];
      const note = theme.tonic+12+chord[lower]+(index%4===3?12:0);
      pulse(when,note,beat*subdivision*.73,(index%2?.038:.070)*strength,{wave:theme.pulse,attack:.012,release:.09});
      if (!sparse) drums.tick(when,.065*strength*(index%2?.6:1));
    }
    for (const [offset, interval, length] of theme.melody[slot]) {
      if (sparse&&offset>=3) continue;
      const when = start+offset*beat;
      const note = theme.tonic+24+interval;
      melody(when,note,beat*length,.110*strength,{wave:theme.lead,attack:.06,release:.20});
      if (lift) melody(when,note-12,beat*length,.054,{wave:'horn',attack:.083,release:.19});
    }
    if (index===7||index===15) {
      for (let hit=0;hit<3;hit++) drums.tom(start+(theme.beats-.9+hit*.3)*beat,(.075+hit*.027)*strength);
    }
  }
  const rendered = await context.startRendering();
  const loop = context.createBuffer(2,loopFrames,sampleRate);
  for (let channel = 0; channel < loop.numberOfChannels; channel++) {
    loop.copyToChannel(rendered.getChannelData(channel).subarray(warmup,warmup+loopFrames),channel);
  }
  return loop;
}

export class BattleScore {
  #context = null;
  #mix = null;
  #volume = .5;
  #playing = null;
  #pending = null;
  #wanted = false;
  #generation = 0;
  #next = Math.floor(Math.random()*themes.length);
  #tracks = new Map();

  #prepare(index) {
    const Offline = globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
    if (!Offline) return Promise.resolve(null);
    if (!this.#tracks.has(index)) {
      const task = renderTheme(themes[index],Offline).catch(() => {
        this.#tracks.delete(index);
        return null;
      });
      this.#tracks.set(index,task);
    }
    return this.#tracks.get(index);
  }

  preload(context) {
    return context ? this.#prepare(this.#next) : Promise.resolve(null);
  }

  setVolume(value) {
    this.#volume = Math.max(0,Math.min(1,Number(value)||0));
    if (this.#mix&&this.#context.state!=='closed') {
      this.#mix.gain.setTargetAtTime(this.#volume*ceil,this.#context.currentTime,.065);
    }
  }

  start(context) {
    if (!context) return Promise.resolve();
    if (this.#wanted) return this.#pending;
    this.#wanted = true;
    const generation = ++this.#generation;
    const index = this.#next;
    this.#pending = this.#prepare(index).then(buffer => {
      if (!buffer||generation!==this.#generation||context.state==='closed') return;
      if (context!==this.#context) {
        this.#context = context;
        this.#mix = context.createGain();
        this.#mix.gain.value = this.#volume*ceil;
        this.#mix.connect(context.destination);
      }
      const source = context.createBufferSource();
      const envelope = context.createGain();
      const time = context.currentTime;
      source.buffer = buffer;
      source.loop = true;
      envelope.gain.setValueAtTime(0,time);
      envelope.gain.linearRampToValueAtTime(1,time+1.05);
      source.connect(envelope).connect(this.#mix);
      source.start(time);
      this.#playing = {source,envelope,context,time};
      this.#next = (index+1+Math.floor(Math.random()*(themes.length-1)))%themes.length;
    }).catch(() => {});
    return this.#pending;
  }

  stop() {
    if (!this.#wanted) return;
    this.#wanted = false;
    ++this.#generation;
    this.#pending = null;
    const playback = this.#playing;
    this.#playing = null;
    if (!playback||playback.context.state==='closed') return;
    const {source,envelope,context,time:started} = playback;
    const time = context.currentTime;
    envelope.gain.cancelScheduledValues(time);
    envelope.gain.setValueAtTime(Math.min(1,Math.max(0,(time-started)/1.05)),time);
    envelope.gain.linearRampToValueAtTime(0,time+.6);
    source.onended = () => {source.disconnect();envelope.disconnect();};
    source.stop(time+.62);
  }
}

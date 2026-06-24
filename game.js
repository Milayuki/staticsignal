// ============================================
// STATIC SIGNAL — GAME ENGINE v2
// Beat-synced notes + real beat detection
// ============================================

const Game = (() => {

  const state = {
    selectedSong: null,
    selectedDiff: 'normal',
    audioCtx: null,
    audioBuffer: null,      // buffer for playback
    userAudioBuffer: null,  // user upload buffer (preserved)
    audioSource: null,
    startTime: 0,
    pauseOffset: 0,
    playing: false,
    paused: false,
    notes: [],              // { col, beatTime, y, hit, missed }
    beatmap: [],            // pre-generated: { col, time } in seconds
    beatmapIndex: 0,        // next note to spawn from beatmap
    score: 0,
    combo: 0,
    maxCombo: 0,
    totalNotes: 0,
    hitNotes: 0,
    health: 100,
    speed: 5,
    keyDown: [false,false,false,false],
    animId: null,
    lastTime: null,
    particles: [],
    judgmentTimer: 0,
    cntPerfect: 0,
    cntGreat: 0,
    cntGood: 0,
    cntMiss: 0,
    gauges: { signal: 0, echo: 0, static: 0 },
    selectedCards: [],
    records: [],
    dialogueStep: 0,
    userTrackName: '',
    analyzing: false,
  };

  const SONGS = [
    { id: 'song01', title: 'DEAD AIR',       artist: 'STATIC feat. ◈◈◈',    bpm: 172, badge: 'SIGNAL' },
    { id: 'song02', title: 'ROOM 404',        artist: 'anonymous_freq',       bpm: 148, badge: 'CHILL'  },
    { id: 'song03', title: 'FREQUENCY 999',   artist: 'STATIC & The Void',    bpm: 196, badge: 'CHAOS'  },
  ];

  const DIALOGUES = [
    { char: 'STATIC',   emoji: '📻', text: 'Опять этот звук. Как будто кто-то пытается достучаться сквозь помехи.' },
    { char: 'STATIC',   emoji: '📻', text: 'Я живу в комнате без окон. Слушаю радиошум. Записываю то, что слышу.' },
    { char: '◈◈◈',     emoji: '🌀', text: 'Ты слышишь меня? Хорошо. Передай это дальше. Они должны знать.' },
    { char: '◈◈◈',     emoji: '🌀', text: 'Играй ритм. Публикуй сигнал. Шкала трансляции должна достичь 100%.' },
    { char: 'STATIC',   emoji: '🫥', text: '...Кому это нужно? Но я всё равно продолжу. Мне всё равно больше нечем заняться.' },
    { char: 'STATIC',   emoji: '🫥', text: 'Если шкала заполнится — сигнал выйдет за пределы. Что-то изменится.' },
    { char: 'СИСТЕМА',  emoji: '📡', text: '[ НЕСУЩАЯ ЧАСТОТА ОБНАРУЖЕНА. НАЧАЛО ТРАНСЛЯЦИИ. ]' },
  ];

  const CARDS_POOL = [
    { type: 'signal',    emoji: '📻', text: 'Записать сигнал на кассету',              gain: '+12% SIGNAL',    gv: 12, tclass: 't-doki' },
    { type: 'signal',    emoji: '🎙', text: 'Провести ночную трансляцию',              gain: '+8% SIGNAL',     gv: 8,  tclass: 't-doki' },
    { type: 'echo',      emoji: '💜', text: 'Опубликовать расшифровку помех',           gain: '+15% ECHO',      gv: 15, tclass: 't-yun'  },
    { type: 'echo',      emoji: '🌀', text: 'Разослать координаты частоты по форумам', gain: '+10% ECHO',      gv: 10, tclass: 't-yun'  },
    { type: 'broadcast', emoji: '📡', text: 'Массовая рассылка сигнала',               gain: '+18% BROADCAST', gv: 18, tclass: 't-hype' },
    { type: 'broadcast', emoji: '🌐', text: 'Взломать частоту государственного вещания',gain:'+12% BROADCAST', gv: 12, tclass: 't-hype' },
    { type: 'gold',      emoji: '⭐', text: 'Чистый сигнал из пустоты',                gain: '+25% ALL',       gv: 25, tclass: 't-gold', gold: true },
    { type: 'gold',      emoji: '✨', text: 'Резонанс на всех частотах',               gain: '+20% ALL',       gv: 20, tclass: 't-gold', gold: true },
    { type: 'signal',    emoji: '🍵', text: 'Ещё одна ночь за приёмником',             gain: '+6% SIGNAL',     gv: 6,  tclass: 't-doki' },
    { type: 'echo',      emoji: '👁', text: 'Написать анонимный манифест помех',        gain: '+14% ECHO',      gv: 14, tclass: 't-yun'  },
    { type: 'broadcast', emoji: '🔥', text: 'Устроить акцию на радиорынке',            gain: '+10% BROADCAST', gv: 10, tclass: 't-hype' },
    { type: 'signal',    emoji: '🖤', text: 'Записать письмо в пустоту',               gain: '+9% SIGNAL',     gv: 9,  tclass: 't-doki' },
  ];

  const POST_MSGS = [
    ['freq_listener',   'кто ещё слышит этот звук на 87.6?'],
    ['user_x99',        'этот сигнал изменил что-то в моей голове...'],
    ['static_enjoyer',  '◈◈◈'],
    ['room404',         'мама думает я сплю'],
    ['signal_found',    'ЧАСТОТА ПРИНЯТА'],
    ['anonymous',       'это реально. передайте дальше.'],
    ['void_listener',   'слышу помехи уже три ночи подряд'],
    ['freq_cult',       'присоединяйтесь к трансляции ◈'],
    ['deadair_fan',     '404% шума'],
    ['nightbroadcast',  'почему я плачу слушая белый шум в 4 утра'],
  ];

  // ============================================================
  // BEATMAP GENERATION — demo songs (BPM-exact)
  // ============================================================
  function generateBeatmapFromBPM(bpm, durationSec, diff) {
    const beatmap = [];
    const beatLen  = 60 / bpm;           // seconds per beat
    const subdivision = diff === 'nolifer' ? 0.5 : diff === 'hardcore' ? 1 : 1; // half-beats for nolifer
    const step = beatLen * subdivision;

    // pattern probabilities per difficulty
    const density = { normal: 0.65, hardcore: 0.80, nolifer: 0.92 }[diff] || 0.65;
    // chord (2 notes same time) probability
    const chordChance = { normal: 0.05, hardcore: 0.18, nolifer: 0.30 }[diff] || 0.05;

    let t = 0.5; // start 0.5s in so player has time
    let lastCol = -1;
    const rng = mulberry32(12345); // deterministic per song

    while (t < durationSec - 1) {
      if (rng() < density) {
        let col = Math.floor(rng() * 4);
        // avoid same column back-to-back on normal
        if (diff === 'normal' && col === lastCol) col = (col + 1) % 4;
        beatmap.push({ col, time: t });
        lastCol = col;

        // chord second note
        if (rng() < chordChance) {
          let col2 = (col + 2) % 4; // opposite side
          beatmap.push({ col: col2, time: t });
        }
      }
      t += step;
    }
    return beatmap;
  }

  // ============================================================
  // BEAT DETECTION — for user uploaded audio
  // Uses onset detection via energy flux on sub-bands
  // ============================================================
  async function detectBeatsFromBuffer(audioBuffer, diff) {
    const sr        = audioBuffer.sampleRate;
    const numCh     = audioBuffer.numberOfChannels;
    const duration  = audioBuffer.duration;

    // Mix to mono
    const monoLen = audioBuffer.length;
    const mono    = new Float32Array(monoLen);
    for (let ch = 0; ch < numCh; ch++) {
      const data = audioBuffer.getChannelData(ch);
      for (let i = 0; i < monoLen; i++) mono[i] += data[i] / numCh;
    }

    // Hop-based energy analysis
    const hopSize    = Math.floor(sr * 0.01);  // 10ms hops
    const winSize    = Math.floor(sr * 0.04);  // 40ms window
    const numFrames  = Math.floor((monoLen - winSize) / hopSize);

    // Split into 3 sub-bands: bass (0-200Hz), mid (200-2kHz), hi (2k-8kHz)
    // We approximate using FFT-like energy via a simple filter bank
    // Simple approach: compute RMS energy in each hop + detect peaks

    const energies = new Float32Array(numFrames);
    for (let f = 0; f < numFrames; f++) {
      const start = f * hopSize;
      let e = 0;
      for (let i = start; i < start + winSize && i < monoLen; i++) {
        e += mono[i] * mono[i];
      }
      energies[f] = Math.sqrt(e / winSize);
    }

    // Onset detection: energy flux (positive derivative)
    const flux = new Float32Array(numFrames);
    for (let f = 1; f < numFrames; f++) {
      const d = energies[f] - energies[f-1];
      flux[f] = d > 0 ? d : 0;
    }

    // Adaptive threshold: local mean + offset
    const winFrames = Math.floor(0.4 / 0.01); // 400ms window
    const threshold = new Float32Array(numFrames);
    for (let f = 0; f < numFrames; f++) {
      let sum = 0, cnt = 0;
      const lo = Math.max(0, f - winFrames);
      const hi = Math.min(numFrames, f + winFrames);
      for (let j = lo; j < hi; j++) { sum += flux[j]; cnt++; }
      threshold[f] = (sum / cnt) * 1.5 + 0.002;
    }

    // Pick peaks above threshold with min spacing
    const density    = { normal: 0.65, hardcore: 0.80, nolifer: 1.0 }[diff] || 0.65;
    const minSpaceSec = { normal: 0.28, hardcore: 0.18, nolifer: 0.13 }[diff] || 0.28;
    const minSpaceFrames = Math.floor(minSpaceSec / 0.01);

    const onsets = [];
    let lastOnset = -9999;
    for (let f = 1; f < numFrames - 1; f++) {
      if (flux[f] > threshold[f] &&
          flux[f] > flux[f-1] &&
          flux[f] >= flux[f+1] &&
          f - lastOnset > minSpaceFrames) {
        if (Math.random() < density) {
          const timeSec = (f * hopSize) / sr;
          onsets.push(timeSec);
          lastOnset = f;
        }
      }
    }

    // Convert onsets → beatmap with column assignment
    const beatmap = [];
    const chordChance = { normal: 0.04, hardcore: 0.15, nolifer: 0.28 }[diff] || 0.04;
    let lastCol = -1;
    const rng = mulberry32(99991);

    for (const t of onsets) {
      if (t < 0.3 || t > duration - 0.5) continue;
      let col = Math.floor(rng() * 4);
      if (diff === 'normal' && col === lastCol) col = (col + 1) % 4;
      beatmap.push({ col, time: t });
      lastCol = col;
      if (rng() < chordChance) {
        beatmap.push({ col: (col + 2) % 4, time: t });
      }
    }

    // Sort by time (should be already, but just in case)
    beatmap.sort((a, b) => a.time - b.time);
    return beatmap;
  }

  // Simple seeded RNG (Mulberry32)
  function mulberry32(seed) {
    return function() {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // ============================================================
  // DEMO AUDIO GENERATOR — tighter, punchier
  // ============================================================
  async function generateDemoAudio(songId) {
    const ctx = state.audioCtx;
    const bpmMap = { song01: 172, song02: 148, song03: 196 };
    const bpm = bpmMap[songId] || 172;
    const duration = 90;
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(2, sr * duration, sr);
    const beatLen = 60 / bpm;

    const melodies = {
      song01: [440, 494, 523, 587, 659, 587, 523, 494],
      song02: [330, 370, 392, 440, 415, 392, 370, 330],
      song03: [880, 988, 1047, 1175, 1319, 1175, 988, 880],
    };
    const melody = melodies[songId] || melodies.song01;

    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        const t = i / sr;
        const beat = Math.floor(t / beatLen);
        const beatPhase = (t % beatLen) / beatLen;

        // Tight percussive envelope
        const env = Math.exp(-beatPhase * 6);

        const freq  = melody[beat % melody.length];
        const freq2 = melody[(beat + 4) % melody.length];

        // Kick-like thump on every beat (low sine, fast decay)
        const kickEnv = Math.exp(-beatPhase * 18);
        const kick = Math.sin(2 * Math.PI * 60 * t * (1 - beatPhase * 0.3)) * kickEnv * 0.4;

        // Melody tone
        const tone = Math.sin(2 * Math.PI * freq * t) * 0.20 * env
                   + Math.sin(2 * Math.PI * freq2 * t * 0.5) * 0.07 * env;

        // Hi-hat on off-beats (half beat)
        const halfPhase = ((t + beatLen * 0.5) % beatLen) / beatLen;
        const hhEnv = Math.exp(-halfPhase * 30);
        const hihat = (Math.random() * 2 - 1) * hhEnv * 0.06;

        data[i] = kick + tone + hihat;
      }
    }
    return buf;
  }

  // ============================================================
  // SCREEN MANAGEMENT
  // ============================================================
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
    if (id === 'screen-story-intro') startDialogue();
    if (id === 'screen-song-select') renderSongList();
    if (id === 'screen-records')     renderRecords();
    if (id === 'screen-cards')       renderCards();
  }

  // ---- DIALOGUE ----
  function startDialogue() {
    state.dialogueStep = 0;
    renderDialogue();
    document.getElementById('screen-story-intro').onclick = advanceDialogue;
    document.addEventListener('keydown', dialogueKeyHandler);
  }
  function dialogueKeyHandler(e) {
    if (e.code === 'Space') { e.preventDefault(); advanceDialogue(); }
  }
  function advanceDialogue() {
    state.dialogueStep++;
    if (state.dialogueStep >= DIALOGUES.length) {
      document.removeEventListener('keydown', dialogueKeyHandler);
      showScreen('screen-song-select');
    } else { renderDialogue(); }
  }
  function renderDialogue() {
    const d = DIALOGUES[state.dialogueStep];
    document.getElementById('dialogue-char').textContent = d.char;
    document.getElementById('portrait-img').textContent = d.emoji;
    const el = document.getElementById('dialogue-text');
    el.textContent = '';
    typeText(el, d.text, 0);
  }
  function typeText(el, text, i) {
    if (i <= text.length) {
      el.textContent = text.slice(0, i);
      if (i < text.length) setTimeout(() => typeText(el, text, i+1), 28);
    }
  }

  // ---- SONG LIST ----
  function renderSongList() {
    const list = document.getElementById('song-list');
    list.innerHTML = '';
    const songs = [...SONGS];
    if (state.userAudioBuffer) {
      songs.push({ id: 'user', title: state.userTrackName || 'Твой трек',
                   artist: 'User Upload', bpm: '?', badge: 'USER', user: true });
    }
    songs.forEach(s => {
      const el = document.createElement('div');
      el.className = 'song-item' + (state.selectedSong === s.id ? ' selected' : '');
      el.innerHTML = `<div>
        <div class="song-title">${s.title}</div>
        <div class="song-meta">${s.artist} · BPM ${s.bpm}</div>
      </div>
      <span class="song-badge${s.user ? ' user' : ''}">${s.badge}</span>`;
      el.onclick = (e) => selectSong(s.id, e.currentTarget);
      list.appendChild(el);
    });
    updateGaugeDisplay();
  }

  function selectSong(id, el) {
    state.selectedSong = id;
    document.querySelectorAll('.song-item').forEach(e => e.classList.remove('selected'));
    if (el) el.classList.add('selected');
  }

  function updateGaugeDisplay() {
    const { signal, echo } = state.gauges;
    const st = state.gauges.static;
    document.getElementById('g-doki').style.width   = Math.min(100, signal) + '%';
    document.getElementById('g-yun').style.width    = Math.min(100, echo) + '%';
    document.getElementById('g-denpa').style.width  = Math.min(100, st) + '%';
    document.getElementById('pct-doki').textContent = Math.round(signal) + '%';
    document.getElementById('pct-yun').textContent  = Math.round(echo) + '%';
    document.getElementById('pct-denpa').textContent= Math.round(st) + '%';
  }

  // ---- FILE UPLOAD ----
  document.getElementById('file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!state.audioCtx) state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const zone = document.getElementById('upload-zone');

    zone.querySelector('span:last-child').textContent = '⏳ Анализ бита...';
    zone.style.borderColor = 'var(--gold)';

    const ab = await file.arrayBuffer();
    const decoded = await state.audioCtx.decodeAudioData(ab);

    state.userAudioBuffer = decoded;
    state.userTrackName   = file.name.replace(/\.[^.]+$/, '');
    state.selectedSong    = 'user';

    zone.querySelector('span:last-child').textContent = '✓ ' + state.userTrackName;
    zone.style.borderColor = 'var(--cyan)';
    renderSongList();
  });

  // ---- DIFFICULTY ----
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedDiff = btn.dataset.diff;
    });
  });

  // ============================================================
  // START GAME
  // ============================================================
  async function startGame() {
    if (!state.selectedSong) { alert('Выбери трек!'); return; }
    if (!state.audioCtx) state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (state.audioCtx.state === 'suspended') await state.audioCtx.resume();

    const btn = document.getElementById('play-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Загрузка...';

    let beatmap;

    if (state.selectedSong === 'user') {
      // Use real user buffer + detect beats
      state.audioBuffer = state.userAudioBuffer;
      const zone = document.getElementById('upload-zone');
      zone.querySelector('span:last-child').textContent = '⏳ Обнаружение битов...';
      // Run beat detection (offload to microtask so UI updates)
      await new Promise(r => setTimeout(r, 20));
      beatmap = await detectBeatsFromBuffer(state.userAudioBuffer, state.selectedDiff);
    } else {
      const song = SONGS.find(s => s.id === state.selectedSong);
      state.audioBuffer = await generateDemoAudio(state.selectedSong);
      beatmap = generateBeatmapFromBPM(song.bpm, state.audioBuffer.duration, state.selectedDiff);
    }

    btn.disabled = false;
    btn.textContent = '▶ ИГРАТЬ';

    state.beatmap      = beatmap;
    state.beatmapIndex = 0;

    resetGameState();
    showScreen('screen-game');
    resizeCanvas();

    const diffMap = { normal: 5, hardcore: 7, nolifer: 9 };
    state.speed = diffMap[state.selectedDiff] || 5;
    document.getElementById('speed-slider').value   = state.speed;
    document.getElementById('speed-val').textContent = state.speed;
    document.getElementById('game-diff-label').textContent = state.selectedDiff.toUpperCase();

    const songName = state.selectedSong === 'user' ? state.userTrackName :
      SONGS.find(s => s.id === state.selectedSong)?.title || '—';
    document.getElementById('game-track-name').textContent = songName;

    playAudio(0);
    state.playing  = true;
    state.paused   = false;
    state.lastTime = null;
    state.animId   = requestAnimationFrame(gameLoop);

    document.getElementById('speed-slider').oninput = () => {
      state.speed = parseInt(document.getElementById('speed-slider').value);
      document.getElementById('speed-val').textContent = state.speed;
    };
  }

  function resetGameState() {
    state.notes         = [];
    state.beatmapIndex  = 0;
    state.score         = 0;
    state.combo         = 0;
    state.maxCombo      = 0;
    state.totalNotes    = 0;
    state.hitNotes      = 0;
    state.health        = 100;
    state.particles     = [];
    state.judgmentTimer = 0;
    state.cntPerfect    = 0;
    state.cntGreat      = 0;
    state.cntGood       = 0;
    state.cntMiss       = 0;
    updateGameUI();
  }

  // ---- AUDIO ----
  function playAudio(offset) {
    if (!state.audioCtx || !state.audioBuffer) return;
    if (state.audioSource) { try { state.audioSource.stop(); } catch(e){} }
    if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
    state.audioSource = state.audioCtx.createBufferSource();
    state.audioSource.buffer = state.audioBuffer;
    state.audioSource.connect(state.audioCtx.destination);
    state.audioSource.start(0, offset);
    state.startTime = state.audioCtx.currentTime - offset;
    state.audioSource.onended = () => { if (state.playing && !state.paused) endGame(); };
  }

  function stopAudio() {
    if (state.audioSource) { try { state.audioSource.stop(); } catch(e){} state.audioSource = null; }
  }

  function getAudioTime() {
    if (!state.audioCtx) return 0;
    return state.audioCtx.currentTime - state.startTime;
  }

  // ---- PAUSE ----
  function pauseGame() {
    if (!state.playing || state.paused) return;
    state.paused = true;
    state.pauseOffset = getAudioTime();
    stopAudio();
    cancelAnimationFrame(state.animId);
    document.getElementById('pause-overlay').style.display = 'flex';
  }

  function resumeGame() {
    if (!state.paused) return;
    state.paused = false;
    document.getElementById('pause-overlay').style.display = 'none';
    playAudio(state.pauseOffset);
    state.lastTime = null;
    state.animId = requestAnimationFrame(gameLoop);
  }

  function quitToMenu() {
    state.playing = state.paused = false;
    stopAudio();
    cancelAnimationFrame(state.animId);
    document.getElementById('pause-overlay').style.display = 'none';
    showScreen('screen-song-select');
  }

  // ---- CANVAS ----
  const canvas = document.getElementById('game-canvas');
  const ctx2   = canvas.getContext('2d');

  function resizeCanvas() {
    const parent = canvas.parentElement;
    canvas.height = Math.min(window.innerHeight, 700);
    canvas.width  = Math.min(parent ? parent.clientWidth : 400, 420);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const COLS      = 4;
  const NOTE_H    = 22;
  const COL_CLR   = ['#5090e0','#40c090','#40c090','#5090e0'];
  const keyMap    = { d: 0, f: 1, j: 2, k: 3 };

  function getHitY()  { return canvas.height - 90; }
  function getColW()  { return canvas.width / COLS; }

  // How many pixels ahead of the hit-line a note spawns
  // = travel distance so the note arrives exactly on time
  function getTravelPx() {
    // note speed in px/frame at 60fps
    // speed slider 1-10, noteSpeed = speed * 2.8 px/frame
    // we need it to arrive exactly when audio time == note.time
    // We'll use canvas height as travel distance and pre-schedule
    return canvas.height + NOTE_H;
  }

  // ============================================================
  // GAME LOOP — time-based note scheduling
  // ============================================================
  function gameLoop(ts) {
    if (!state.playing || state.paused) return;
    const dt = state.lastTime ? Math.min(ts - state.lastTime, 50) : 16;
    state.lastTime = ts;

    const audioTime = getAudioTime();
    const noteSpeed = state.speed * 2.8; // px per frame (at 60fps)
    const HIT_Y     = getHitY();

    // --- Schedule notes from beatmap ---
    // A note at time T should spawn when:
    //   audioTime = T - travelTime
    //   travelTime = travelPx / (noteSpeed * 60) seconds
    const travelPx  = HIT_Y + NOTE_H; // pixels from spawn to hit zone
    const travelSec = travelPx / (noteSpeed * 60);

    while (state.beatmapIndex < state.beatmap.length) {
      const next = state.beatmap[state.beatmapIndex];
      if (audioTime >= next.time - travelSec) {
        // Spawn with y-position adjusted for exact timing
        const overshoot = audioTime - (next.time - travelSec);
        const startY    = -NOTE_H + overshoot * noteSpeed * 60;
        state.notes.push({ col: next.col, time: next.time, y: startY, hit: false, missed: false });
        state.totalNotes++;
        state.beatmapIndex++;
      } else { break; }
    }

    // --- Move notes ---
    for (const n of state.notes) {
      if (n.hit || n.missed) continue;
      n.y += noteSpeed * dt / 16;
      if (n.y > HIT_Y + 80) {
        n.missed = true;
        state.combo  = 0;
        state.cntMiss++;
        state.health = Math.max(0, state.health - 10);
        showJudgment('MISS', '#e84040');
        updateGameUI();
        if (state.health <= 0) { endGame(); return; }
      }
    }
    state.notes = state.notes.filter(n => !(n.missed && n.y > canvas.height + 60));

    // --- Particles ---
    state.particles = state.particles.filter(p => p.life > 0);
    for (const p of state.particles) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--;
    }

    // --- Judgment fade ---
    if (state.judgmentTimer > 0) {
      state.judgmentTimer--;
      if (state.judgmentTimer === 0)
        document.getElementById('judgment-overlay').style.opacity = '0';
    }

    // --- Random post ---
    if (Math.random() < 0.004) addPostFeedMsg();

    // --- Check if beatmap exhausted (song still playing) ---
    if (state.beatmapIndex >= state.beatmap.length && state.notes.length === 0) {
      // Wait for audio to end naturally via onended
    }

    drawGame();
    state.animId = requestAnimationFrame(gameLoop);
  }

  // ---- DRAW ----
  function drawGame() {
    const W = canvas.width, H = canvas.height;
    if (!W || !H) return;
    const COL_W = getColW();
    const HIT_Y = getHitY();

    ctx2.clearRect(0, 0, W, H);
    ctx2.fillStyle = '#0b0916';
    ctx2.fillRect(0, 0, W, H);

    // Lane backgrounds + dividers
    for (let c = 0; c < COLS; c++) {
      ctx2.fillStyle = c % 2 === 0 ? 'rgba(80,144,224,0.04)' : 'rgba(64,192,144,0.04)';
      ctx2.fillRect(c * COL_W, 0, COL_W, H);
      ctx2.fillStyle = 'rgba(255,255,255,0.04)';
      ctx2.fillRect(c * COL_W, 0, 1, H);
    }

    // Hit line
    ctx2.fillStyle = 'rgba(176,141,232,0.2)';
    ctx2.fillRect(0, HIT_Y - 1, W, 3);
    ctx2.fillStyle = 'rgba(176,141,232,0.6)';
    ctx2.fillRect(0, HIT_Y, W, 1);

    // Hit zones
    for (let c = 0; c < COLS; c++) {
      const x      = c * COL_W + 4;
      const w      = COL_W - 8;
      const col    = COL_CLR[c];
      const active = state.keyDown[c];
      ctx2.save();
      ctx2.globalAlpha = active ? 0.9 : 0.5;
      ctx2.strokeStyle = col;
      ctx2.lineWidth   = active ? 2 : 1;
      ctx2.fillStyle   = active ? col + '44' : col + '18';
      roundRect(ctx2, x, HIT_Y + 2, w, 26, 5);
      ctx2.fill(); ctx2.stroke();
      ctx2.restore();
      ctx2.fillStyle  = active ? '#fff' : col;
      ctx2.font       = `${active ? 700 : 500} 14px 'Share Tech Mono', monospace`;
      ctx2.textAlign  = 'center';
      ctx2.fillText(['D','F','J','K'][c], c * COL_W + COL_W / 2, HIT_Y + 20);
    }

    // Notes
    for (const n of state.notes) {
      if (n.hit || n.missed) continue;
      const x   = n.col * COL_W + 4;
      const w   = COL_W - 8;
      const col = COL_CLR[n.col];
      ctx2.save();
      ctx2.shadowBlur  = 14;
      ctx2.shadowColor = col;
      ctx2.fillStyle   = col;
      ctx2.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx2.lineWidth   = 1;
      roundRect(ctx2, x, n.y, w, NOTE_H, 6);
      ctx2.fill(); ctx2.stroke();
      ctx2.restore();
    }

    // Particles
    for (const p of state.particles) {
      ctx2.globalAlpha = Math.max(0, p.life / 25);
      ctx2.fillStyle   = p.color;
      ctx2.beginPath();
      ctx2.arc(p.x, p.y, p.r || 3, 0, Math.PI * 2);
      ctx2.fill();
    }
    ctx2.globalAlpha = 1;
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x+r,y); c.lineTo(x+w-r,y);
    c.quadraticCurveTo(x+w,y,x+w,y+r);
    c.lineTo(x+w,y+h-r);
    c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    c.lineTo(x+r,y+h);
    c.quadraticCurveTo(x,y+h,x,y+h-r);
    c.lineTo(x,y+r);
    c.quadraticCurveTo(x,y,x+r,y);
    c.closePath();
  }

  // ---- JUDGMENT ----
  function showJudgment(text, color) {
    const el    = document.getElementById('judgment-overlay');
    el.textContent = text;
    el.style.color   = color;
    el.style.opacity = '1';
    state.judgmentTimer = 35;
  }

  function spawnParticles(x, y, color) {
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.3;
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * (2 + Math.random() * 3),
        vy: Math.sin(angle) * (2 + Math.random() * 3) - 2,
        life: 20 + Math.floor(Math.random() * 10),
        color, r: 2 + Math.random() * 2,
      });
    }
  }

  // ---- HIT DETECTION ----
  function handleKey(col, down) {
    state.keyDown[col] = down;
    if (!down || !state.playing || state.paused) return;

    const HIT_Y = getHitY();
    let best = null, bestDist = 9999;
    for (const n of state.notes) {
      if (n.hit || n.missed || n.col !== col) continue;
      const dist = Math.abs(n.y - HIT_Y);
      if (dist < bestDist) { bestDist = dist; best = n; }
    }
    if (!best || bestDist > 90) return;

    best.hit = true;
    state.hitNotes++;
    state.combo++;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;

    let pts, text, color;
    if      (bestDist < 22) { pts = 300; text = 'PERFECT'; color = '#f0c040'; state.cntPerfect++; }
    else if (bestDist < 50) { pts = 200; text = 'GREAT';   color = '#b08de8'; state.cntGreat++;   }
    else                    { pts = 100; text = 'GOOD';    color = '#40d880'; state.cntGood++;    }

    state.score += pts * Math.max(1, state.combo);
    state.health = Math.min(100, state.health + 2);
    spawnParticles(best.col * getColW() + getColW() / 2, HIT_Y, color);
    showJudgment(text, color);
    updateGameUI();
  }

  function updateGameUI() {
    document.getElementById('game-score').textContent   = String(state.score).padStart(6, '0');
    document.getElementById('game-combo').textContent   = state.combo + 'x';
    const acc = state.totalNotes > 0 ? ((state.hitNotes / state.totalNotes) * 100).toFixed(2) : '100.00';
    document.getElementById('game-acc').textContent     = acc + '%';
    const hw = Math.max(0, Math.min(100, state.health));
    const hf = document.getElementById('health-fill');
    hf.style.width      = hw + '%';
    hf.style.background = state.health > 50 ? 'var(--green)' : state.health > 25 ? 'var(--gold)' : 'var(--red)';
    document.getElementById('cnt-perfect').textContent  = state.cntPerfect;
    document.getElementById('cnt-great').textContent    = state.cntGreat;
    document.getElementById('cnt-good').textContent     = state.cntGood;
    document.getElementById('cnt-miss').textContent     = state.cntMiss;
    document.getElementById('mg-doki').style.width      = Math.min(100, state.gauges.signal) + '%';
    document.getElementById('mg-yun').style.width       = Math.min(100, state.gauges.echo) + '%';
    document.getElementById('mg-denpa').style.width     = Math.min(100, state.gauges.static) + '%';
  }

  // ---- POST FEED ----
  function addPostFeedMsg() {
    const [user, msg] = POST_MSGS[Math.floor(Math.random() * POST_MSGS.length)];
    const feed = document.getElementById('post-feed');
    const el   = document.createElement('div');
    el.className = 'post-item';
    el.innerHTML = `<div class="post-user">@${user}</div>${msg}`;
    feed.prepend(el);
    while (feed.children.length > 8) feed.removeChild(feed.lastChild);
  }

  // ---- END GAME ----
  function endGame() {
    state.playing = false;
    stopAudio();
    cancelAnimationFrame(state.animId);

    const acc   = state.totalNotes > 0 ? (state.hitNotes / state.totalNotes) * 100 : 100;
    const grade = getGrade(acc, state.cntMiss);
    const staticGain = Math.round(acc / 10 * (state.cntMiss === 0 ? 1.5 : 1));
    state.gauges.static = Math.min(100, state.gauges.static + staticGain);

    const songName = state.selectedSong === 'user' ? state.userTrackName :
      SONGS.find(s => s.id === state.selectedSong)?.title || '—';
    state.records.unshift({
      song: songName, score: state.score, acc: acc.toFixed(2), grade,
      diff: state.selectedDiff, perfect: state.cntPerfect, great: state.cntGreat,
      good: state.cntGood, miss: state.cntMiss, combo: state.maxCombo,
    });
    if (state.records.length > 20) state.records.pop();
    saveRecords();

    document.getElementById('result-grade').textContent  = grade;
    document.getElementById('result-grade').className    = 'result-grade ' + grade.toLowerCase();
    document.getElementById('result-track').textContent  = songName;
    document.getElementById('rs-score').textContent      = state.score.toLocaleString();
    document.getElementById('rs-perfect').textContent    = state.cntPerfect;
    document.getElementById('rs-great').textContent      = state.cntGreat;
    document.getElementById('rs-good').textContent       = state.cntGood;
    document.getElementById('rs-miss').textContent       = state.cntMiss;
    document.getElementById('rs-combo').textContent      = state.maxCombo;
    document.getElementById('rs-acc').textContent        = acc.toFixed(2) + '%';
    document.getElementById('result-denpa-gain').textContent = `+${staticGain}% STATIC CHARGED`;

    showScreen('screen-results');
  }

  function getGrade(acc, miss) {
    if (acc >= 98 && miss === 0) return 'S';
    if (acc >= 90) return 'A';
    if (acc >= 75) return 'B';
    if (acc >= 60) return 'C';
    return 'D';
  }

  // ---- CARDS ----
  function renderCards() {
    state.selectedCards = [];
    document.getElementById('selected-count').textContent = '0';
    document.getElementById('post-btn').disabled = true;

    const last = state.records[0];
    if (last) document.getElementById('cards-summary').textContent =
      `${last.song} — ${last.grade} · ${last.score.toLocaleString()} pts · ${last.acc}%`;

    const pool   = [...CARDS_POOL].sort(() => Math.random() - 0.5);
    const hasGold = pool.slice(0, 8).some(c => c.gold);
    const cards  = hasGold ? pool.slice(0, 8) : [CARDS_POOL.find(c => c.gold), ...pool.slice(0, 7)];

    const grid = document.getElementById('cards-grid');
    grid.innerHTML = '';
    cards.forEach((c) => {
      const el = document.createElement('div');
      el.className = 'card-item' + (c.gold ? ' gold' : '');
      el.innerHTML = `
        <div class="card-emoji">${c.emoji}</div>
        <div class="card-type ${c.tclass}">${c.type.toUpperCase()}</div>
        <div class="card-text">${c.text}</div>
        <div class="card-gain">${c.gain}</div>`;
      el.onclick = () => toggleCard(el, c);
      grid.appendChild(el);
    });
  }

  function toggleCard(el, card) {
    if (el.classList.contains('selected')) {
      el.classList.remove('selected');
      state.selectedCards = state.selectedCards.filter(c => c !== card);
    } else {
      if (state.selectedCards.length >= 3) return;
      el.classList.add('selected');
      state.selectedCards.push(card);
    }
    const cnt = state.selectedCards.length;
    document.getElementById('selected-count').textContent = cnt;
    document.getElementById('post-btn').disabled = cnt < 3;
  }

  function submitPost() {
    state.selectedCards.forEach(c => {
      if (c.gold) {
        state.gauges.signal = Math.min(100, state.gauges.signal + c.gv);
        state.gauges.echo   = Math.min(100, state.gauges.echo   + c.gv);
        state.gauges.static = Math.min(100, state.gauges.static + c.gv);
      } else if (c.type === 'signal')    { state.gauges.signal = Math.min(100, state.gauges.signal + c.gv); }
      else if   (c.type === 'echo')      { state.gauges.echo   = Math.min(100, state.gauges.echo   + c.gv); }
      else                               { state.gauges.static = Math.min(100, state.gauges.static + c.gv); }
    });
    updateGaugeDisplay();
    if (state.gauges.static >= 100) showWinScreen();
    else showScreen('screen-song-select');
  }

  function showWinScreen() {
    alert('📡 ШКАЛА ТРАНСЛЯЦИИ ЗАПОЛНЕНА!\n\nСИГНАЛ ВЫШЕЛ ЗА ПРЕДЕЛЫ.\n\nТы слышишь это, STATIC? Они получили послание. ◈\n\n[ Трансляция сброшена. Продолжай вещание. ]');
    state.gauges = { signal: 0, echo: 0, static: 0 };
    updateGaugeDisplay();
    showScreen('screen-song-select');
  }

  // ---- RECORDS ----
  function renderRecords() {
    const list = document.getElementById('records-list');
    if (state.records.length === 0) {
      list.innerHTML = '<div style="text-align:center;color:var(--text-dim);font-size:14px;padding:40px 0">Рекордов пока нет. Сыграй первую партию!</div>';
      return;
    }
    list.innerHTML = state.records.slice(0, 15).map(r => `
      <div class="record-row">
        <div class="record-grade" style="color:${gradeColor(r.grade)}">${r.grade}</div>
        <div class="record-name">${r.song}<br><span style="font-size:11px;color:var(--text-dim)">${r.diff.toUpperCase()} · combo ${r.combo}</span></div>
        <div>
          <div class="record-score">${r.score.toLocaleString()}</div>
          <div class="record-acc">${r.acc}%</div>
        </div>
      </div>`).join('');
  }

  function gradeColor(g) {
    return { S:'var(--gold)', A:'var(--purple-light)', B:'var(--cyan)', C:'var(--green)', D:'var(--red)' }[g] || 'var(--text)';
  }

  function saveRecords() { try { localStorage.setItem('static_signal_records', JSON.stringify(state.records)); } catch(e){} }
  function loadRecords()  { try { state.records = JSON.parse(localStorage.getItem('static_signal_records') || '[]'); } catch(e){} }

  // ---- KEYBOARD ----
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') { if (state.playing && !state.paused) pauseGame(); else if (state.paused) resumeGame(); }
    const col = keyMap[e.key.toLowerCase()];
    if (col !== undefined && !e.repeat) handleKey(col, true);
  });
  document.addEventListener('keyup', (e) => {
    const col = keyMap[e.key.toLowerCase()];
    if (col !== undefined) handleKey(col, false);
  });

  // ---- INIT ----
  loadRecords();

  return { showScreen, startGame, pauseGame, resumeGame, quitToMenu, submitPost };

})();

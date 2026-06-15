// ===================== STATE =====================
let currentSection = 'dashboard';
let currentLogDate = todayStr();
let reviewRange = 'today';
let waterLevel = 0;
let selectedExercises = new Set();
let sbClient = null;
let settings = loadSettings();
let charts = {};

// ===================== INIT =====================
function initApp() {
  applySettings();
  initExerciseTags();
  initProteinGuide();
  setupSleepCalc();
  setupWorkoutCalc();
  setupProteinCalc();
  setGreeting();
  renderDashboard();
  checkOllama();
  document.getElementById('logDateLabel').textContent = formatDate(currentLogDate);
  loadLogIntoForm(currentLogDate);

  if (settings.sbUrl && settings.sbKey) {
    initSupabase(settings.sbUrl, settings.sbKey);
  }
}

// ===================== UTILS =====================
function todayStr() {
  return new Date().toISOString().split('T')[0];
}
function formatDate(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function formatDateShort(d) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function calcDuration(t1, t2) {
  if (!t1 || !t2) return null;
  const [h1, m1] = t1.split(':').map(Number);
  const [h2, m2] = t2.split(':').map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60), m = mins % 60;
  return { h, m, total: mins };
}
function fmtDuration(d) {
  if (!d) return '—';
  if (d.h === 0) return `${d.m}m`;
  return d.m > 0 ? `${d.h}h ${d.m}m` : `${d.h}h`;
}

// ===================== SETTINGS =====================
function loadSettings() {
  const def = { proteinTarget: 130, stepsTarget: 8000, waterTarget: 3.5, ollamaUrl: 'http://localhost:11434', ollamaModel: 'gemma3:4b', sbUrl: '', sbKey: '', geminiKey: '' };
  try { return { ...def, ...JSON.parse(localStorage.getItem('fitlog_settings') || '{}') }; } catch { return def; }
}
function saveSettings() {
  settings.proteinTarget = parseFloat(document.getElementById('s-protein-target').value) || 130;
  settings.stepsTarget = parseInt(document.getElementById('s-steps-target').value) || 8000;
  settings.waterTarget = parseFloat(document.getElementById('s-water-target').value) || 3.5;
  settings.ollamaUrl = document.getElementById('s-ollama-url').value.trim();
  settings.ollamaModel = document.getElementById('s-ollama-model').value.trim();
  settings.geminiKey = document.getElementById('s-gemini-key').value.trim();
  localStorage.setItem('fitlog_settings', JSON.stringify(settings));
  showToast('Settings saved ✓');
  checkOllama();
}
function applySettings() {
  document.getElementById('s-protein-target').value = settings.proteinTarget;
  document.getElementById('s-steps-target').value = settings.stepsTarget;
  document.getElementById('s-water-target').value = settings.waterTarget;
  document.getElementById('s-ollama-url').value = settings.ollamaUrl;
  document.getElementById('s-ollama-model').value = settings.ollamaModel;
  document.getElementById('s-sb-url').value = settings.sbUrl;
  document.getElementById('s-sb-key').value = settings.sbKey;
  document.getElementById('s-gemini-key').value = settings.geminiKey || '';
}
function saveSupabaseSettings() {
  settings.sbUrl = document.getElementById('s-sb-url').value.trim();
  settings.sbKey = document.getElementById('s-sb-key').value.trim();
  localStorage.setItem('fitlog_settings', JSON.stringify(settings));
  if (settings.sbUrl && settings.sbKey) {
    initSupabase(settings.sbUrl, settings.sbKey);
    showToast('Supabase connected ✓');
  }
}
function openSettings() { showSection('settings'); }

// ===================== SUPABASE =====================
function initSupabase(url, key) {
  try {
    sbClient = window.supabase.createClient(url, key);
  } catch (e) { console.warn('Supabase init failed', e); }
}
function skipSupabase() {
  document.getElementById('setupModal').style.display = 'none';
}
function saveSupabase() {
  settings.sbUrl = document.getElementById('sbUrl').value.trim();
  settings.sbKey = document.getElementById('sbKey').value.trim();
  localStorage.setItem('fitlog_settings', JSON.stringify(settings));
  document.getElementById('setupModal').style.display = 'none';
  initSupabase(settings.sbUrl, settings.sbKey);
  showToast('Supabase connected ✓');
}

// ===================== DATA LAYER =====================
function getLogs() {
  try { return JSON.parse(localStorage.getItem('fitlog_logs') || '{}'); } catch { return {}; }
}
function setLogs(logs) {
  localStorage.setItem('fitlog_logs', JSON.stringify(logs));
  if (sbClient) syncToSupabase(logs);
}
function getLog(date) { return getLogs()[date] || null; }
function getReviews() {
  try { return JSON.parse(localStorage.getItem('fitlog_reviews') || '[]'); } catch { return []; }
}
function saveReview(r) {
  const reviews = getReviews();
  reviews.unshift(r);
  localStorage.setItem('fitlog_reviews', JSON.stringify(reviews.slice(0, 50)));
}
async function syncToSupabase(logs) {
  if (!sbClient) return;
  try {
    for (const [date, log] of Object.entries(logs)) {
      await sbClient.from('fitlog_entries').upsert({ date, data: log }, { onConflict: 'date' });
    }
  } catch (e) { console.warn('Supabase sync error', e); }
}

// ===================== NAVIGATION =====================
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.sidebar-nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('sec-' + name).classList.add('active');
  const navEl = document.getElementById('nav-' + name);
  if (navEl) navEl.classList.add('active');
  const snavEl = document.getElementById('snav-' + name);
  if (snavEl) snavEl.classList.add('active');
  currentSection = name;
  if (name === 'dashboard') renderDashboard();
  if (name === 'history') renderHistory();
  if (name === 'review') renderPastReviews();
}
function goToLog() {
  currentLogDate = todayStr();
  document.getElementById('logDateLabel').textContent = formatDate(currentLogDate);
  loadLogIntoForm(currentLogDate);
  showSection('log');
}

// ===================== GREETING =====================
function setGreeting() {
  const h = new Date().getHours();
  const g = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
  document.getElementById('greeting').textContent = g;
  document.getElementById('todayDate').textContent = formatDate(todayStr());
}

// ===================== LOG FORM =====================
function switchLogTab(tab, btn) {
  document.querySelectorAll('.logtab').forEach(t => t.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('logtab-' + tab).style.display = 'block';
  btn.classList.add('active');
}
function adjustStepper(id, delta) {
  const el = document.getElementById(id);
  const step = parseFloat(el.step) || 1;
  const val = parseFloat(el.value || 0) + delta;
  el.value = Math.max(0, Math.round(val * 100) / 100);
  el.dispatchEvent(new Event('change'));
  if (id === 'f-water') syncWaterDisplay();
  if (['f-protein-breakfast','f-protein-lunch','f-protein-dinner','f-protein-snacks'].includes(id)) updateTotalProtein();
}
function setupSleepCalc() {
  ['f-bedtime','f-waketime'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      const d = calcDuration(document.getElementById('f-bedtime').value, document.getElementById('f-waketime').value);
      document.getElementById('sleepDuration').textContent = d ? fmtDuration(d) : '—';
    });
  });
}
function setupWorkoutCalc() {
  ['f-workout-start','f-workout-end'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      const d = calcDuration(document.getElementById('f-workout-start').value, document.getElementById('f-workout-end').value);
      document.getElementById('workoutDuration').textContent = d ? fmtDuration(d) : '—';
    });
  });
}
function setupProteinCalc() {
  ['f-protein-breakfast','f-protein-lunch','f-protein-dinner','f-protein-snacks'].forEach(id => {
    document.getElementById(id).addEventListener('change', updateTotalProtein);
  });
}
function updateTotalProtein() {
  const total = ['f-protein-breakfast','f-protein-lunch','f-protein-dinner','f-protein-snacks']
    .reduce((s, id) => s + (parseFloat(document.getElementById(id).value) || 0), 0);
  document.getElementById('totalProtein').textContent = total;
}
function toggleRestDay(cb) {
  document.getElementById('workoutFields').style.display = cb.checked ? 'none' : 'block';
}
function addWater(amt) {
  waterLevel = Math.min(settings.waterTarget + 2, Math.round((waterLevel + amt) * 100) / 100);
  document.getElementById('f-water').value = waterLevel;
  syncWaterDisplay();
}
function syncWaterDisplay() {
  waterLevel = parseFloat(document.getElementById('f-water').value) || 0;
  document.getElementById('waterDisplay').textContent = waterLevel.toFixed(1);
  const pct = Math.min(100, (waterLevel / settings.waterTarget) * 100);
  document.getElementById('waterBar').style.width = pct + '%';
}

// ===================== EXERCISE TAGS =====================
const EXERCISES = {
  'Arms':       ['Bicep Curls','Tricep Dips','Hammer Curls','Tricep Pushdown','Overhead Extension','Wrist Curls','Concentration Curls','Preacher Curls','Cable Curls','Reverse Curls','Skull Crushers','Close-Grip Bench','Tricep Kickbacks','21s'],
  'Chest':      ['Push-ups','Bench Press','Incline Press','Chest Flyes','Dips','Cable Crossover','Decline Press','Decline Flyes','Wide Push-ups','Diamond Push-ups','Pec Deck','Landmine Press'],
  'Back':       ['Pull-ups','Lat Pulldown','Seated Rows','Deadlift','T-Bar Row','Face Pulls','Chin-ups','Single Arm Row','Bent-Over Row','Rack Pulls','Good Mornings','Reverse Flyes','Straight-Arm Pulldown','Hyperextensions'],
  'Shoulders':  ['Shoulder Press','Lateral Raises','Front Raises','Arnold Press','Shrugs','Upright Row','Reverse Pec Deck','Cable Lateral Raise','Cable Front Raise','Dumbbell Shrugs','Machine Press','Bent-Over Lateral Raise'],
  'Core':       ['Plank','Crunches','Leg Raises','Russian Twists','Bicycle Crunches','Ab Wheel','Side Plank','Hollow Hold','V-Ups','Toe Touches','Dead Bug','Cable Crunch','Hanging Knee Raise','Hanging Leg Raise','Dragon Flag','Mountain Climbers'],
  'Legs':       ['Squats','Lunges','Leg Press','Leg Curls','Calf Raises','Glute Bridges','Romanian Deadlift','Bulgarian Split Squat','Hack Squat','Sumo Squat','Box Jumps','Step-Ups','Leg Extensions','Hip Thrust','Wall Sit','Goblet Squat','Nordic Curls'],
  'Cardio':     ['Incline Walk','Running','Cycling','Jump Rope','HIIT','Stair Climber','Rowing Machine','Elliptical','Swimming','Shadow Boxing','Sprint Intervals','Jumping Jacks','High Knees','Assault Bike'],
  'Full Body':  ['Burpees','Kettlebell Swings','Battle Ropes','Clean & Press','Thrusters','Turkish Get-Up','Sandbag Carry','Farmer\'s Walk','Sled Push','Bear Crawl','Man Makers','Barbell Complex'],
  'Mobility':   ['Foam Rolling','Hip Flexor Stretch','Hamstring Stretch','Shoulder Stretch','Pigeon Pose','Cat-Cow','Thoracic Rotation','Ankle Circles','World\'s Greatest Stretch','Band Pull-Aparts','Doorway Chest Stretch','Child\'s Pose'],
  'Yoga':       ['Sun Salutation','Downward Dog','Warrior I','Warrior II','Tree Pose','Cobra Pose','Bridge Pose','Seated Forward Fold','Supine Twist','Legs Up Wall','Chair Pose','Camel Pose'],
};

const GROUP_STYLES = {
  'Arms':      { icon: '💪', color: '#8B5CF6', bg: 'rgba(139,92,246,0.13)', border: 'rgba(139,92,246,0.32)', selBg: 'rgba(139,92,246,0.35)' },
  'Chest':     { icon: '🏋️', color: '#FF6584', bg: 'rgba(255,101,132,0.12)', border: 'rgba(255,101,132,0.32)', selBg: 'rgba(255,101,132,0.35)' },
  'Back':      { icon: '🦾', color: '#00D68F', bg: 'rgba(0,214,143,0.12)', border: 'rgba(0,214,143,0.30)', selBg: 'rgba(0,214,143,0.32)' },
  'Shoulders': { icon: '🏋️', color: '#38BDF8', bg: 'rgba(56,189,248,0.12)', border: 'rgba(56,189,248,0.30)', selBg: 'rgba(56,189,248,0.32)' },
  'Core':      { icon: '🎯', color: '#FF9F43', bg: 'rgba(255,159,67,0.12)', border: 'rgba(255,159,67,0.30)', selBg: 'rgba(255,159,67,0.32)' },
  'Legs':      { icon: '🦵', color: '#A78BFA', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.30)', selBg: 'rgba(167,139,250,0.32)' },
  'Cardio':    { icon: '🏃', color: '#F87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.30)', selBg: 'rgba(248,113,113,0.32)' },
  'Full Body': { icon: '⚡', color: '#34D399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.28)', selBg: 'rgba(52,211,153,0.32)' },
  'Mobility':  { icon: '🧘', color: '#FB923C', bg: 'rgba(251,146,60,0.11)', border: 'rgba(251,146,60,0.28)', selBg: 'rgba(251,146,60,0.32)' },
  'Yoga':      { icon: '🪷', color: '#E879F9', bg: 'rgba(232,121,249,0.11)', border: 'rgba(232,121,249,0.28)', selBg: 'rgba(232,121,249,0.32)' },
};

const EXERCISE_ICONS = {
  // Arms
  'Bicep Curls':'💪','Tricep Dips':'🤸','Hammer Curls':'🔨','Tricep Pushdown':'⬇️','Overhead Extension':'☝️','Wrist Curls':'🤝',
  'Concentration Curls':'💪','Preacher Curls':'💪','Cable Curls':'💪','Reverse Curls':'🔄','Skull Crushers':'💀','Close-Grip Bench':'🏋️','Tricep Kickbacks':'🦵','21s':'💪',
  // Chest
  'Push-ups':'🤸','Bench Press':'🏋️','Incline Press':'📐','Chest Flyes':'🦅','Dips':'⬇️','Cable Crossover':'✂️',
  'Decline Press':'📉','Decline Flyes':'🦅','Wide Push-ups':'🤸','Diamond Push-ups':'💎','Pec Deck':'🦅','Landmine Press':'🏋️',
  // Back
  'Pull-ups':'🔝','Lat Pulldown':'⬇️','Seated Rows':'🚣','Deadlift':'🏋️','T-Bar Row':'🚣','Face Pulls':'😤',
  'Chin-ups':'🔝','Single Arm Row':'🚣','Bent-Over Row':'🚣','Rack Pulls':'🏋️','Good Mornings':'🌅','Reverse Flyes':'🦅','Straight-Arm Pulldown':'⬇️','Hyperextensions':'🔄',
  // Shoulders
  'Shoulder Press':'🏋️','Lateral Raises':'🦅','Front Raises':'☝️','Arnold Press':'💪','Shrugs':'🤷',
  'Upright Row':'⬆️','Reverse Pec Deck':'🦅','Cable Lateral Raise':'🦅','Cable Front Raise':'☝️','Dumbbell Shrugs':'🤷','Machine Press':'🏋️','Bent-Over Lateral Raise':'🦅',
  // Core
  'Plank':'🧘','Crunches':'🔄','Leg Raises':'🦵','Russian Twists':'🌀','Bicycle Crunches':'🚴','Ab Wheel':'⚙️',
  'Side Plank':'🧘','Hollow Hold':'🧘','V-Ups':'✌️','Toe Touches':'👆','Dead Bug':'🐛','Cable Crunch':'🔄','Hanging Knee Raise':'🦵','Hanging Leg Raise':'🦵','Dragon Flag':'🐉','Mountain Climbers':'⛰️',
  // Legs
  'Squats':'🏋️','Lunges':'🚶','Leg Press':'🦵','Leg Curls':'🔄','Calf Raises':'👟','Glute Bridges':'🌉',
  'Romanian Deadlift':'🏋️','Bulgarian Split Squat':'🚶','Hack Squat':'🏋️','Sumo Squat':'🏋️','Box Jumps':'📦','Step-Ups':'⬆️','Leg Extensions':'🦵','Hip Thrust':'🌉','Wall Sit':'🧱','Goblet Squat':'🏋️','Nordic Curls':'🔄',
  // Cardio
  'Incline Walk':'🚶','Running':'🏃','Cycling':'🚴','Jump Rope':'🪢','HIIT':'⚡','Stair Climber':'🪜',
  'Rowing Machine':'🚣','Elliptical':'🔄','Swimming':'🏊','Shadow Boxing':'🥊','Sprint Intervals':'💨','Jumping Jacks':'⭐','High Knees':'🏃','Assault Bike':'🚴',
  // Full Body
  'Burpees':'⚡','Kettlebell Swings':'🏋️','Battle Ropes':'🌊','Clean & Press':'🏋️',
  'Thrusters':'🏋️','Turkish Get-Up':'🔄','Sandbag Carry':'🎒','Farmer\'s Walk':'🚶','Sled Push':'🛷','Bear Crawl':'🐻','Man Makers':'⚡','Barbell Complex':'🏋️',
  // Mobility
  'Foam Rolling':'🪵','Hip Flexor Stretch':'🧘','Hamstring Stretch':'🧘','Shoulder Stretch':'🧘','Pigeon Pose':'🕊️','Cat-Cow':'🐄','Thoracic Rotation':'🔄','Ankle Circles':'⭕','World\'s Greatest Stretch':'🌍','Band Pull-Aparts':'↔️','Doorway Chest Stretch':'🚪','Child\'s Pose':'🧘',
  // Yoga
  'Sun Salutation':'☀️','Downward Dog':'🐕','Warrior I':'⚔️','Warrior II':'⚔️','Tree Pose':'🌳','Cobra Pose':'🐍','Bridge Pose':'🌉','Seated Forward Fold':'🧘','Supine Twist':'🌀','Legs Up Wall':'🧘','Chair Pose':'🪑','Camel Pose':'🐪',
};

const EXERCISE_DESC = {
  'Bicep Curls':       'Curl dumbbells to shoulders. Keep elbows pinned to sides.',
  'Tricep Dips':       'Lower body between parallel bars, push back up. Elbows close.',
  'Hammer Curls':      'Curl with neutral grip (palms facing each other). Hits brachialis.',
  'Tricep Pushdown':   'Push cable bar down until arms fully extend. Squeeze at bottom.',
  'Overhead Extension':'Hold weight behind head, extend arms straight overhead.',
  'Wrist Curls':       'Forearms on bench, curl wrists up and lower slowly.',
  'Push-ups':          'Lower chest to floor, push back up. Core braced, body straight.',
  'Bench Press':       'Press barbell from chest to full extension. Arch back slightly.',
  'Incline Press':     '30–45° incline targets upper chest. Control descent.',
  'Chest Flyes':       'Wide arc from above chest down to sides. Slight elbow bend.',
  'Dips':              'Between bars: lean forward for chest, upright for triceps.',
  'Cable Crossover':   'Pull cables from high to low, cross hands at midline.',
  'Pull-ups':          'Hang from bar, pull chin over it. Full hang each rep.',
  'Lat Pulldown':      'Pull bar to upper chest. Lean back slightly, squeeze lats.',
  'Seated Rows':       'Pull cable to lower ribs. Drive elbows back, chest up.',
  'Deadlift':          'Bar over mid-foot, flat back, hinge at hips. Drive floor away.',
  'T-Bar Row':         'Bent-over, row bar to lower chest. Keep back parallel to floor.',
  'Face Pulls':        'Pull rope to face level, flare elbows wide. Rotator cuff.',
  'Shoulder Press':    'Press weight overhead from shoulder height. Full lockout.',
  'Lateral Raises':    'Raise arms to sides to shoulder height. Slight elbow bend.',
  'Front Raises':      'Raise arms straight in front to shoulder height. Controlled.',
  'Arnold Press':      'Start palms in, rotate out as you press overhead. Full ROM.',
  'Shrugs':            'Hold heavy weight, elevate shoulders straight up. Hold 1s.',
  'Plank':             'On forearms, body straight from head to heels. Hold for time.',
  'Crunches':          'Curl shoulder blades off floor. Lower back stays on ground.',
  'Leg Raises':        'Lie flat, raise straight legs to 90°. Lower slowly without touching.',
  'Russian Twists':    'Seated, feet off floor, rotate torso side to side with weight.',
  'Bicycle Crunches':  'Alternate bringing elbow to opposite knee in cycling motion.',
  'Ab Wheel':          'From knees, roll wheel forward until extended. Pull back in.',
  'Squats':            'Feet shoulder-width, lower until thighs parallel. Knees track toes.',
  'Lunges':            'Step forward, lower back knee toward floor. Push off front foot.',
  'Leg Press':         'Push platform away. Don\'t lock knees. Full range of motion.',
  'Leg Curls':         'Prone or seated, curl lower leg toward glutes. Squeeze at top.',
  'Calf Raises':       'Full extension on toes, slow lowering. Straight or bent knee.',
  'Glute Bridges':     'Feet flat, drive hips up, squeeze glutes hard at top. Hold 1s.',
  'Incline Walk':      'Treadmill at 10–15% incline, moderate pace. Burns fat effectively.',
  'Running':           'Steady pace or intervals. Land mid-foot, relaxed shoulders.',
  'Cycling':           'Steady-state or interval cadence. Seat at hip height.',
  'Jump Rope':         'Land softly on balls of feet. Keep jumps low, rhythm consistent.',
  'HIIT':              '20–40s max effort, 10–20s rest. Repeat 6–10 rounds.',
  'Stair Climber':     'Steady pace, push through heels. Don\'t lean on rails.',
  'Burpees':           'Squat → jump back → push-up → jump forward → leap up. No rest.',
  'Kettlebell Swings': 'Hinge at hips, swing bell between legs, then drive hips forward.',
  'Battle Ropes':      'Alternate arms creating waves. Keep core braced throughout.',
  'Clean & Press':     'Power clean bar to shoulders, then press overhead. Big compound.',
  // Arms — new
  'Concentration Curls':  'Elbow on inner thigh, curl dumbbell to shoulder. Peak contraction.',
  'Preacher Curls':        'Arm rests on angled pad — strict form, no swing. Full stretch.',
  'Cable Curls':           'Cable keeps constant tension. Curl to chin, squeeze at top.',
  'Reverse Curls':         'Overhand grip curl. Hits brachialis and forearms hard.',
  'Skull Crushers':        'Lower bar/dumbbells toward forehead, extend back up. Triceps.',
  'Close-Grip Bench':      'Bench press with hands shoulder-width. Triceps primary mover.',
  'Tricep Kickbacks':      'Bent over, extend arm straight back. Squeeze at full extension.',
  '21s':                   '7 reps bottom half + 7 top half + 7 full reps = 21. Bicep pump.',
  // Chest — new
  'Decline Press':         'Decline bench targets lower chest. Press from chest to lockout.',
  'Decline Flyes':         'Decline angle hits lower pec. Wide arc, slight elbow bend.',
  'Wide Push-ups':         'Hands wider than shoulder-width. More chest, less tricep.',
  'Diamond Push-ups':      'Hands form diamond shape. Maximum tricep activation.',
  'Pec Deck':              'Machine fly movement. Constant tension on pec through arc.',
  'Landmine Press':        'Press angled barbell overhead/forward. Shoulder friendly.',
  // Back — new
  'Chin-ups':              'Underhand grip pull-up. More bicep involvement than pull-ups.',
  'Single Arm Row':        'Brace on bench, row dumbbell to hip. Full stretch at bottom.',
  'Bent-Over Row':         'Hinge to 45°, row barbell to lower ribs. Squeeze shoulder blades.',
  'Rack Pulls':            'Deadlift from knee height. Heavy overload for upper back & traps.',
  'Good Mornings':         'Bar on back, hinge at hips to parallel. Hamstrings & spinal erectors.',
  'Reverse Flyes':         'Bent over, raise arms to sides. Targets rear delts and rhomboids.',
  'Straight-Arm Pulldown': 'Keep arms straight, pull bar from overhead to thighs. Lats.',
  'Hyperextensions':       'On GHD machine, lower torso down then extend back up. Lower back.',
  // Shoulders — new
  'Upright Row':           'Pull bar or dumbbells up to chin level. Traps and front delts.',
  'Reverse Pec Deck':      'Machine reverse fly. Isolates rear deltoids. Sit facing pad.',
  'Cable Lateral Raise':   'Cable from low pulley, raise arm to side. Constant tension.',
  'Cable Front Raise':     'Cable from low pulley, raise arm to eye level. Front delt.',
  'Dumbbell Shrugs':       'Hold dumbbells at sides, shrug straight up. Trap isolation.',
  'Machine Press':         'Shoulder press machine. Stable path, good for beginners.',
  'Bent-Over Lateral Raise':'Hinge forward 45°, raise arms to sides. Rear delt focus.',
  // Core — new
  'Side Plank':            'On one forearm and foot edge. Hold body straight laterally.',
  'Hollow Hold':           'Lie flat, arms overhead, legs up — create banana shape. Hold.',
  'V-Ups':                 'Simultaneously raise legs and torso to touch hands to feet.',
  'Toe Touches':           'Lie flat, raise legs to 90°, reach hands up to toes.',
  'Dead Bug':              'Opposite arm/leg lower simultaneously from tabletop. Core stability.',
  'Cable Crunch':          'Kneel facing cable, crunch torso down with rope behind head.',
  'Hanging Knee Raise':    'Hang from bar, bring knees to chest. Lower controlled.',
  'Hanging Leg Raise':     'Hang from bar, raise straight legs to horizontal or above.',
  'Dragon Flag':           'On bench, lower rigid body from shoulders to hover. Advanced.',
  'Mountain Climbers':     'Plank position, drive knees to chest alternately. Fast pace.',
  // Legs — new
  'Romanian Deadlift':     'Hinge at hips with soft knees. Feel hamstring stretch, then drive up.',
  'Bulgarian Split Squat': 'Rear foot elevated on bench. Lunge deep, front leg does the work.',
  'Hack Squat':            'Machine squat — feet forward on platform. Quad dominant.',
  'Sumo Squat':            'Wide stance, toes out. Inner thigh and glute emphasis.',
  'Box Jumps':             'Jump onto box, land softly. Full hip/knee extension on top.',
  'Step-Ups':              'Step onto box or bench, drive knee up. Alternate legs.',
  'Leg Extensions':        'Machine quad isolation. Extend lower leg from seated position.',
  'Hip Thrust':            'Shoulders on bench, bar on hips, drive hips up high. Glutes.',
  'Wall Sit':              'Back on wall, thighs parallel to floor. Hold for time. Quads.',
  'Goblet Squat':          'Hold dumbbell at chest, squat deep. Great for form practice.',
  'Nordic Curls':          'Feet anchored, lower body forward slowly. Extreme hamstring eccentric.',
  // Cardio — new
  'Rowing Machine':        'Drive with legs first, then lean back, then pull arms. Full body.',
  'Elliptical':            'Low-impact cross-trainer. Maintain upright posture, use arms.',
  'Swimming':              'Full body, zero impact. Freestyle or mix strokes for variety.',
  'Shadow Boxing':         'Punch combinations in air. Cardio + coordination + aggression.',
  'Sprint Intervals':      '10–30s all-out sprint, 60–90s walk/jog. Repeat 6–10 times.',
  'Jumping Jacks':         'Feet together, arms at sides → feet wide, arms overhead. Repeat.',
  'High Knees':            'Run in place driving knees as high as possible. Fast cadence.',
  'Assault Bike':          'Fan bike — push and pull handles while pedaling. Brutal cardio.',
  // Full Body — new
  'Thrusters':             'Front squat immediately into overhead press. No pause. Brutal.',
  'Turkish Get-Up':        'From floor to standing holding weight overhead. 6 steps each side.',
  'Sandbag Carry':         'Carry heavy sandbag for distance or time. Core and grip.',
  "Farmer's Walk":         'Hold heavy dumbbells/kettlebells, walk. Grip, core, traps.',
  'Sled Push':             'Drive sled forward with legs. Stay low, short choppy steps.',
  'Bear Crawl':            'On hands and feet (knees off floor), crawl forward/backward.',
  'Man Makers':            'Push-up → row left → row right → jump in → squat → press. Done.',
  'Barbell Complex':       'Series of lifts without setting bar down. Row→clean→press→squat.',
  // Mobility
  'Foam Rolling':          'Roll slowly over muscle, pause on tight spots. 30–60s per area.',
  'Hip Flexor Stretch':    'Lunge position, push hips forward. Hold 30–60s each side.',
  'Hamstring Stretch':     'Straight leg, hinge forward or lie and pull leg. Hold 30s.',
  'Shoulder Stretch':      'Pull arm across chest or behind head. Hold each side 30s.',
  'Pigeon Pose':           'Front leg bent forward, back leg extended. Deep hip opener.',
  'Cat-Cow':               'On all fours — arch spine up (cat), dip it down (cow). Flow.',
  'Thoracic Rotation':     'Seated or kneeling, rotate upper spine. Improves posture.',
  'Ankle Circles':         'Rotate ankle in full circles. Both directions, both feet.',
  "World's Greatest Stretch": 'Lunge + rotate + reach. Multiple joints in one movement.',
  'Band Pull-Aparts':      'Hold band at chest, pull apart to T shape. Rear delt warmup.',
  'Doorway Chest Stretch': 'Arms on doorframe, lean forward. Opens chest and pecs.',
  "Child's Pose":          'Kneel, sit back on heels, arms extended forward. Rest pose.',
  // Yoga
  'Sun Salutation':        '12-pose flowing sequence. Warmup for full yoga practice.',
  'Downward Dog':          'Inverted V shape. Heels toward floor, hips high. Hamstrings.',
  'Warrior I':             'Lunge with arms raised overhead. Front knee over ankle.',
  'Warrior II':            'Wide stance, front knee bent, arms horizontal. Hold strong.',
  'Tree Pose':             'Balance on one leg, other foot on inner thigh. Arms overhead.',
  'Cobra Pose':            'Lie prone, push upper body up with arms. Opens chest and spine.',
  'Bridge Pose':           'Lie on back, feet flat, raise hips. Arms flat on floor.',
  'Seated Forward Fold':   'Legs straight, fold torso over them. Hamstrings and spine.',
  'Supine Twist':          'Lie on back, draw knees to chest, drop to one side. Spine.',
  'Legs Up Wall':          'Lie on back, legs vertical against wall. Rest and restore.',
  'Chair Pose':            'Feet together, sit back as if on chair, arms overhead.',
  'Camel Pose':            'Kneel, reach back to heels, open chest to ceiling. Backbend.',
};

let tooltipTimer = null;
function showExTooltip(icon, name, desc) {
  clearTimeout(tooltipTimer);
  document.getElementById('ttIcon').textContent = icon;
  document.getElementById('ttName').textContent = name;
  document.getElementById('ttDesc').textContent = desc;
  const el = document.getElementById('exTooltip');
  el.classList.add('show');
  tooltipTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

function initExerciseTags() {
  const container = document.getElementById('exerciseTags');
  container.innerHTML = '';
  for (const [group, exercises] of Object.entries(EXERCISES)) {
    const gs = GROUP_STYLES[group] || GROUP_STYLES['Arms'];

    // Group header
    const groupHeader = document.createElement('div');
    groupHeader.className = 'ex-group-header';
    groupHeader.style.cssText = `background:${gs.bg};color:${gs.color};`;
    groupHeader.innerHTML = `<span style="font-size:15px;">${gs.icon}</span><span>${group}</span>`;
    container.appendChild(groupHeader);

    exercises.forEach(ex => {
      const icon = EXERCISE_ICONS[ex] || '🏃';
      const desc = EXERCISE_DESC[ex] || '';
      const tag = document.createElement('div');
      tag.className = 'exercise-tag';
      tag.style.cssText = `background:${gs.bg};border-color:${gs.border};`;
      tag.dataset.name = ex;
      tag.dataset.group = group;
      tag.innerHTML = `<span class="ex-icon">${icon}</span><span>${ex}</span>`;
      tag.title = desc; // desktop hover
      tag.onclick = () => {
        if (selectedExercises.has(ex)) {
          selectedExercises.delete(ex);
          tag.classList.remove('selected');
          tag.style.background = gs.bg;
          tag.style.borderColor = gs.border;
          tag.style.color = '';
        } else {
          selectedExercises.add(ex);
          tag.classList.add('selected');
          tag.style.background = gs.selBg;
          tag.style.borderColor = gs.color;
          tag.style.color = 'white';
          showExTooltip(icon, ex, desc);
        }
      };
      container.appendChild(tag);
    });
  }
}

// ===================== SAVE / LOAD LOG =====================
function saveLog(status) {
  const log = {
    date: currentLogDate,
    status,
    weight: parseFloat(document.getElementById('f-weight').value) || null,
    steps: parseInt(document.getElementById('f-steps').value) || 0,
    bedtime: document.getElementById('f-bedtime').value,
    waketime: document.getElementById('f-waketime').value,
    sleepQuality: parseInt(document.getElementById('f-sleep-quality').value),
    sleepHours: (() => { const d = calcDuration(document.getElementById('f-bedtime').value, document.getElementById('f-waketime').value); return d ? d.total / 60 : null; })(),
    restDay: document.getElementById('f-restday').checked,
    workoutStart: document.getElementById('f-workout-start').value,
    workoutEnd: document.getElementById('f-workout-end').value,
    exercises: [...selectedExercises],
    customExercise: document.getElementById('f-custom-exercise').value.trim(),
    soreness: parseInt(document.getElementById('f-soreness').value),
    meals: {
      breakfast: document.getElementById('f-meal-breakfast').value.trim(),
      lunch: document.getElementById('f-meal-lunch').value.trim(),
      dinner: document.getElementById('f-meal-dinner').value.trim(),
      snacks: document.getElementById('f-meal-snacks').value.trim()
    },
    protein: {
      breakfast: parseFloat(document.getElementById('f-protein-breakfast').value) || 0,
      lunch: parseFloat(document.getElementById('f-protein-lunch').value) || 0,
      dinner: parseFloat(document.getElementById('f-protein-dinner').value) || 0,
      snacks: parseFloat(document.getElementById('f-protein-snacks').value) || 0,
    },
    water: parseFloat(document.getElementById('f-water').value) || 0,
    notes: document.getElementById('f-notes').value.trim(),
    savedAt: new Date().toISOString()
  };
  log.totalProtein = log.protein.breakfast + log.protein.lunch + log.protein.dinner + log.protein.snacks;

  const logs = getLogs();
  logs[currentLogDate] = log;
  setLogs(logs);

  document.getElementById('logStatusBadge').className = status === 'final' ? 'badge badge-green' : 'badge badge-orange';
  document.getElementById('logStatusBadge').textContent = status === 'final' ? 'Final ✓' : 'Draft';
  showToast(status === 'final' ? 'Saved as Final ✓' : 'Draft saved');
  if (status === 'final') showSection('dashboard');
}

function loadLogIntoForm(date) {
  const log = getLog(date);
  waterLevel = 0;
  selectedExercises.clear();
  document.querySelectorAll('.exercise-tag').forEach(t => {
    t.classList.remove('selected');
    const gs = GROUP_STYLES[t.dataset.group] || GROUP_STYLES['Arms'];
    t.style.background = gs.bg;
    t.style.borderColor = gs.border;
    t.style.color = '';
  });

  if (!log) {
    document.getElementById('f-weight').value = '';
    document.getElementById('f-steps').value = 0;
    document.getElementById('f-bedtime').value = '23:00';
    document.getElementById('f-waketime').value = '06:30';
    document.getElementById('f-sleep-quality').value = 7;
    document.getElementById('sleepQualityLabel').textContent = '7';
    document.getElementById('f-restday').checked = false;
    document.getElementById('workoutFields').style.display = 'block';
    document.getElementById('f-workout-start').value = '06:00';
    document.getElementById('f-workout-end').value = '07:00';
    document.getElementById('f-custom-exercise').value = '';
    document.getElementById('f-soreness').value = 3;
    document.getElementById('sorenessLabel').textContent = '3';
    ['breakfast','lunch','dinner','snacks'].forEach(m => {
      document.getElementById('f-meal-' + m).value = '';
      document.getElementById('f-protein-' + m).value = 0;
    });
    document.getElementById('f-water').value = 0;
    document.getElementById('f-notes').value = '';
    document.getElementById('logStatusBadge').className = 'badge badge-orange';
    document.getElementById('logStatusBadge').textContent = 'Draft';
    syncWaterDisplay();
    updateTotalProtein();
    return;
  }

  document.getElementById('f-weight').value = log.weight || '';
  document.getElementById('f-steps').value = log.steps || 0;
  document.getElementById('f-bedtime').value = log.bedtime || '23:00';
  document.getElementById('f-waketime').value = log.waketime || '06:30';
  document.getElementById('f-sleep-quality').value = log.sleepQuality || 7;
  document.getElementById('sleepQualityLabel').textContent = log.sleepQuality || 7;
  const sd = calcDuration(log.bedtime, log.waketime);
  document.getElementById('sleepDuration').textContent = sd ? fmtDuration(sd) : '—';
  document.getElementById('f-restday').checked = log.restDay || false;
  document.getElementById('workoutFields').style.display = log.restDay ? 'none' : 'block';
  document.getElementById('f-workout-start').value = log.workoutStart || '06:00';
  document.getElementById('f-workout-end').value = log.workoutEnd || '07:00';
  const wd = calcDuration(log.workoutStart, log.workoutEnd);
  document.getElementById('workoutDuration').textContent = wd ? fmtDuration(wd) : '—';
  (log.exercises || []).forEach(ex => {
    selectedExercises.add(ex);
    document.querySelectorAll('.exercise-tag').forEach(t => {
      if (t.dataset.name === ex) {
        t.classList.add('selected');
        const gs = GROUP_STYLES[t.dataset.group] || GROUP_STYLES['Arms'];
        t.style.background = gs.selBg;
        t.style.borderColor = gs.color;
        t.style.color = 'white';
      }
    });
  });
  document.getElementById('f-custom-exercise').value = log.customExercise || '';
  document.getElementById('f-soreness').value = log.soreness || 3;
  document.getElementById('sorenessLabel').textContent = log.soreness || 3;
  ['breakfast','lunch','dinner','snacks'].forEach(m => {
    document.getElementById('f-meal-' + m).value = (log.meals || {})[m] || '';
    document.getElementById('f-protein-' + m).value = (log.protein || {})[m] || 0;
  });
  waterLevel = log.water || 0;
  document.getElementById('f-water').value = waterLevel;
  syncWaterDisplay();
  updateTotalProtein();
  document.getElementById('f-notes').value = log.notes || '';
  document.getElementById('logStatusBadge').className = log.status === 'final' ? 'badge badge-green' : 'badge badge-orange';
  document.getElementById('logStatusBadge').textContent = log.status === 'final' ? 'Final ✓' : 'Draft';
}

// ===================== DASHBOARD =====================
function renderDashboard() {
  const today = todayStr();
  const log = getLog(today);
  const logs = getLogs();
  const dates = Object.keys(logs).sort().reverse();

  if (log) {
    document.getElementById('todayStatus').className = log.status === 'final' ? 'badge badge-green' : 'badge badge-orange';
    document.getElementById('todayStatus').textContent = log.status === 'final' ? 'Final ✓' : 'Draft';
    document.getElementById('dash-weight').textContent = log.weight ? log.weight + '' : '—';
    document.getElementById('dash-protein').textContent = log.totalProtein || '—';
    document.getElementById('dash-sleep').textContent = log.sleepHours ? log.sleepHours.toFixed(1) : '—';
    document.getElementById('dash-water').textContent = log.water ? log.water.toFixed(1) : '—';
    const steps = log.steps || 0;
    document.getElementById('dash-steps-label').textContent = steps.toLocaleString() + ' / ' + settings.stepsTarget.toLocaleString();
    document.getElementById('dash-steps-bar').style.width = Math.min(100, (steps / settings.stepsTarget) * 100) + '%';
  } else {
    document.getElementById('todayStatus').className = 'badge badge-orange';
    document.getElementById('todayStatus').textContent = 'Not Logged';
    ['dash-weight','dash-protein','dash-sleep','dash-water'].forEach(id => document.getElementById(id).textContent = '—');
    document.getElementById('dash-steps-label').textContent = '0 / ' + settings.stepsTarget.toLocaleString();
    document.getElementById('dash-steps-bar').style.width = '0%';
  }

  // Streak
  let streak = 0;
  let d = new Date();
  while (true) {
    const ds = d.toISOString().split('T')[0];
    if (logs[ds]) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  document.getElementById('streakCount').textContent = streak;

  // Weight chart (7 days)
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const dd = new Date(); dd.setDate(dd.getDate() - i);
    const ds = dd.toISOString().split('T')[0];
    last7.push({ label: formatDateShort(ds), weight: (logs[ds] && logs[ds].weight) || null });
  }
  renderLineChart('weightChart', last7.map(d => d.label), last7.map(d => d.weight), '#6C63FF', 'kg');

  // Recent logs
  const container = document.getElementById('recentLogs');
  container.innerHTML = '';
  dates.slice(0, 5).forEach(date => {
    const l = logs[date];
    container.insertAdjacentHTML('beforeend', logCard(date, l));
  });
}

function logCard(date, l) {
  const exercises = (l.exercises || []).slice(0, 3).join(', ');
  return `
  <div class="card p-3 cursor-pointer hover:border-purple-500 transition-colors" onclick="openLog('${date}')">
    <div class="flex items-center justify-between mb-2">
      <span class="font-medium text-sm">${formatDateShort(date)}</span>
      <span class="badge ${l.status === 'final' ? 'badge-green' : 'badge-orange'}">${l.status === 'final' ? 'Final' : 'Draft'}</span>
    </div>
    <div class="flex gap-4 text-xs" style="color:var(--text-secondary);">
      ${l.weight ? `<span>⚖️ ${l.weight}kg</span>` : ''}
      ${l.totalProtein ? `<span>🥩 ${l.totalProtein}g</span>` : ''}
      ${l.sleepHours ? `<span>😴 ${l.sleepHours.toFixed(1)}h</span>` : ''}
      ${l.water ? `<span>💧 ${l.water}L</span>` : ''}
    </div>
    ${exercises ? `<div class="text-xs mt-1" style="color:var(--text-secondary);">💪 ${exercises}${(l.exercises||[]).length > 3 ? ' +' + ((l.exercises||[]).length - 3) + ' more' : ''}</div>` : ''}
  </div>`;
}

function openLog(date) {
  currentLogDate = date;
  document.getElementById('logDateLabel').textContent = formatDate(date);
  loadLogIntoForm(date);
  showSection('log');
}

// ===================== HISTORY =====================
function renderHistory() {
  const logs = getLogs();
  const dates = Object.keys(logs).sort().reverse();

  // Charts
  const last30 = [];
  for (let i = 29; i >= 0; i--) {
    const dd = new Date(); dd.setDate(dd.getDate() - i);
    const ds = dd.toISOString().split('T')[0];
    const l = logs[ds];
    last30.push({
      label: formatDateShort(ds),
      weight: l ? l.weight : null,
      protein: l ? l.totalProtein : null,
      sleep: l ? l.sleepHours : null
    });
  }
  renderLineChart('weightChart30', last30.map(d => d.label), last30.map(d => d.weight), '#6C63FF', 'kg');
  renderLineChart('proteinChart', last30.map(d => d.label), last30.map(d => d.protein), '#00D68F', 'g');
  renderLineChart('sleepChart', last30.map(d => d.label), last30.map(d => d.sleep), '#FF9F43', 'hrs');

  const container = document.getElementById('historyList');
  container.innerHTML = '';
  if (dates.length === 0) { container.innerHTML = '<p class="text-center py-8" style="color:var(--text-secondary);">No logs yet. Start logging today!</p>'; return; }
  dates.forEach(date => container.insertAdjacentHTML('beforeend', logCard(date, logs[date])));
}

// ===================== CHARTS =====================
function renderLineChart(canvasId, labels, data, color, unit) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: color,
        backgroundColor: color + '22',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: color,
        spanGaps: true
      }]
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.y !== null ? ctx.parsed.y + ' ' + unit : 'No data' } } },
      scales: {
        x: { ticks: { color: '#64748B', font: { size: 10 }, maxRotation: 0, maxTicksLimit: 7 }, grid: { color: '#1E293B' } },
        y: { ticks: { color: '#64748B', font: { size: 10 } }, grid: { color: '#1E293B' } }
      },
      responsive: true,
      maintainAspectRatio: true
    }
  });
}

// ===================== AI REVIEW =====================
function setReviewRange(range, btn) {
  reviewRange = range;
  document.querySelectorAll('.date-pill').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function getLogsForRange(range) {
  const logs = getLogs();
  const result = [];
  const n = range === 'today' ? 1 : range === 'yesterday' ? 1 : range === '3d' ? 3 : 7;
  const offset = range === 'yesterday' ? 1 : 0;
  for (let i = offset; i < offset + n; i++) {
    const dd = new Date(); dd.setDate(dd.getDate() - i);
    const ds = dd.toISOString().split('T')[0];
    if (logs[ds]) result.push({ date: ds, ...logs[ds] });
  }
  return result.reverse();
}

function buildPrompt(logsArr) {
  const systemPrompt = `You are a precise, no-nonsense fitness coach. Analyze the user's fitness log data and give a detailed review.

Format your response exactly like this:
**DAILY SCORECARD** — give a score X/10 for each day
**NUTRITION VERDICT** — protein analysis, meal quality, specific improvements
**WORKOUT VERDICT** — training assessment, effort, recommendations
**SLEEP VERDICT** — sleep quality and duration analysis
**HYDRATION** — water intake assessment
**TOP 3 ISSUES** — the 3 most important things to fix
**ACTION PLAN** — 3 specific, actionable steps for tomorrow

Be honest, specific, and direct. Give real numbers and comparisons. The user's targets are:
- Protein: 120-140g per day
- Sleep: Before 11:15 PM, 7-8 hours
- Water: 3.5L per day
- Steps: 8,000+ per day
- Current weight goal: body recomposition (maintain/lose fat, build muscle)`;

  const dataStr = logsArr.map(l => `
Date: ${l.date}
Weight: ${l.weight || 'not logged'}kg
Sleep: ${l.bedtime} → ${l.waketime} (${l.sleepHours ? l.sleepHours.toFixed(1) + 'h' : 'unknown'}) Quality: ${l.sleepQuality}/10
Workout: ${l.restDay ? 'REST DAY' : `${l.workoutStart}-${l.workoutEnd}, Exercises: ${(l.exercises||[]).join(', ')}${l.customExercise ? ', ' + l.customExercise : ''}, Soreness: ${l.soreness}/10`}
Meals:
  Breakfast: ${l.meals?.breakfast || 'not logged'} (${l.protein?.breakfast || 0}g protein)
  Lunch: ${l.meals?.lunch || 'not logged'} (${l.protein?.lunch || 0}g protein)
  Dinner: ${l.meals?.dinner || 'not logged'} (${l.protein?.dinner || 0}g protein)
  Snacks: ${l.meals?.snacks || 'not logged'} (${l.protein?.snacks || 0}g protein)
Total Protein: ${l.totalProtein || 0}g
Water: ${l.water || 0}L
Steps: ${l.steps || 0}
Notes: ${l.notes || 'none'}
`).join('\n---\n');

  return { system: systemPrompt, user: `Please review my fitness log:\n\n${dataStr}` };
}

async function getAIReview(engine) {
  const logsArr = getLogsForRange(reviewRange);
  if (logsArr.length === 0) { showToast('No logged data for this range'); return; }

  // Determine engine
  const useGemini = engine === 'gemini';
  if (useGemini && !settings.geminiKey) {
    showToast('Add Gemini API key in Settings first');
    showSection('settings');
    return;
  }

  const btnId = useGemini ? 'reviewBtnGemini' : 'reviewBtnOllama';
  const btn = document.getElementById(btnId);
  btn.disabled = true;
  btn.innerHTML = useGemini ? '<span class="pulse">✨ Generating...</span>' : '<span class="pulse">⚡ Generating...</span>';

  const outputDiv = document.getElementById('aiReviewOutput');
  const textDiv = document.getElementById('aiText');
  outputDiv.style.display = 'block';
  textDiv.innerHTML = `<span class="pulse" style="color:var(--text-secondary);">Connecting to ${useGemini ? 'Gemini' : 'Ollama'}...</span>`;

  const { system, user } = buildPrompt(logsArr);
  const start = Date.now();

  try {
    let fullText = '';

    if (useGemini) {
      fullText = await callGemini(system, user, textDiv);
    } else {
      fullText = await callOllama(system, user, textDiv);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    document.getElementById('aiTime').textContent = `Generated in ${elapsed}s via ${useGemini ? 'Gemini' : 'Ollama'}`;
    saveReview({ date: todayStr(), range: reviewRange, text: fullText, engine: useGemini ? 'gemini' : 'ollama', generatedAt: new Date().toISOString() });
    renderPastReviews();

  } catch (e) {
    const hint = useGemini
      ? `Gemini error: ${e.message}. Check API key in Settings.`
      : `Could not connect to Ollama at ${settings.ollamaUrl}.\n\nRun: <code style="background:#1E293B;padding:2px 8px;border-radius:4px;">ollama serve</code>\n\nOr use Copy Prompt → paste into ChatGPT/Claude.`;
    textDiv.innerHTML = `<span style="color:#FF6584;">${hint}</span>`;
  }

  btn.disabled = false;
  btn.innerHTML = useGemini ? '✨ Gemini' : '⚡ Ollama';
}

async function callOllama(system, user, textDiv) {
  const res = await fetch(settings.ollamaUrl + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: settings.ollamaModel,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      stream: true
    })
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);

  textDiv.textContent = '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.message?.content) {
          fullText += obj.message.content;
          textDiv.innerHTML = formatReviewHTML(fullText);
          textDiv.scrollTop = textDiv.scrollHeight;
        }
      } catch {}
    }
  }
  return fullText;
}

async function callGemini(system, user, textDiv) {
  const model = 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${settings.geminiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }]
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'HTTP ' + res.status);
  }

  textDiv.textContent = '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value);
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      try {
        const obj = JSON.parse(data);
        const part = obj?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (part) {
          fullText += part;
          textDiv.innerHTML = formatReviewHTML(fullText);
          textDiv.scrollTop = textDiv.scrollHeight;
        }
      } catch {}
    }
  }
  return fullText;
}

function formatReviewHTML(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#6C63FF;">$1</strong>')
    .replace(/\n/g, '<br>');
}

function copyPrompt() {
  const logsArr = getLogsForRange(reviewRange);
  if (logsArr.length === 0) { showToast('No logged data for this range'); return; }
  const { system, user } = buildPrompt(logsArr);
  const full = system + '\n\n---\n\n' + user;
  navigator.clipboard.writeText(full).then(() => showToast('Prompt copied! Paste into ChatGPT or Claude ✓'));
}

function copyReview() {
  const text = document.getElementById('aiText').textContent;
  navigator.clipboard.writeText(text).then(() => showToast('Review copied ✓'));
}

function renderPastReviews() {
  const container = document.getElementById('pastReviews');
  const reviews = getReviews();
  if (reviews.length === 0) { container.innerHTML = '<p class="text-sm py-4" style="color:var(--text-secondary);">No reviews yet.</p>'; return; }
  container.innerHTML = reviews.slice(0, 10).map(r => `
    <div class="card p-3 cursor-pointer" onclick="this.querySelector('.review-text').style.display = this.querySelector('.review-text').style.display === 'none' ? 'block' : 'none'">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium">${formatDate(r.date)}</span>
        <span class="badge badge-purple text-xs">${r.range}</span>
      </div>
      <div class="review-text ai-output mt-3 text-xs" style="display:none;max-height:300px;">${formatReviewHTML(r.text)}</div>
    </div>
  `).join('');
}

// ===================== OLLAMA STATUS =====================
// ===================== EXPORT / IMPORT =====================
function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (data.logs) { localStorage.setItem('fitlog_logs', JSON.stringify(data.logs)); }
      if (data.reviews) { localStorage.setItem('fitlog_reviews', JSON.stringify(data.reviews)); }
      showToast('Data imported ✓');
      renderDashboard();
    } catch { showToast('Invalid backup file'); }
  };
  reader.readAsText(file);
}

// ===================== PROTEIN GUIDE =====================
const PROTEIN_DATA = [
  // ── Global ──
  { food: 'Chicken Breast (100g)', protein: 31, unit: '100g', region: 'global' },
  { food: 'Eggs (1 whole)', protein: 6, unit: '1 egg', region: 'global' },
  { food: 'Egg Whites (1)', protein: 4, unit: '1 white', region: 'global' },
  { food: 'Greek Yogurt (100g)', protein: 10, unit: '100g', region: 'global' },
  { food: 'Tuna (100g)', protein: 29, unit: '100g', region: 'global' },
  { food: 'Salmon (100g)', protein: 25, unit: '100g', region: 'global' },
  { food: 'Tofu (100g)', protein: 8, unit: '100g', region: 'global' },
  { food: 'Oats (1 cup cooked)', protein: 6, unit: '1 cup', region: 'global' },
  { food: 'Chicken Thigh (100g)', protein: 26, unit: '100g', region: 'global' },
  { food: 'Turkey Breast (100g)', protein: 30, unit: '100g', region: 'global' },
  { food: 'Beef (100g lean)', protein: 26, unit: '100g', region: 'global' },
  { food: 'Pork Tenderloin (100g)', protein: 26, unit: '100g', region: 'global' },
  { food: 'Cottage Cheese (100g)', protein: 11, unit: '100g', region: 'global' },
  { food: 'Mozzarella (100g)', protein: 22, unit: '100g', region: 'global' },
  { food: 'Edamame (1 cup)', protein: 17, unit: '1 cup', region: 'global' },
  { food: 'Lentils (1 cup cooked)', protein: 18, unit: '1 cup', region: 'global' },
  { food: 'Black Beans (1 cup)', protein: 15, unit: '1 cup', region: 'global' },
  { food: 'Peanut Butter (2 tbsp)', protein: 8, unit: '2 tbsp', region: 'global' },
  { food: 'Almonds (30g)', protein: 6, unit: '30g', region: 'global' },
  { food: 'Milk (250ml)', protein: 8, unit: '250ml', region: 'global' },
  { food: 'Sardines (100g)', protein: 25, unit: '100g', region: 'global' },
  { food: 'Shrimp / Prawn (100g)', protein: 24, unit: '100g', region: 'global' },
  { food: 'Quinoa (1 cup cooked)', protein: 8, unit: '1 cup', region: 'global' },
  // ── Supplements ──
  { food: 'Whey Protein (1 scoop)', protein: 25, unit: '1 scoop', region: 'supplement' },
  { food: 'Casein Protein (1 scoop)', protein: 24, unit: '1 scoop', region: 'supplement' },
  { food: 'Plant Protein (1 scoop)', protein: 20, unit: '1 scoop', region: 'supplement' },
  { food: 'Mass Gainer (1 scoop)', protein: 30, unit: '1 scoop', region: 'supplement' },
  { food: 'BCAA (10g serving)', protein: 7, unit: '10g', region: 'supplement' },
  { food: 'Creatine (5g)', protein: 0, unit: '5g', region: 'supplement' },
  { food: 'Egg Protein Powder (1 scoop)', protein: 24, unit: '1 scoop', region: 'supplement' },
  { food: 'Collagen Peptides (1 scoop)', protein: 10, unit: '1 scoop', region: 'supplement' },
  // ── North Indian ──
  { food: 'Paneer (100g)', protein: 18, unit: '100g', region: 'north' },
  { food: 'Dal Makhani (1 cup)', protein: 11, unit: '1 cup', region: 'north' },
  { food: 'Rajma / Kidney Beans (1 cup)', protein: 13, unit: '1 cup', region: 'north' },
  { food: 'Chole / Chickpeas (1 cup)', protein: 15, unit: '1 cup', region: 'north' },
  { food: 'Moong Dal (1 cup cooked)', protein: 14, unit: '1 cup', region: 'north' },
  { food: 'Urad Dal (1 cup cooked)', protein: 13, unit: '1 cup', region: 'north' },
  { food: 'Chana Dal (1 cup cooked)', protein: 14, unit: '1 cup', region: 'north' },
  { food: 'Arhar / Toor Dal (1 cup)', protein: 12, unit: '1 cup', region: 'north' },
  { food: 'Besan / Chickpea Flour (100g)', protein: 22, unit: '100g', region: 'north' },
  { food: 'Soya Chunks (100g dry)', protein: 52, unit: '100g', region: 'north' },
  { food: 'Chapati / Roti (1)', protein: 3, unit: '1 roti', region: 'north' },
  { food: 'Paratha (1 plain)', protein: 4, unit: '1 piece', region: 'north' },
  { food: 'Aloo Paratha (1)', protein: 5, unit: '1 piece', region: 'north' },
  { food: 'Stuffed Paneer Paratha (1)', protein: 10, unit: '1 piece', region: 'north' },
  { food: 'Sattu (50g)', protein: 11, unit: '50g', region: 'north' },
  { food: 'Makki di Roti (1)', protein: 3, unit: '1 roti', region: 'north' },
  { food: 'Sarson da Saag (1 cup)', protein: 5, unit: '1 cup', region: 'north' },
  { food: 'Curd / Dahi (100g)', protein: 4, unit: '100g', region: 'north' },
  { food: 'Lassi (300ml full fat)', protein: 8, unit: '300ml', region: 'north' },
  { food: 'Paneer Bhurji (100g)', protein: 14, unit: '100g', region: 'north' },
  { food: 'Shahi Paneer (1 cup)', protein: 13, unit: '1 cup', region: 'north' },
  { food: 'Dal Tadka (1 cup)', protein: 10, unit: '1 cup', region: 'north' },
  { food: 'Sprouts Chaat (1 cup)', protein: 14, unit: '1 cup', region: 'north' },
  { food: 'Peas (matar) (1 cup)', protein: 8, unit: '1 cup', region: 'north' },
  { food: 'Mutton Curry (100g)', protein: 20, unit: '100g', region: 'north' },
  { food: 'Chicken Curry (100g)', protein: 22, unit: '100g', region: 'north' },
  { food: 'Egg Curry (2 eggs)', protein: 13, unit: '2 eggs', region: 'north' },
  { food: 'Tandoori Chicken (100g)', protein: 28, unit: '100g', region: 'north' },
  { food: 'Seekh Kebab (2 pieces)', protein: 18, unit: '2 pcs', region: 'north' },
  { food: 'Rice (1 cup cooked)', protein: 4, unit: '1 cup', region: 'north' },
  { food: 'Khichdi (1 cup)', protein: 7, unit: '1 cup', region: 'north' },
  // ── South Indian ──
  { food: 'Idli (2 pieces)', protein: 4, unit: '2 pcs', region: 'south' },
  { food: 'Dosa (1 medium)', protein: 3, unit: '1 piece', region: 'south' },
  { food: 'Masala Dosa (1)', protein: 6, unit: '1 piece', region: 'south' },
  { food: 'Set Dosa (2 pieces)', protein: 5, unit: '2 pcs', region: 'south' },
  { food: 'Uttapam (1 medium)', protein: 5, unit: '1 piece', region: 'south' },
  { food: 'Rava Upma (1 cup)', protein: 5, unit: '1 cup', region: 'south' },
  { food: 'Rava Idli (2 pieces)', protein: 5, unit: '2 pcs', region: 'south' },
  { food: 'Pongal (1 cup)', protein: 6, unit: '1 cup', region: 'south' },
  { food: 'Sambar (1 cup)', protein: 5, unit: '1 cup', region: 'south' },
  { food: 'Rasam (1 cup)', protein: 2, unit: '1 cup', region: 'south' },
  { food: 'Kootu (1 cup)', protein: 6, unit: '1 cup', region: 'south' },
  { food: 'Curd Rice (1 cup)', protein: 5, unit: '1 cup', region: 'south' },
  { food: 'Puttu + Kadala (1 serving)', protein: 10, unit: '1 serving', region: 'south' },
  { food: 'Appam (2 pieces)', protein: 4, unit: '2 pcs', region: 'south' },
  { food: 'Vada (2 medu vada)', protein: 6, unit: '2 pcs', region: 'south' },
  { food: 'Pesarattu / Moong Dosa (1)', protein: 7, unit: '1 piece', region: 'south' },
  { food: 'Adai Dosa (1)', protein: 8, unit: '1 piece', region: 'south' },
  { food: 'Boiled Egg Curry (2 eggs)', protein: 13, unit: '2 eggs', region: 'south' },
  { food: 'Fish Curry (100g)', protein: 20, unit: '100g', region: 'south' },
  { food: 'Rohu / Catla Fish (100g)', protein: 18, unit: '100g', region: 'south' },
  { food: 'Prawn Masala (100g)', protein: 22, unit: '100g', region: 'south' },
  { food: 'Chicken Chettinad (100g)', protein: 25, unit: '100g', region: 'south' },
  { food: 'Mutton Curry (100g)', protein: 20, unit: '100g', region: 'south' },
  { food: 'Toor Dal / Sambar Dal (1 cup)', protein: 12, unit: '1 cup', region: 'south' },
  { food: 'Paruppu / Dal (1 cup)', protein: 12, unit: '1 cup', region: 'south' },
  { food: 'Rajma Sundal (1 cup)', protein: 13, unit: '1 cup', region: 'south' },
  { food: 'Kaala Chana Sundal (1 cup)', protein: 12, unit: '1 cup', region: 'south' },
  { food: 'Sprouts Sundal (1 cup)', protein: 10, unit: '1 cup', region: 'south' },
  { food: 'Coconut Milk (100ml)', protein: 2, unit: '100ml', region: 'south' },
  { food: 'Paniyaram (4 pieces)', protein: 6, unit: '4 pcs', region: 'south' },
  { food: 'Idiyappam + Egg Curry (1 srv)', protein: 12, unit: '1 serving', region: 'south' },
];

const PROTEIN_PAGE_SIZE = 15;
let proteinPage = 0;
let proteinActiveRegion = 'all';
let proteinActiveQuery = '';

const REGION_LABELS = { all:'🌐 All', north:'🌾 North Indian', south:'🌴 South Indian', global:'🥩 Global', supplement:'💊 Supplements' };

function initProteinGuide() {
  proteinPage = 0;
  proteinActiveRegion = 'all';
  proteinActiveQuery = '';
  renderProteinTable();
}
function setProteinRegion(region, btn) {
  proteinActiveRegion = region;
  proteinPage = 0;
  document.querySelectorAll('#sec-guide .tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderProteinTable();
}
function filterProtein(query) {
  proteinActiveQuery = query;
  proteinPage = 0;
  renderProteinTable();
}
function proteinChangePage(dir) {
  const filtered = getFilteredProtein();
  const maxPage = Math.ceil(filtered.length / PROTEIN_PAGE_SIZE) - 1;
  proteinPage = Math.max(0, Math.min(proteinPage + dir, maxPage));
  renderProteinTable();
}
function getFilteredProtein() {
  return PROTEIN_DATA
    .filter(f => proteinActiveRegion === 'all' || f.region === proteinActiveRegion)
    .filter(f => !proteinActiveQuery || f.food.toLowerCase().includes(proteinActiveQuery.toLowerCase()))
    .sort((a, b) => b.protein - a.protein);
}
function renderProteinTable() {
  const data = getFilteredProtein();
  const container = document.getElementById('proteinTable');
  const pagination = document.getElementById('proteinPagination');
  if (data.length === 0) {
    container.innerHTML = '<p class="text-center p-4 text-sm" style="color:var(--text-secondary);">No results</p>';
    if (pagination) pagination.style.display = 'none';
    return;
  }
  const totalPages = Math.ceil(data.length / PROTEIN_PAGE_SIZE);
  const start = proteinPage * PROTEIN_PAGE_SIZE;
  const page = data.slice(start, start + PROTEIN_PAGE_SIZE);
  const regionColors = { north:'#FF9F43', south:'#00D68F', global:'#38BDF8', supplement:'#8B5CF6' };
  container.innerHTML = page.map(f => {
    const rc = regionColors[f.region] || 'var(--text-secondary)';
    const rl = { north:'N', south:'S', global:'G', supplement:'💊' }[f.region] || '';
    return `
    <div class="protein-row flex items-center justify-between px-4 py-3 transition-colors">
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium">${f.food}</div>
        <div class="flex items-center gap-2 mt-0.5">
          <span class="text-xs" style="color:var(--text-secondary);">per ${f.unit}</span>
          ${f.region !== 'all' ? `<span class="text-xs font-bold px-1.5 py-0.5 rounded" style="background:${rc}22;color:${rc};">${rl}</span>` : ''}
        </div>
      </div>
      <div class="text-lg font-bold flex-shrink-0" style="color:#00D68F;">${f.protein}g</div>
    </div>`;
  }).join('');
  if (pagination) {
    pagination.style.display = totalPages > 1 ? 'flex' : 'none';
    document.getElementById('proteinPageInfo').textContent = `Page ${proteinPage + 1} / ${totalPages}  (${data.length} foods)`;
    document.getElementById('proteinPrev').disabled = proteinPage === 0;
    document.getElementById('proteinNext').disabled = proteinPage >= totalPages - 1;
  }
}

// ===================== TOAST =====================
function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#1F2937;color:white;padding:10px 20px;border-radius:20px;font-size:14px;z-index:100;border:1px solid #374151;box-shadow:0 4px 20px rgba(0,0,0,0.4);white-space:nowrap;';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ===================== MEAL TEMPLATES =====================
let activeTplMeal = null;

function getTemplates() {
  try { return JSON.parse(localStorage.getItem('fitlog_templates') || '{}'); } catch { return {}; }
}
function setTemplates(t) { localStorage.setItem('fitlog_templates', JSON.stringify(t)); }

function openTplModal(meal) {
  activeTplMeal = meal;
  document.getElementById('tplMealTarget').textContent = 'Templates for: ' + meal.charAt(0).toUpperCase() + meal.slice(1);
  document.getElementById('tplName').value = '';
  const currentProtein = parseFloat(document.getElementById('f-protein-' + meal)?.value) || 0;
  document.getElementById('tplProtein').value = currentProtein;
  renderTplList();
  document.getElementById('tplModal').style.display = 'flex';
}
function closeTplModal() {
  document.getElementById('tplModal').style.display = 'none';
  activeTplMeal = null;
}
function renderTplList() {
  const templates = getTemplates();
  const list = templates[activeTplMeal] || [];
  const container = document.getElementById('tplList');
  if (list.length === 0) {
    container.innerHTML = '<p class="text-sm text-center py-4" style="color:var(--text-secondary);">No templates yet. Save one below.</p>';
    return;
  }
  container.innerHTML = list.map((t, i) => `
    <div class="card2 p-3 rounded-xl flex items-center justify-between gap-2">
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold truncate">${t.name}</div>
        <div class="text-xs mt-0.5 truncate" style="color:var(--text-secondary);">${t.desc} · ${t.protein}g protein</div>
      </div>
      <div class="flex gap-2 flex-shrink-0">
        <button onclick="applyTemplate(${i})" class="tpl-chip text-xs">Use</button>
        <button onclick="deleteTemplate(${i})" style="color:var(--text-secondary);background:none;border:none;cursor:pointer;font-size:16px;">✕</button>
      </div>
    </div>
  `).join('');
}
function saveTemplate() {
  const name = document.getElementById('tplName').value.trim();
  if (!name) { showToast('Enter a template name'); return; }
  const desc = document.getElementById('f-meal-' + activeTplMeal).value.trim();
  const protein = parseFloat(document.getElementById('tplProtein').value) || 0;
  const templates = getTemplates();
  if (!templates[activeTplMeal]) templates[activeTplMeal] = [];
  templates[activeTplMeal].push({ name, desc, protein });
  setTemplates(templates);
  document.getElementById('tplName').value = '';
  renderTplList();
  showToast('Template saved ✓');
}
function applyTemplate(i) {
  const templates = getTemplates();
  const t = (templates[activeTplMeal] || [])[i];
  if (!t) return;
  document.getElementById('f-meal-' + activeTplMeal).value = t.desc;
  document.getElementById('f-protein-' + activeTplMeal).value = t.protein;
  updateTotalProtein();
  closeTplModal();
  showToast('Template applied ✓');
}
function deleteTemplate(i) {
  const templates = getTemplates();
  templates[activeTplMeal].splice(i, 1);
  setTemplates(templates);
  renderTplList();
}

// ===================== ONBOARDING =====================
function showOnboarding() {
  document.getElementById('onboardModal').style.display = 'flex';
}
function closeOnboarding() {
  document.getElementById('onboardModal').style.display = 'none';
  localStorage.setItem('fitlog_onboarded', '1');
}
function checkOnboarding() {
  const done = localStorage.getItem('fitlog_onboarded');
  const hasLogs = Object.keys(getLogs()).length > 0;
  if (!done && !hasLogs) {
    setTimeout(() => showOnboarding(), 800);
  }
}

// ===================== BACKUP REMINDER =====================
function checkBackupReminder() {
  const lastBackup = localStorage.getItem('fitlog_last_backup');
  const logs = getLogs();
  if (Object.keys(logs).length === 0) return;
  if (!lastBackup) { showBackupBanner(); return; }
  const daysSince = (Date.now() - parseInt(lastBackup)) / 86400000;
  if (daysSince >= 7) showBackupBanner();
}
function showBackupBanner() {
  const el = document.getElementById('backupBanner');
  if (el) el.style.display = 'flex';
}
function dismissBackup() {
  localStorage.setItem('fitlog_last_backup', Date.now().toString());
  const el = document.getElementById('backupBanner');
  if (el) el.style.display = 'none';
}

// Override exportData to also track last backup time
const _origExport = exportData;
function exportData() {
  const data = { logs: getLogs(), reviews: getReviews(), exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'fitlog-backup-' + todayStr() + '.json';
  a.click();
  localStorage.setItem('fitlog_last_backup', Date.now().toString());
  dismissBackup();
  showToast('Backup downloaded ✓');
}

// ===================== OLLAMA STATUS ENHANCED =====================
function syncOllamaStatusSidebar(cls, text) {
  const el = document.getElementById('ollamaStatusSidebar');
  if (el) { el.className = 'badge ' + cls; el.textContent = text; }
}
async function checkOllama() {
  const statusEl = document.getElementById('ollamaStatus');
  const aiStatusEl = document.getElementById('aiEngineStatus');
  const ollamaBtn = document.getElementById('reviewBtnOllama');
  const geminiBtn = document.getElementById('reviewBtnGemini');
  const descEl = document.getElementById('aiEngineDesc');

  try {
    const res = await fetch(settings.ollamaUrl + '/api/tags', { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      const models = (data.models || []).map(m => m.name);
      const hasModel = models.some(m => m.includes(settings.ollamaModel.split(':')[0]));
      statusEl.className = 'badge badge-green';
      statusEl.textContent = '● Ollama Online';
      syncOllamaStatusSidebar('badge-green', '● Ollama Online');
      if (aiStatusEl) { aiStatusEl.className = 'badge badge-green'; aiStatusEl.textContent = 'Ollama Online ✓'; }
      if (descEl) descEl.textContent = `Model: ${settings.ollamaModel}${hasModel ? ' ✓' : ' (not pulled yet)'}`;
      if (ollamaBtn) ollamaBtn.disabled = false;
    } else throw new Error();
  } catch {
    statusEl.className = 'badge badge-red';
    statusEl.textContent = '● Ollama Offline';
    syncOllamaStatusSidebar('badge-red', '● Ollama Offline');
    if (aiStatusEl) {
      if (settings.geminiKey) {
        aiStatusEl.className = 'badge badge-blue';
        aiStatusEl.textContent = 'Gemini Ready';
        if (descEl) descEl.textContent = 'Ollama offline → use Gemini or Copy Prompt';
      } else {
        aiStatusEl.className = 'badge badge-red';
        aiStatusEl.textContent = 'No AI engine';
        if (descEl) descEl.textContent = 'Start Ollama or add Gemini key in Settings';
      }
    }
    if (ollamaBtn) ollamaBtn.disabled = false; // still let them try
  }
  if (geminiBtn) geminiBtn.disabled = !settings.geminiKey;
}

// Run on load (script is at end of body, DOM is ready)
initApp();
checkOnboarding();
checkBackupReminder();

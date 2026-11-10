// Życie miasteczka: ilu Groszaków jest na ulicach, dokąd idą i kiedy oddają
// okruszki. Bez DOM – rysowaniem zajmuje się miasteczko.js.
//
// Cykl Groszaka:  do pracy → praca → powrót z okruszkiem → kolejka przy drzwiach
// Skarbca → (tyknięcie salda co 10 s) oddanie okruszka → znów do pracy.
// Animacja odzwierciedla przyrost salda, ale go nie wylicza.

import { findPath, makeRoute, routePosition, nearestNode } from './trasy.js';
import { groszakiCrew } from './liczenie.js';
import { t } from './teksty.js';
import { jobFor } from './zycie.js';

const WALK = 34;          // px mapy na sekundę przy rozmiarze 22
const QUEUE_GAP = 9;      // odstęp między rzędami kolejki przy drzwiach
const QUEUE_LANES = [0, -0.75, 0.75];   // czekają po trzech obok siebie
const BASE_SIZE = 22;

export class TownSim {
  /**
   * graph – z buildGraph(trasy.json); makePuppet(opts) – tworzy kukiełkę
   * (createGroszak); rand – generator liczb losowych (do testów).
   */
  constructor({ graph, makePuppet, rand = Math.random, baseSize = BASE_SIZE, formatMoney = (m) => String(m) }) {
    this.graph = graph;
    this.makePuppet = makePuppet;
    this.rand = rand;
    this.baseSize = baseSize;
    this.formatMoney = formatMoney;
    this.entities = [];
    this.queue = [];
    this.effects = [];
    this.spawnAt = [];
    this.crew = { count: 0, near: 0, far: 0, perGroszak: 0 };
    this.balance = 0;
    this.sleeper = null;
    this.nextId = 1;
    this.now = 0;
  }

  // ------------------------------------------------------------ miejsca
  get places() { return this.graph.places; }
  work(zone) {
    const list = this.places.praca.filter((w) => w.strefa === zone);
    return list[Math.floor(this.rand() * list.length)];
  }
  route(from, to) {
    const ids = findPath(this.graph, from, to, this.rand) || [from];
    return makeRoute(this.graph, ids);
  }
  /** Trasa z bieżącej pozycji (między punktami) do celu. */
  routeFromHere(e, to) {
    const startId = nearestNode(this.graph, e.g.x, e.g.y);
    const ids = findPath(this.graph, startId, to, this.rand) || [startId];
    const here = { x: e.g.x, y: e.g.y, s: this.graph.nodes.get(startId).s };
    return makeRoute(this.graph, [here, ...ids]);
  }

  // ------------------------------------------------------------ saldo
  /**
   * Ustawia saldo (µg) i próg. reason: 'init' | 'deposit' | 'withdrawal' | 'tick'.
   * Liczba Groszaków dopasowuje się: nowi wybiegają ze Skarbca, nadmiarowi
   * zakładają plecaki i wyruszają po marzenie.
   */
  setBalance(balance, threshold, now, reason = 'tick') {
    this.now = now;
    this.balance = balance;
    this.crew = groszakiCrew(balance, threshold);
    const alive = this.alive();
    const target = this.crew.count;

    if (reason === 'init') {
      this.entities = [];
      this.queue = [];
      for (let i = 0; i < target; i++) {
        const zone = i < this.crew.near ? 'blisko' : 'daleko';
        this.entities.push(this.spawnScattered(zone, now));
      }
    } else if (alive.length < target) {
      let missing = target - alive.length - this.spawnAt.length;
      // śpiący Groszak budzi się pierwszy
      if (this.sleeper && missing > 0) {
        const e = this.sleeper;
        this.sleeper = null;
        e.g.action = 'wave';
        e.state = 'waking';
        e.until = now + 1200;
        this.entities.push(e);
        missing--;
      }
      for (let i = 0; i < missing; i++) this.spawnAt.push(now + 300 + i * 260);
    } else if (alive.length > target) {
      this.spawnAt = [];
      const leave = alive.length - target;
      // najpierw ci, którzy nie stoją w kolejce; wolna strefa zgodnie z nadwyżką
      const farExtra = alive.filter((e) => e.zone === 'daleko').length - this.crew.far;
      const order = [...alive].sort((a, b) => score(b) - score(a));
      function score(e) {
        let s = 0;
        if (e.state !== 'queue' && e.state !== 'deliver') s += 2;
        if (e.zone === 'daleko' && farExtra > 0) s += 1;
        return s;
      }
      order.slice(0, leave).forEach((e, i) => this.sendAway(e, now + i * 200, reason === 'withdrawal'));
    }

    if (target === 0 && !this.sleeper) this.sleeper = this.makeSleeper();
    if (target > 0 && reason === 'init') this.sleeper = null;
  }

  alive() { return this.entities.filter((e) => e.state !== 'leaving'); }

  /** Groszaki do narysowania (razem ze śpiącym). */
  get puppets() {
    const list = this.entities.map((e) => e.g);
    if (this.sleeper) list.push(this.sleeper.g);
    return list;
  }

  // ------------------------------------------------------------ tworzenie
  newEntity(zone) {
    const g = this.makePuppet({ size: this.baseSize, dir: this.rand() < 0.5 ? -1 : 1 });
    const lane = 0.15 + this.rand() * 0.8;   // dodatni = prawa strona idącego (ruch prawostronny)
    return {
      homeLane: lane,
      id: this.nextId++, g, zone, state: 'idle', route: null, d: 0,
      lane, speedMul: 0.85 + this.rand() * 0.3,
      target: null, workPlace: null, until: 0, running: false,
    };
  }

  makeSleeper() {
    const e = this.newEntity('blisko');
    const n = this.graph.nodes.get(this.places.sen);
    e.g.x = n.x; e.g.y = n.y;
    e.g.action = 'sleep';
    e.state = 'sleep';
    this.applySize(e);
    return e;
  }

  /** Groszak w losowym miejscu swojego cyklu (start miasteczka). */
  spawnScattered(zone, now) {
    const e = this.newEntity(zone);
    const r = this.rand();
    e.workPlace = this.work(zone);
    if (r < 0.4) {
      this.goTo(e, this.places.drzwi, e.workPlace.punkt, 'toWork');
      e.d = this.rand() * e.route.length;
    } else if (r < 0.65) {
      this.goTo(e, this.places.drzwi, e.workPlace.punkt, 'toWork');
      e.d = e.route.length;
      this.startWork(e, now);
      e.until = now + this.rand() * 6000;
    } else {
      this.goTo(e, e.workPlace.punkt, this.places.drzwi, 'toVault');
      e.g.carry = true;
      e.d = this.rand() * e.route.length * 0.9;
    }
    this.place(e);
    return e;
  }

  spawnFromVault(now) {
    // strefa według braków: najpierw blisko do progu, potem farma
    const near = this.alive().filter((e) => e.zone === 'blisko').length;
    const zone = near < this.crew.near ? 'blisko' : 'daleko';
    const e = this.newEntity(zone);
    e.workPlace = this.work(zone);
    this.goTo(e, this.places.drzwi, e.workPlace.punkt, 'toWork');
    e.running = true;
    this.place(e);
    this.entities.push(e);
    return e;
  }

  goTo(e, from, to, state) {
    e.route = this.route(from, to);
    e.d = 0;
    e.state = state;
    e.target = to;
  }

  sendAway(e, when, withdrawal) {
    this.queue = this.queue.filter((q) => q !== e);
    e.state = 'leaving';
    e.leaveAt = when;
    e.g.carry = false;
    e.g.load = false;
    e.g.pack = true;
    const exits = this.places.wyjscia;
    e.target = exits[Math.floor(this.rand() * exits.length)];
    e.route = this.routeFromHere(e, e.target);
    e.d = 0;
    e.running = false;
    e.withdrawal = withdrawal;
  }

  startWork(e, now) {
    e.state = 'working';
    e.g.carry = false;
    e.g.job = jobFor(e.workPlace?.punkt);
    e.g.action = e.g.job.action;
    e.g.dir = 1;
    e.running = false;
    const far = e.zone === 'daleko';
    e.until = now + (far ? 5000 + this.rand() * 6000 : 2500 + this.rand() * 4500);
    e.nextTurn = now + 800 + this.rand() * 1500;
  }

  startTrip(e) {
    // dopasuj strefę do bieżącego podziału salda
    const near = this.alive().filter((x) => x.zone === 'blisko').length;
    if (e.zone === 'blisko' && near > this.crew.near) e.zone = 'daleko';
    else if (e.zone === 'daleko' && near < this.crew.near) e.zone = 'blisko';
    e.workPlace = this.work(e.zone);
    e.route = this.routeFromHere(e, e.workPlace.punkt);
    e.d = 0;
    e.state = 'toWork';
    e.target = e.workPlace.punkt;
  }

  // ------------------------------------------------------------ tyknięcie
  /** Co 10 s: Groszaki z kolejki oddają okruszki (razem z aktualizacją salda). */
  tick(now) {
    const delivered = this.queue.splice(0);
    const door = this.graph.nodes.get(this.places.drzwi);
    delivered.forEach((e, i) => {
      e.state = 'deliver';
      e.until = now + 500 + i * 140;
      this.effects.push({ type: 'crumb', x0: e.g.x, y0: e.g.y - e.g.size * 1.2, x1: door.x, y1: door.y - 14,
                          t0: now + i * 140, dur: 520 });
      e.g.carry = false;
    });
    if (delivered.length) this.effects.push({ type: 'sparkle', x: door.x, y: door.y - 16, t0: now + 450, dur: 900 });
    return delivered.length;
  }

  // ------------------------------------------------------------ ruch
  update(now, dt, still = false) {
    this.now = now;
    while (this.spawnAt.length && this.spawnAt[0] <= now) {
      this.spawnAt.shift();
      if (this.alive().length < this.crew.count) this.spawnFromVault(now);
    }
    this.effects = this.effects.filter((f) => now < f.t0 + f.dur);
    if (still) {
      // bez animacji: odchodzący znikają od razu, nowi stoją już przy pracy
      for (const e of this.entities) {
        if (e.state === 'leaving') e.gone = true;
        else if (e.state !== 'working') {
          e.workPlace ||= this.work(e.zone);
          e.route = this.route(this.places.drzwi, e.workPlace.punkt);
          e.d = e.route.length; this.place(e); this.startWork(e, now); e.until = Infinity;
        }
        else e.until = Infinity;
      }
    }
    for (const e of this.entities) this.step(e, now, still ? 0 : dt);
    this.entities = this.entities.filter((e) => !e.gone);
    if (this.sleeper) this.applySize(this.sleeper);
  }

  step(e, now, dt) {
    const g = e.g;
    g.load = e.state === 'toWork' && jobFor(e.workPlace?.punkt).action === 'sack';
    switch (e.state) {
      case 'toWork':
      case 'toVault':
      case 'leaving': {
        if (e.state === 'leaving' && now < e.leaveAt) { g.action = 'idle'; break; }
        let stopAt = e.route.length;
        if (e.state === 'toVault') {
          const slot = this.queue.length;
          stopAt = Math.max(0, e.route.length - 4 - Math.floor(slot / QUEUE_LANES.length) * QUEUE_GAP);
          // przed kolejką Groszak schodzi na swój pas w rzędzie
          if (e.d > stopAt - 70) e.laneTarget = QUEUE_LANES[slot % QUEUE_LANES.length];
        } else e.laneTarget = undefined;
        this.walk(e, dt, stopAt);
        if (e.d >= stopAt - 0.01) {
          if (e.state === 'toWork') this.startWork(e, now);
          else if (e.state === 'toVault') { e.state = 'queue'; this.queue.push(e); g.action = 'idle'; }
          else {
            // wyjście z mapy: znika powoli
            e.fade = (e.fade ?? 1) - dt * 1.4;
            g.alpha = e.fade;
            g.action = 'walk';
            if (e.fade <= 0) e.gone = true;
          }
        }
        break;
      }
      case 'working':
        g.action = g.job?.action || 'idle';
        g.dir = 1;
        if (now > e.until) {
          g.action = 'walk';
          g.carry = true;
          e.route = this.route(e.workPlace.punkt, this.places.drzwi);
          e.d = 0;
          e.state = 'toVault';
          e.target = this.places.drzwi;
        }
        break;
      case 'queue':
        g.action = 'idle';
        break;
      case 'deliver':
        g.action = 'wave';
        if (now > e.until) { g.action = 'idle'; this.startTrip(e); }
        break;
      case 'waking':
        if (now > e.until) {
          e.workPlace = this.work(e.zone);
          e.route = this.routeFromHere(e, e.workPlace.punkt);
          e.d = 0; e.state = 'toWork'; e.running = true; g.action = 'walk';
        }
        break;
      default:
        break;
    }
    this.applySize(e);
  }

  walk(e, dt, stopAt) {
    const g = e.g;
    if (e.laneTarget !== undefined) {
      const dl = e.laneTarget - e.lane;
      e.lane += Math.sign(dl) * Math.min(Math.abs(dl), dt * 1.5);
    } else if (e.homeLane !== undefined && e.lane !== e.homeLane) {
      const dl = e.homeLane - e.lane;
      e.lane += Math.sign(dl) * Math.min(Math.abs(dl), dt * 1.5);
    }
    const before = routePosition(e.route, e.d, e.lane);
    const stairsK = before.onStairs ? 0.72 : 1;
    const run = e.running ? 1.7 : e.state === 'leaving' ? 1.35 : 1;
    const v = WALK * (g.size / BASE_SIZE) * e.speedMul * stairsK * run;
    e.d = Math.min(stopAt, e.d + v * dt);
    const p = routePosition(e.route, e.d, e.lane);
    g.x = p.x; g.y = p.y;
    if (Math.abs(p.dirX) > 0.5) g.dir = p.dirX > 0 ? 1 : -1;
    g.action = e.d < stopAt - 0.01 || e.state === 'leaving' ? 'walk' : 'idle';
    g.speed = stairsK * run * e.speedMul;
  }

  place(e) {
    const p = routePosition(e.route, e.d, e.lane);
    e.g.x = p.x; e.g.y = p.y;
    this.applySize(e);
  }

  applySize(e) {
    // dalej od widza (wyżej na mapie) – trochę mniejszy
    const k = Math.min(1, Math.max(0, (e.g.y - 300) / (1060 - 300)));
    e.g.size = this.baseSize * (0.8 + 0.2 * k);
  }

  // ------------------------------------------------------------ dymki
  /** Co mówi Groszak po dotknięciu. */
  describe(g) {
    if (this.sleeper && this.sleeper.g === g) return t('dymek.sen');
    const e = this.entities.find((x) => x.g === g);
    if (!e) return '';
    const texts = e.workPlace?.teksty || [];
    let line;
    switch (e.state) {
      case 'toWork': line = e.running ? t('dymek.biegne') : t('dymek.doPracy', { miejsce: e.workPlace?.nazwa ?? '' }); break;
      case 'working': line = e.g.job?.text || texts[Math.floor(this.rand() * texts.length)] || t('dymek.doPracy', { miejsce: e.workPlace?.nazwa ?? '' }); break;
      case 'toVault': line = e.d < e.route.length / 2 ? t('dymek.wracam') : t('dymek.niose'); break;
      case 'queue': line = t('dymek.kolejka'); break;
      case 'deliver': line = t('dymek.oddaje'); break;
      case 'leaving': line = t('dymek.marzenie'); break;
      default: line = t('dymek.biegne');
    }
    if (this.crew.count >= 80 && e.state !== 'leaving') {
      line += ' · ' + t('dymek.wartosc', { kwota: this.formatMoney(this.crew.perGroszak) });
    }
    return line;
  }

  /** Po zmianie sieci tras (edytor): przelicz trasy idących Groszaków. */
  setGraph(graph) {
    this.graph = graph;
    for (const e of this.entities) {
      if (['toWork', 'toVault', 'leaving'].includes(e.state) && graph.nodes.has(e.target)) {
        e.route = this.routeFromHere(e, e.target);
        e.d = 0;
      }
      if (e.workPlace && !graph.nodes.has(e.workPlace.punkt)) e.workPlace = this.work(e.zone);
    }
  }
}

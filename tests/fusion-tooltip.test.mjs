import test from 'node:test';
import assert from 'node:assert/strict';
import { createFusionController, fusionTooltipPlacement, fusionTooltipTransit } from '../src/fusion-controller.js';
import { newGame, makeItem } from '../src/engine.js';

const rect = (left, top, width, height) => ({ left, top, right:left + width, bottom:top + height, width, height });
const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

test('passive details never occupy the card pool, settlement, trigger or details access control', () => {
  for (const [width, height] of [[1366,768], [1440,900], [1920,1080], [2560,1440], [3840,2160]]) {
    const pool = rect(28, 357, width - 370, height - 490), settlement = rect(width - 328, 209, 302, height - 305);
    const dock = rect(width - 315, height - 320, 277, 220), detailsTrigger = rect(width - 444, 211, 80, 30);
    for (const anchor of [rect(28,357,172,95), rect(width - 540,357,172,95), rect(28,height - 230,172,95), rect(142,130,width - 168,69)]) {
      const p = fusionTooltipPlacement({ viewportWidth:width, viewportHeight:height, anchor, pool, settlement, dock, detailsTrigger, width:390, height:660 });
      assert(p, `${width}: at least one readable safe rectangle exists`);
      const panel = rect(p.left, p.top, p.width, p.height);
      assert(panel.left >= 8 && panel.top >= 8 && panel.right <= width - 8 && panel.bottom <= height - 8, `${width}: panel stays in viewport`);
      for (const obstacle of [pool, settlement, dock, anchor, detailsTrigger]) assert(!intersects(panel, obstacle), `${width}: never cover protected input or totals`);
    }
  }
});

test('a scrolled narrow pool without free reading space uses the explicit dialog path', () => {
  const p = fusionTooltipPlacement({ viewportWidth:390, viewportHeight:844, pool:rect(24,-800,342,1800),
    dock:rect(10,585,370,250), settlement:rect(24,1000,342,300), anchor:rect(24,210,166,105) });
  assert.equal(p, null);
});

test('dense controls and repeated pool rectangles leave a safe preview without consuming input space', () => {
  const anchor = rect(28,666,172,95), pool = rect(28,357,1070,415), settlement = rect(1110,209,304,595);
  const controls = [rect(1140,16,75,40), rect(1230,16,75,40), rect(1320,16,75,40), rect(1120,76,90,40),
    rect(142,130,1272,69), rect(28,256,345,35), rect(384,256,230,35), rect(625,256,260,35), rect(896,256,202,35),
    rect(28,300,165,32), rect(204,300,115,32), rect(330,300,115,32), rect(1010,211,85,30)];
  const args = { viewportWidth:1440, viewportHeight:900, anchor, pool, settlement, controls };
  const p = fusionTooltipPlacement(args); assert(p, 'dense desktop retains a scrollable safe strip');
  const panel = rect(p.left,p.top,p.width,p.height); assert(panel.height >= 96);
  for (const block of [pool, settlement, anchor, ...controls]) assert(!intersects(panel,block), 'all controls remain outside the preview');
  const repeated = [...controls, ...Array.from({ length:10000 }, (_, index) => rect(28 + index % 6 * 179,357 + index % 4 * 103,172,95))];
  assert.deepEqual(fusionTooltipPlacement({ ...args, controls:repeated }), p, 'duplicate/nested controls do not fragment safe candidates');
});

test('transit corridors connect all four panel directions without capturing same-row browsing', () => {
  const anchor = rect(400,400,172,95);
  const cases = [
    { panel:rect(300,8,390,112), inside:[{x:480,y:230},{x:535,y:355}], outside:{x:650,y:448} },
    { panel:rect(300,750,390,112), inside:[{x:480,y:600}], outside:{x:650,y:448} },
    { panel:rect(8,250,260,350), inside:[{x:325,y:425}], outside:{x:486,y:600} },
    { panel:rect(900,250,260,350), inside:[{x:700,y:425}], outside:{x:486,y:600} },
  ];
  for (const {panel,inside,outside} of cases) {
    for (const point of inside) assert(fusionTooltipTransit({ anchor,panel,...point }));
    assert.equal(fusionTooltipTransit({ anchor,panel,...outside }), false);
  }
  assert.equal(fusionTooltipTransit({ anchor,panel:cases[0].panel }), false, 'missing pointer coordinates never latch transit');
});

// Deterministic event/timer probes cover dismissal races and transaction
// boundaries. These small DOM doubles do not claim layout or browser focus QA;
// scripts/qa-fusion-tooltip.mjs exercises those with native browser input.
function harness(t) {
  t.mock.timers.enable({ apis:['setTimeout','Date'], now:20261018 });
  const previous = Object.fromEntries(['document','window','innerWidth','innerHeight'].map(key => [key, globalThis[key]]));
  let doc, app;
  class Node {
    constructor(dataset = {}, bounds = rect(28,357,172,95)) { this.dataset = dataset; this.bounds = bounds; this.handlers = {}; this.attributes = {}; this.style = {}; this.isConnected = true; this.hidden = true; this.open = false; this.offsetWidth = 390; this.offsetHeight = 660; this.tabIndex = -1; }
    addEventListener(name, fn) { (this.handlers[name] ||= []).push(fn); }
    emit(name, fields = {}) { for (const fn of this.handlers[name] || []) fn({ target:this, preventDefault() {}, ...fields }); }
    closest(selector) { return selector.includes('data-fusion-') && (this.dataset.fusionItem || this.dataset.fusionTooltip) ? this : null; }
    contains(node) { return node === this || node?.parent === this || this.parts?.includes(node); }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    getBoundingClientRect() {
      return this.className === 'fusion-item-tooltip' && this.style.left != null
        ? rect(parseFloat(this.style.left),parseFloat(this.style.top),parseFloat(this.style.width),Math.min(this.offsetHeight,parseFloat(this.style.maxHeight))) : this.bounds;
    }
    set innerHTML(value) {
      this.html = value;
      if (this.className === 'fusion-item-details') { this.content = new Node(); this.closeButton = new Node(); this.keys = new Node(); this.parts = [this.content, this.closeButton, this.keys]; }
    }
    get innerHTML() { return this.html; }
    querySelector(selector) { return selector === '.fusion-details-content' ? this.content : selector === '.fusion-details-close' ? this.closeButton : selector === '.fusion-tooltip-keys' ? this.keys : null; }
    focus() { const before = doc.activeElement; doc.activeElement = this; if (before && cards.includes(before)) app.emit('focusout', { target:before, relatedTarget:this }); if (cards.includes(this)) app.emit('focusin', { target:this, relatedTarget:before }); }
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  let state = newGame(42); state.phase = 'fusion';
  const spare = makeItem(state, 'weapon', 0); state.player.items.push(spare);
  const items = state.player.items.filter(item => item.slot === 'weapon');
  const cards = items.map((item, index) => new Node({ fusionItem:item.id, id:item.id, action:'fusion-item' }, rect(28 + index * 179,357,172,95)));
  const pool = new Node({}, rect(28,357,1070,415)), settlement = new Node({}, rect(1110,209,304,595));
  const trigger = new Node({ action:'fusion-details' }, rect(1010,211,85,30));
  const body = new Node(); body.children = []; body.append = node => body.children.push(node);
  doc = new Node(); doc.body = body; doc.createElement = () => new Node(); doc.activeElement = null;
  app = new Node(); app.querySelectorAll = selector => selector.startsWith('[data-fusion-item]') ? cards : selector.startsWith('button,') ? [...cards,trigger] : [];
  app.querySelector = selector => ({ '#fusion-pool':pool, '.fusion-settlement':settlement, '.fusion-details-trigger':trigger, '[data-action="fusion-details"]':trigger })[selector] || null;
  globalThis.document = doc; globalThis.window = new Node(); globalThis.innerWidth = 1440; globalThis.innerHeight = 900;
  const ui = { screen:'game', view:'game', busy:false, fusionSlot:'weapon', fusionTargets:[items[0].id], fusionMaterials:[], fusionFocusId:items[0].id };
  const actions = [];
  const controller = createFusionController({ app, ui, getState:() => state, isCommitting:() => false, render() {}, act:action => actions.push(action), notify() {}, confirmDialog() {}, reviewItems() {}, dialog:{ open:false }, tooltipHTML:(_s,_ui,item) => `<h3>${item.name}</h3>`, esc:String, num:String, icon:() => '', itemSummary:item => item.name });
  t.after(() => { controller.reset(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } });
  const key = (key, target = cards[0], extra = {}) => controller.handleKeydown({ key, target, preventDefault() {}, ...extra });
  const hover = anchor => app.emit('pointerover', { target:anchor, relatedTarget:body, pointerType:'mouse' });
  const leave = anchor => app.emit('pointerout', { target:anchor, relatedTarget:body, pointerType:'mouse' });
  return { app, doc, cards, ui, actions, controller, key, hover, leave, body, state:() => state, setState:s => { state = s; },
    tooltip:() => body.children.find(node => node.className === 'fusion-item-tooltip'), details:() => body.children.find(node => node.className === 'fusion-item-details') };
}

test('Escape cancels pending hover and same-anchor inner movements cannot resurrect it', t => {
  const h = harness(t), anchor = h.cards[0];
  h.hover(anchor); t.mock.timers.tick(80); h.key('Escape'); t.mock.timers.tick(200);
  assert(!h.tooltip() || h.tooltip().hidden);
  h.app.emit('pointerover', { target:anchor, relatedTarget:{ parent:anchor }, pointerType:'mouse' }); t.mock.timers.tick(200);
  assert(!h.tooltip() || h.tooltip().hidden);
  h.leave(anchor); h.hover(anchor); t.mock.timers.tick(160);
  assert.equal(h.tooltip().hidden, false); assert.equal(anchor.attributes['aria-describedby'], 'fusion-item-tooltip');
  h.key('Escape'); t.mock.timers.tick(800); assert.equal(h.tooltip().hidden, true); assert(!('aria-describedby' in anchor.attributes));
});

test('pointer transit, internal scrolling and text reading retain the passive details', t => {
  const h = harness(t), anchor = h.cards[0]; h.hover(anchor); t.mock.timers.tick(160);
  const tooltip = h.tooltip(); h.leave(anchor); t.mock.timers.tick(600); assert.equal(tooltip.hidden, false);
  tooltip.emit('pointerenter'); t.mock.timers.tick(800); assert.equal(tooltip.hidden, false);
  h.doc.emit('scroll', { target:tooltip }); assert.equal(tooltip.hidden, false);
  tooltip.emit('pointerdown'); tooltip.emit('pointerleave'); t.mock.timers.tick(800); assert.equal(tooltip.hidden, false);
  assert.equal(h.key('a', anchor, { ctrlKey:true }), true); assert.deepEqual(h.ui.fusionMaterials, []);
  let prevented = 0; h.key(' ', anchor, { preventDefault() { prevented++; } }); h.key('Enter', anchor, { preventDefault() { prevented++; } });
  assert.equal(prevented, 2, 'reading cancels native button activation as well as the controller shortcut');
  h.key('Escape'); assert.equal(tooltip.hidden, true); assert.deepEqual(h.actions, []);
});

test('a paused trip across another card retains the inspected item and exiting the corridor resumes hover', t => {
  const h = harness(t), original = h.cards[0], crossed = h.cards[1];
  original.bounds = rect(28,666,172,95); crossed.bounds = rect(28,460,172,95);
  h.hover(original); t.mock.timers.tick(160); const tooltip = h.tooltip(), originalHTML = tooltip.innerHTML;
  h.app.emit('pointerout', { target:original,relatedTarget:h.body,pointerType:'mouse',clientX:114,clientY:665 });
  h.app.emit('pointerover', { target:crossed,relatedTarget:h.body,pointerType:'mouse',clientX:140,clientY:507 });
  h.doc.emit('pointermove', { target:crossed,pointerType:'mouse',clientX:140,clientY:507 });
  t.mock.timers.tick(1500); assert.equal(tooltip.hidden,false); assert.equal(tooltip.innerHTML,originalHTML, 'a crossed card never starts its replacement timer');
  assert.equal(original.attributes['aria-describedby'],'fusion-item-tooltip'); assert(!crossed.attributes['aria-describedby']);
  // Leaving sideways while still over the same intermediate card must recover
  // ordinary hover; no new pointerover or artificial escape is required.
  crossed.bounds = rect(28,460,600,95);
  h.doc.emit('pointermove', { target:crossed,pointerType:'mouse',clientX:520,clientY:507 }); t.mock.timers.tick(160);
  assert.notEqual(tooltip.innerHTML,originalHTML); assert.equal(crossed.attributes['aria-describedby'],'fusion-item-tooltip');
  assert.deepEqual(h.actions,[]); assert.deepEqual(h.ui.fusionMaterials,[]);
});

test('a focus-only preview does not reserve intermediate cards before a pointer journey begins', t => {
  const h = harness(t), original = h.cards[0], next = h.cards[1];
  original.bounds = rect(28,666,172,95); next.bounds = rect(28,460,172,95); original.focus();
  const tooltip = h.tooltip(), previousHTML = tooltip.innerHTML;
  h.app.emit('pointerover', { target:next,relatedTarget:h.body,pointerType:'mouse',clientX:140,clientY:507 });
  t.mock.timers.tick(160); assert.notEqual(tooltip.innerHTML,previousHTML); assert.equal(next.attributes['aria-describedby'],'fusion-item-tooltip');
});

test('touch selection does not create a passive overlay; explicit details restore focus without actions', async t => {
  const h = harness(t), anchor = h.cards[1], before = JSON.stringify(h.state());
  h.app.emit('pointerover', { target:anchor, relatedTarget:h.body, pointerType:'touch' });
  h.app.emit('pointerdown', { target:anchor, pointerType:'touch' }); anchor.focus(); h.doc.emit('pointerup'); t.mock.timers.tick(200);
  assert(!h.tooltip() || h.tooltip().hidden);
  await h.controller.handleClick({}, { dataset:{ action:'fusion-details' } });
  assert.equal(h.details().open, true); assert.equal(h.doc.activeElement, h.details().content);
  assert.equal(h.key('a', h.details().content, { ctrlKey:true }), true); assert.equal(h.key(' ', h.details().content), true);
  h.key('Tab', h.details().content); assert.equal(h.doc.activeElement, h.details().closeButton);
  h.key('Tab', h.details().closeButton, { shiftKey:true }); assert.equal(h.doc.activeElement, h.details().content);
  assert.deepEqual(h.ui.fusionMaterials, []); assert.deepEqual(h.actions, []);
  h.key('Escape', h.details().content); assert.equal(h.details().open, false); assert.equal(h.doc.activeElement, anchor);
  t.mock.timers.tick(300); assert(!h.tooltip() || h.tooltip().hidden); assert.equal(JSON.stringify(h.state()), before);
});

test('touch dialog close ignores compatibility mouseover on a different exposed card', t => {
  const h = harness(t), inspected = h.cards[1], exposed = h.cards[0]; inspected.focus(); h.key('F2', inspected);
  const close = h.details().closeButton;
  h.doc.emit('pointerdown', { target:close, pointerType:'touch' }); h.doc.emit('pointerup', { target:close, pointerType:'touch' }); close.emit('click');
  h.hover(exposed); t.mock.timers.tick(1000); assert(!h.tooltip() || h.tooltip().hidden, 'no delayed compatibility preview after touch settles');
  h.leave(exposed); h.hover(exposed); t.mock.timers.tick(160); assert.equal(h.tooltip().hidden, false, 'later genuine mouse hover remains available');
});

test('an inspection survives UI-only refresh but closes on state or target change', t => {
  const h = harness(t), anchor = h.cards[1]; anchor.focus(); h.key('F2', anchor); assert.equal(h.details().open, true);
  h.ui.fusionUndo = null; h.controller.afterRender(); assert.equal(h.details().open, true, 'undo expiry is not a state change');
  h.setState({ ...h.state(), revision:h.state().revision + 1 }); h.controller.afterRender(); assert.equal(h.details().open, false);
  h.key('F2', anchor); assert.equal(h.details().open, true); h.ui.fusionTargets = [anchor.dataset.id]; h.controller.afterRender(); assert.equal(h.details().open, false);
  h.ui.busy = true; h.key('F2', anchor); assert.equal(h.details().open, false); assert.deepEqual(h.actions, []);
});

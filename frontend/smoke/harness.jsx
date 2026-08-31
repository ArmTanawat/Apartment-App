/* A jsdom driver for the ported UI. Not a test framework — it clicks through
   the paths in the verification list and prints what it found, so a change can
   be checked without opening a browser. */
import { API } from './api-base.mjs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
  { url: 'http://localhost/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.Event = dom.window.Event;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The app asks for relative paths now, because Express serves its pages. Node's
// fetch has no document to be relative to, so the suites point them at the
// development server. Nothing about the app changes; this is the harness
// standing in for the origin a browser would have.
const nodeFetch = globalThis.fetch;
globalThis.fetch = (input, init) =>
  nodeFetch(typeof input === 'string' && input.startsWith('/')
    ? API + input : input, init);
dom.window.print = () => { printed++; };
dom.window.alert = m => { alerted.push(m); };

export let printed = 0;
export const alerted = [];

const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { default: App } = await import('../src/App.jsx');

const container = document.getElementById('root');
const root = createRoot(container);

// Everything on screen now arrives over the network, so a step is not finished
// when the click returns. settle() lets the pending requests and the re-renders
// they cause run to completion before the next assertion looks at the page.
export async function settle(ms = 60){
  await act(async () => { await new Promise(r => setTimeout(r, ms)); });
  await act(async () => { await new Promise(r => setTimeout(r, 10)); });
}

await act(async () => { root.render(<App />); });
await settle(200);

export const $  = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
export const text = (sel, ctx = document) => { const e = $(sel, ctx); return e ? e.textContent.trim() : null; };
export const body = () => document.body.textContent;

export const byText = (sel, s, ctx = document) =>
  $$(sel, ctx).find(e => e.textContent.includes(s));

export async function click(el, wait = 80){
  if(!el) throw new Error('click: no element');
  await act(async () => {
    el.dispatchEvent(new dom.window.MouseEvent('mousedown', {bubbles:true}));
    el.dispatchEvent(new dom.window.MouseEvent('mouseup', {bubbles:true}));
    el.dispatchEvent(new dom.window.MouseEvent('click', {bubbles:true}));
  });
  await settle(wait);
}

// React overrides the value setter on inputs, so a plain el.value = x is not
// seen. Set through the prototype descriptor, then fire input.
export async function type(el, value, wait = 60){
  if(!el) throw new Error('type: no element');
  const proto = el.tagName === 'TEXTAREA'
    ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new dom.window.Event('input', {bubbles:true}));
  });
  await settle(wait);
}

// The meter page saves shortly after typing stops, so a value typed and then
// looked at straight away has not been written yet.
export async function typeAndSave(el, value){
  await type(el, value, 600);
}

export async function select(el, value){
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new dom.window.Event('change', {bubbles:true}));
  });
  await settle();
}

export async function nav(label){
  await click(byText('.nav a', label), 250);
}

let fails = 0;
export function check(name, cond, extra = ''){
  if(cond) console.log(`  ok   ${name}`);
  else { fails++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}
export function done(){
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  process.exit(fails ? 1 : 0);
}
export function section(s){ console.log(`\n${s}`); }

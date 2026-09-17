#!/usr/bin/env node
// Makes deep links into the /demo/ app survive a hard refresh.
//
// THE PROBLEM. GitHub Pages serves ONE 404.html per site - the one at the
// artifact root - for every unmatched path, no matter how deep. A
// 404.html inside /demo/ is simply never consulted (that's a Jekyll-site
// behaviour, and this is an artifact deploy with .nojekyll). So a request
// for /demo/callings, which has no file behind it, gets the root
// 404.html: production's index.html, built with base-href "/". The
// visitor asks for a demo page and lands in the real app's sign-in
// screen. In-app navigation is fine - Angular never round-trips - so this
// only bites on refresh, on a shared link, and on "open in new tab",
// which is exactly how someone reviews a branch on their phone.
//
// THE FIX. Two small scripts, injected at assembly time rather than into
// committed source, because this is a property of how the two apps are
// stitched into one Pages site and not something either app should carry:
//
//   - the ROOT 404.html learns to recognise a /demo/ path, stash it, and
//     bounce to /demo/, which is a real file and so actually loads;
//   - the DEMO index.html learns to put that path back with
//     history.replaceState before Angular boots, so the router sees the
//     URL the visitor actually asked for.
//
// Both run in <head>, ahead of the bundle. If sessionStorage is
// unavailable the visitor just lands on the demo dashboard - degraded,
// not broken.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STORAGE_KEY = 'avl-stake-tools:demo-deep-link';

// Bounce a 404'd /demo/* request to the demo app's real entry point.
// Guarded on the /demo/ prefix so production's own deep links (which the
// same 404.html serves) are left completely alone.
const REDIRECT = `<script>(function(){
var p=window.location.pathname;
if(p.indexOf('/demo/')!==0)return;
try{window.sessionStorage.setItem('${STORAGE_KEY}',p+window.location.search+window.location.hash);}catch(e){}
window.location.replace('/demo/');
})();</script>`;

// Restore the requested path before Angular reads location. The prefix
// check is deliberate: sessionStorage is attacker-writable in the sense
// that anything running on this origin can set it, and replaceState to an
// arbitrary value would be a needlessly sharp edge.
const RESTORE = `<script>(function(){
var k='${STORAGE_KEY}',t=null;
try{t=window.sessionStorage.getItem(k);if(t)window.sessionStorage.removeItem(k);}catch(e){}
if(t&&t.indexOf('/demo/')===0)window.history.replaceState(null,'',t);
})();</script>`;

function inject(path, snippet, label) {
  const html = readFileSync(path, 'utf8');
  const head = html.indexOf('<head>');
  if (head === -1) throw new Error(`${path}: no <head> to inject the ${label} script into`);
  const at = head + '<head>'.length;
  writeFileSync(path, html.slice(0, at) + snippet + html.slice(at));
  console.log(`[wire-demo-deep-links] ${label} -> ${path}`);
}

const out = process.argv[2];
if (!out) {
  console.error('usage: wire-demo-deep-links.mjs <pages-artifact-root>');
  process.exit(1);
}

inject(join(out, '404.html'), REDIRECT, 'redirect');
inject(join(out, 'demo', 'index.html'), RESTORE, 'restore');

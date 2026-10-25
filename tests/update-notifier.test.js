import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const notifier = readFileSync(new URL('../update-notifier.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

function watchedFiles() {
  const block = notifier.match(/const FILES = \[([\s\S]*?)\];/);
  assert.ok(block, 'update-notifier.js must define a FILES list');
  return [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

test('loads the notifier and exposes the header button and footer version slot', () => {
  assert.match(html, /<script src="update-notifier\.js" defer><\/script>/);
  assert.match(html, /id="checkUpdateBtn"/);
  assert.match(html, /class="header-actions"[\s\S]*id="checkUpdateBtn"[\s\S]*id="themeBtn"/);
  assert.match(html, /id="appVersion"/);
});

test('watches every script and stylesheet the page loads', () => {
  const watched = watchedFiles();
  const referenced = [
    ...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g),
    ...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g),
  ]
    .map((match) => match[1])
    .filter((path) => !/^https?:/.test(path));

  assert.ok(referenced.length >= 4, 'expected local scripts and the stylesheet to be found');
  for (const path of referenced) {
    assert.ok(watched.includes(path), `${path} is loaded by index.html but not watched for updates`);
  }
  assert.ok(watched.includes('./'), 'the HTML page itself should be watched');
});

test('every watched file exists in the repo', () => {
  for (const file of watchedFiles().filter((name) => name !== './')) {
    assert.doesNotThrow(() => readFileSync(new URL(`../${file}`, import.meta.url)), `${file} is missing`);
  }
});

test('never reloads on its own and offers Reload and Later', () => {
  assert.match(notifier, /A new version is available\./);
  assert.match(notifier, /textContent = 'Reload'/);
  assert.match(notifier, /textContent = 'Later'/);
  const reloadCalls = notifier.match(/location\.reload\(\)/g) || [];
  assert.equal(reloadCalls.length, 1, 'reload must only happen from the Reload button handler');
  assert.match(notifier, /reload\.addEventListener\('click', \(\) => window\.location\.reload\(\)\)/);
});

test('checks with no-store requests so a cached copy cannot hide an update', () => {
  assert.match(notifier, /cache: 'no-store'/);
});

test('banner stays on one line and the phone button keeps its width', () => {
  const banner = css.match(/\.update-banner \{[\s\S]*?\n\}/)[0];
  assert.match(banner, /flex-wrap: nowrap/);
  assert.match(css, /\.update-banner-message \{[\s\S]*?white-space: nowrap/);
  assert.match(css, /\.secondary-btn\.compact\.update-check-btn \{[^}]*width: 44px/);
});

test('announces updates only after a version has been seen before', () => {
  assert.match(notifier, /const APP_VERSION = '\d+\.\d+\.\d+'/);
  assert.match(notifier, /if \(seen && seen !== APP_VERSION\)/);
});

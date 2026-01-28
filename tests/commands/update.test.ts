import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { createUpdateCommand } from '../../src/commands/update.js';

describe('update command', () => {
  it('shows up-to-date message when versions match', async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));

    const cmd = createUpdateCommand({
      getCurrentVersion: () => '1.0.0',
      getLatestVersion: async () => '1.0.0',
      runUpdate: async () => {},
      createSpinner: () => ({
        start: function () { return this; },
        stop: () => {},
        succeed: (msg: string) => logs.push(msg),
        fail: () => {},
        text: '',
      }),
    });

    await cmd({});

    console.log = originalLog;
    assert.ok(logs.some((l) => l.includes('up to date')));
  });

  it('--check shows available update without installing', async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    let updateCalled = false;

    const cmd = createUpdateCommand({
      getCurrentVersion: () => '1.0.0',
      getLatestVersion: async () => '2.0.0',
      runUpdate: async () => {
        updateCalled = true;
      },
      createSpinner: () => ({
        start: function () { return this; },
        stop: () => {},
        succeed: () => {},
        fail: () => {},
        text: '',
      }),
    });

    await cmd({ check: true });

    console.log = originalLog;
    assert.ok(logs.some((l) => l.includes('Update available')));
    assert.strictEqual(updateCalled, false);
  });

  it('runs npm install when update available', async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    let installedVersion: string | null = null;

    const cmd = createUpdateCommand({
      getCurrentVersion: () => '1.0.0',
      getLatestVersion: async () => '2.0.0',
      runUpdate: async (version) => {
        installedVersion = version;
      },
      createSpinner: () => ({
        start: function () { return this; },
        stop: () => {},
        succeed: () => {},
        fail: () => {},
        text: '',
      }),
    });

    await cmd({});

    console.log = originalLog;
    assert.strictEqual(installedVersion, '2.0.0');
    assert.ok(logs.some((l) => l.includes('Successfully updated')));
  });

  it('--force reinstalls even when up to date', async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(' '));
    let installedVersion: string | null = null;

    const cmd = createUpdateCommand({
      getCurrentVersion: () => '1.0.0',
      getLatestVersion: async () => '1.0.0',
      runUpdate: async (version) => {
        installedVersion = version;
      },
      createSpinner: () => ({
        start: function () { return this; },
        stop: () => {},
        succeed: () => {},
        fail: () => {},
        text: '',
      }),
    });

    await cmd({ force: true });

    console.log = originalLog;
    assert.strictEqual(installedVersion, '1.0.0');
  });
});

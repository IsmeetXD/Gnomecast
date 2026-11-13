import System from 'system';
import { HotkeyManager } from './lib/hotkey.js';

const cmd = ARGV[0] || 'status';
const noDaemon = ARGV.includes('--no-daemon');
const mgr = new HotkeyManager();

async function run() {
  if (cmd === 'status') {
    print(JSON.stringify(mgr.getState()));
    return 0;
  }
  if (cmd === 'enable') {
    const state = await mgr.enableAsync({ manageDaemon: !noDaemon });
    print(JSON.stringify(state));
    return 0;
  }
  if (cmd === 'disable') {
    const state = await mgr.disableAsync({ manageDaemon: !noDaemon });
    print(JSON.stringify(state));
    return 0;
  }
  if (cmd === 'toggle') {
    const current = mgr.getState();
    const state = current.enabled
      ? await mgr.disableAsync({ manageDaemon: !noDaemon })
      : await mgr.enableAsync({ manageDaemon: !noDaemon });
    print(JSON.stringify(state));
    return 0;
  }
  printerr(`Unknown hotkey command: ${cmd}`);
  return 1;
}

try {
  const code = await run();
  if (code !== 0) System.exit(code);
} catch (e) {
  printerr(String(e && e.message ? e.message : e));
  System.exit(1);
}

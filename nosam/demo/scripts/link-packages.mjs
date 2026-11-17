// The eeao packages aren't published yet, so the demo uses their source in
// ../../typescript/packages. Point that folder at this demo's node_modules so both
// resolve the same copies of void, zod and the MCP SDK.
import { existsSync, lstatSync, symlinkSync, unlinkSync } from 'node:fs';
const link = new URL('../../../typescript/node_modules', import.meta.url).pathname;
if (existsSync(link) && !lstatSync(link).isSymbolicLink()) process.exit(0);
try { unlinkSync(link); } catch {}
symlinkSync('../nosam/demo/node_modules', link);

import { execFileSync, spawnSync } from 'node:child_process';
const git = process.platform === 'win32' ? 'C:/Program Files/Git/cmd/git.exe' : 'git';
const read = (...args) => execFileSync(git, args, {encoding:'utf8'}).trim();
if (read('branch','--show-current') !== 'main') throw new Error('Production deployment requires main. Merge feature branches first.');
if (read('status','--porcelain')) throw new Error('Commit all changes before deployment.');
if (process.argv.includes('--check')) { console.log('PASS: clean main checkout'); process.exit(0); }
execFileSync(git,['fetch','origin','main'],{stdio:'inherit'});
if (read('rev-parse','HEAD') !== read('rev-parse','origin/main')) throw new Error('Push and verify main before production deployment.');
const args=['--yes','vercel','deploy','--prod','--yes','--scope','orkesta-automation'];
const result=process.platform==='win32'
 ? spawnSync(process.env.ComSpec || 'cmd.exe',['/d','/s','/c','npx '+args.join(' ')],{stdio:'inherit',windowsHide:true})
 : spawnSync('npx',args,{stdio:'inherit'});
process.exit(result.status ?? 1);

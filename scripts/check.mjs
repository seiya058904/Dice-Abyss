import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
for(const folder of ['src','scripts'])for(const file of readdirSync(new URL('../'+folder+'/',import.meta.url)).filter(f=>/\.(mjs|js)$/.test(f))){const result=spawnSync(process.execPath,['--check',fileURLToPath(new URL('../'+folder+'/'+file,import.meta.url))],{stdio:'inherit'});if(result.error||result.status===null){console.error(`Syntax check could not run for ${folder}/${file}: ${result.error?.message||result.signal||'child process did not finish'}`);process.exit(1);}if(result.status)process.exit(result.status);}
console.log('All JavaScript modules passed syntax checks.');

import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
for(const folder of ['src','scripts'])for(const file of readdirSync(new URL('../'+folder+'/',import.meta.url)).filter(f=>/\.(mjs|js)$/.test(f))){const result=spawnSync(process.execPath,['--check',fileURLToPath(new URL('../'+folder+'/'+file,import.meta.url))],{stdio:'inherit'});if(result.status)process.exit(result.status);}
console.log('All JavaScript modules passed syntax checks.');

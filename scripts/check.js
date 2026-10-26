import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
for(const folder of ['src','scripts','test']){
  for(const name of await readdir(folder))if(name.endsWith('.js'))execFileSync(process.execPath,['--check',join(folder,name)],{stdio:'inherit'});
}
console.log('JavaScript syntax checked.');

import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ProfileStore} from './profiles.mjs';

const usage=[
  'node activate-profile.mjs list',
  'node activate-profile.mjs issue <логин>',
  'node activate-profile.mjs issue <ID старого гостя> <новый логин>',
  '',
  'Запускайте при остановленном сервере. PROFILE_DATA_FILE указывает на его файл профилей.'
].join('\n');

const [command,identifier,newLogin,...extra]=process.argv.slice(2);

try{
  if(command===undefined||command==='--help'){
    console.log(usage);
  }else{
    if(extra.length||(command==='list'&&identifier!==undefined)||(command!=='list'&&(command!=='issue'||!identifier))){
      throw new Error(usage);
    }
    const file=process.env.PROFILE_DATA_FILE||fileURLToPath(new URL('./data/profiles.json',import.meta.url));
    if(!existsSync(file))throw new Error('Файл профилей отсутствует. Проверьте PROFILE_DATA_FILE.');
    const profiles=new ProfileStore(file);
    if(command==='list'){
      const pending=profiles.listPendingActivations();
      console.log(JSON.stringify(pending,null,2));
    }else{
      const {code,login,expiresAt}=profiles.issueActivation(identifier,{login:newLogin});
      console.log(`Логин ${login}\nКод активации ${code}\nДействует до ${new Date(expiresAt).toISOString()}`);
    }
  }
}catch(error){
  console.error(error.message);
  process.exitCode=1;
}

import {spawnSync} from 'node:child_process';
import {mkdirSync,existsSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=realpathSync(fileURLToPath(new URL('../',import.meta.url)));
const parent=path.resolve(root,'../worktrees');
function git(args,capture=false){const result=spawnSync('git',args,{cwd:root,encoding:'utf8',stdio:capture?'pipe':'inherit'});if(result.error)throw result.error;if(result.status!==0)throw Error(capture?result.stderr:'Git command failed.');return result.stdout?.trim();}
const [command,role,base=process.env.ANF_WORKTREE_BASE||'HEAD']=process.argv.slice(2);
if(command==='list'){git(['worktree','list']);process.exit(0);}
if(command==='prune'){git(['worktree','prune']);process.exit(0);}
if(!['create','remove'].includes(command)||!role||!/^[a-z][a-z0-9-]{0,63}$/.test(role))throw Error('Usage: worktree_manager.sh create <role> [base-ref] | list | remove <role> | prune');
mkdirSync(parent,{recursive:true});const target=path.resolve(parent,role);
if(path.dirname(target)!==parent||!realpathSync(parent).startsWith(path.dirname(root)+path.sep))throw Error('Worktree target must stay inside the workspace worktrees directory.');
if(command==='create'){
 git(['rev-parse','--verify',base+'^{commit}'],true);
 if(existsSync(target))throw Error('Target already exists. Inspect worktree list; existing checkouts are never overwritten.');
 git(['worktree','add','-b','wt/'+role,target,base]);
}else{
 if(!existsSync(target)||path.dirname(realpathSync(target))!==realpathSync(parent))throw Error('Invalid existing worktree target.');
 const common=git(['rev-parse','--git-common-dir'],true);
 const checked=spawnSync('git',['-C',target,'rev-parse','--git-common-dir'],{encoding:'utf8'});
 if(checked.status!==0||path.resolve(target,checked.stdout.trim())!==path.resolve(root,common))throw Error('Target does not belong to this repository.');
 git(['worktree','remove',target]); // Git refuses dirty checkouts; no destructive fallback.
}

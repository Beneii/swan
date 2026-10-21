import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const gitRaw=(cwd,args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8',windowsHide:true,timeout:15000,stdio:['ignore','pipe','pipe']});
const git=(cwd,args)=>gitRaw(cwd,args).trim();
export function repositoryIdentity(cwd){
 const root=fs.realpathSync(git(cwd,['rev-parse','--show-toplevel']));
 const commonDir=fs.realpathSync(path.resolve(cwd,git(cwd,['rev-parse','--git-common-dir'])));
 return {repositoryRoot:root,repositoryCommonDir:commonDir,baseCommit:git(cwd,['rev-parse','--verify','HEAD']),branch:git(cwd,['branch','--show-current'])||null};
}
export function writerBase(projectPath){
 let identity;try{identity=repositoryIdentity(projectPath);}catch{throw Error('Writing workers require a Git repository root with an initial commit. Read-only workers can use any folder.');}
 if(fs.realpathSync(projectPath)!==identity.repositoryRoot)throw Error(`Choose the repository root for writing: ${identity.repositoryRoot}. The selected folder belongs to a parent repository.`);
 const dirty=gitRaw(projectPath,['status','--porcelain=v1','-z']);
 return {...identity,baseDirtyEntries:dirty?dirty.split('\0').filter(Boolean):[],baselinePolicy:'New worktree starts from the recorded HEAD commit. Existing uncommitted changes remain in the base checkout and are not copied.'};
}
export function verifyWriterWorkspace(cwd,base,expectedBranch){
 const actual=repositoryIdentity(cwd);
 if(actual.repositoryRoot!==fs.realpathSync(cwd)||actual.repositoryCommonDir!==base.repositoryCommonDir||actual.baseCommit!==base.baseCommit||expectedBranch&&actual.branch!==expectedBranch)throw Error('New worktree does not match the recorded repository, branch and base commit. Workspace preserved for inspection.');
 return actual;
}

import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

run();

async function run() {
    console.log('args', process.argv);
    
    const gitIsInstalled = await isGitInstalled();

    if (!gitIsInstalled) {
        console.error('Could not run git.  Is it installed?');
        process.exit(1);
        return;
    }

    if (!isGitRepository(process.cwd())) {
        console.error('Must be run inside of a git repository.');
        process.exit(1);
        return;
    }

    const gitResults = await readGitStatusForFolder(process.cwd());

    console.log(gitResults);
}

function spawnGitProcess(args: string[] = [], options?: child_process.SpawnOptions) {
    return child_process.spawn('git', args, options);
}

function isGitRepository(folderPath: string) {
    return fs.existsSync(path.join(folderPath, '.git'));
}

function isGitInstalled() {
    return new Promise((resolve, reject) => {
        const child = spawnGitProcess();
        let errored = false;
    
        child.on('close', () => {
            if (errored) return;

            resolve(true);
        });

        child.on('error', () => {
            resolve(false);
        });
    });
}

function readGitStatusForFolder(folderPath: string) {
    return new Promise((resolve, reject) => {
        const gitProcess = spawnGitProcess(['status', '-uall'], { cwd: folderPath });
        const parsedResult = {
            localBranchName: '',
            remoteBranchName: '',
            remoteNewCommits: 0,
            localNewCommits: 0,
            stagedChanges: {
                added: 0,
                deleted: 0,
                modified: 0,
                get total() {
                    return this.added + this.deleted + this.modified;
                },
            },
            unstagedChanges: {
                added: 0,
                deleted: 0,
                modified: 0,
                get total() {
                    return this.added + this.deleted + this.modified;
                },
            },
        };
        let rejected = false;
        let errorOutput = '';
        let stagedLine = false;
        let unstagedLine = false;
        let untrackedLine = false;
        let trackEmptyLines = false;
        let nextEmptyLineResets = false;

        gitProcess.stdout.on('data', output => {
            (output.toString('utf8') as string).split(/\r?\n/)
                .map(line => {
                    const text: string = line.trim();
        
                    if (trackEmptyLines && !text) {
                        if (nextEmptyLineResets) {
                            stagedLine = false;
                            unstagedLine = false;
                            untrackedLine = false;
                            trackEmptyLines = false;
                            nextEmptyLineResets = false;
                            return;
                        }

                        nextEmptyLineResets = true;
                        return;
                    }
        
                    if (text.match(/^On branch/)) {
                        parsedResult.localBranchName = text.match(/^On branch (.*)$/)[1];
                        return;
                    }
        
                    if (text == 'Changes to be committed:') {
                        trackEmptyLines = true;
                        stagedLine = true;
                        return;
                    }
        
                    if (text == 'Changes not staged for commit:') {
                        trackEmptyLines = true;
                        unstagedLine = true;
                        return;
                    }
        
                    if (text == 'Untracked files:') {
                        trackEmptyLines = true;
                        untrackedLine = true;
                        return;
                    }
        
                    if (stagedLine) {
                        if (text.includes('new file:')) {
                            parsedResult.stagedChanges.added++;
                            return;
                        }
                        if (text.includes('modified:')) {
                            parsedResult.stagedChanges.modified++;
                            return;
                        }
                        if (text.includes('deleted:')) {
                            parsedResult.stagedChanges.deleted++;
                            return;
                        }
                    }
        
                    if (unstagedLine) {
                        if (text.includes('modified:')) {
                            parsedResult.unstagedChanges.modified++;
                            return;
                        }
                        if (text.includes('deleted:')) {
                            parsedResult.unstagedChanges.deleted++;
                            return;
                        }
                    }
        
                    if (untrackedLine && nextEmptyLineResets) {
                        parsedResult.unstagedChanges.added++;
                        return;
                    }
                });
        });
        
        gitProcess.stderr.on('data', err => {
            errorOutput += err.toString('utf8');
        });

        gitProcess.on('error', err => {
            if (rejected) return;
            
            rejected = true;
            reject(err);
        });

        gitProcess.on('close', () => {
            if (rejected) return;
            
            if (errorOutput) {
                return reject(errorOutput);
            }

            resolve(parsedResult);
        });
    });
}

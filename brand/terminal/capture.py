#!/usr/bin/env python3
"""Capture the actual bundled CLI using a PTY; use only disposable synthetic brains."""
import os, pty, fcntl, termios, struct, subprocess, pathlib, json, tempfile, shutil, re, hashlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
CLI=ROOT/'packages/cli/dist/lore.js'
BASE=ROOT/'packages/cli/dist/lore.baseline.js'
OUT=ROOT/'brand/terminal/specimens'
ENV={**os.environ, 'LANG':'en_US.UTF-8','TERM':'xterm-256color','COLORTERM':'truecolor'}
for k in ['FORCE_COLOR','NO_COLOR','WW_ASCII','CI']: ENV.pop(k,None)
NODE=shutil.which('node')
def invoke(cli,args,env,tty=False,width=100,cwd=None):
    if not tty:
        p=subprocess.run([NODE,str(cli),*args],stdout=subprocess.PIPE,stderr=subprocess.PIPE,env=env,cwd=cwd)
        return p.returncode,p.stdout,p.stderr
    master,slave=pty.openpty()
    fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',60,width,0,0))
    p=subprocess.Popen([NODE,str(cli),*args],stdin=slave,stdout=slave,stderr=subprocess.PIPE,env=env,cwd=cwd)
    os.close(slave); data=b''
    while True:
        try:
            b=os.read(master,65536)
            if not b: break
            data+=b
        except OSError: break
    os.close(master); err=p.communicate()[1]
    return p.returncode,data.replace(b'\r',b''),err
specs=[]
with tempfile.TemporaryDirectory(prefix='lore-family-', dir='/private/tmp') as temp:
    brain=pathlib.Path(temp)/'brain'
    cases=[('wide',['--help'],100,{}),('narrow',['--help'],32,{}),('no-color',['--help'],100,{'NO_COLOR':'1'}),('ascii',['--help'],100,{'WW_ASCII':'1'}),('ansi256',['--help'],100,{'COLORTERM':''}),('ansi16',['--help'],100,{'COLORTERM':'','TERM':'xterm'}),('dumb',['--help'],80,{'TERM':'dumb'}),('no-arg',[],100,{}),('init',['init','brain'],100,{})]
    for name,args,width,extra in cases:
        code,out,err=invoke(CLI,args,{**ENV,**extra},True,width,temp)
        (OUT/f'{name}.ansi').write_bytes(out)
        (OUT/f'{name}.txt').write_text(re.sub(r'\x1b\[[0-9;]*m','',out.decode()))
        specs.append({'name':name,'command':'lore '+ ' '.join(args),'columns':width,'env':extra,'exit':code,'stderr':err.decode(),'capture':f'{name}.ansi','sha256':hashlib.sha256(out).hexdigest()})
    (OUT/'manifest.json').write_text(json.dumps({'product':'Lorekeeper','version':'0.2.1','serial':'LK-047','source':'Real PTY running bundled dist/lore.js; PTY carriage returns removed only. init cwd is a disposable external directory.','specimens':specs},indent=2)+'\n')
    (brain/'lamp.md').write_text('# Lamp\n\nA small reading lamp.\n')
    occupied=pathlib.Path(temp)/'occupied';occupied.write_text('Synthetic fixture')
    if not BASE.exists():
        print(f'{len(specs)} PTY captures. For baseline comparison, place the baseline bundle at {BASE}.')
        raise SystemExit(0)
    matrix=[('version',['--version']),('version-short',['-v']),('json',['search',str(brain),'lamp','--json']),('search',['search',str(brain),'lamp']),('unknown',['--bogus']),('failed-init',['init']),('refused-init',['init',str(occupied)]),('capture-error',['capture']),('search-error',['search'])]
    results=[]
    for tty in [False,True]:
      for envname,extra in [('default',{}),('forced',{'FORCE_COLOR':'3'}),('no-color',{'NO_COLOR':'1'}),('ascii',{'WW_ASCII':'1'}),('dumb',{'TERM':'dumb'})]:
        items=matrix+([] if tty else [('help',['--help']),('no-arg',[])])
        for name,args in items:
            old=invoke(BASE,args,{**ENV,**extra},tty)
            new=invoke(CLI,args,{**ENV,**extra},tty)
            assert new==old,(tty,envname,name,old,new)
            results.append({'surface':name,'tty':tty,'environment':envname,'exit':new[0],'stdoutBytes':len(new[1]),'stderrBytes':len(new[2]),'byteEquivalent':True})
    target=pathlib.Path(temp)/'pipe-init'
    old=invoke(BASE,['init',str(target)],ENV)
    shutil.rmtree(target)
    new=invoke(CLI,['init',str(target)],ENV)
    assert old==new
    results.append({'surface':'successful-piped-init','tty':False,'environment':'default','exit':new[0],'byteEquivalent':True})
    (OUT/'contract-proof.json').write_text(json.dumps({'baselineCommit':'d1ec6db5ad294e4be28da6cc3ec3af72c7ff7446','comparison':'Exit code, stdout bytes and stderr bytes match the baseline bundled binary for every row. Synthetic fixtures only.','comparisons':len(results),'results':results},indent=2)+'\n')
print(f'{len(specs)} PTY captures; {len(results)} byte-equivalent contract comparisons')

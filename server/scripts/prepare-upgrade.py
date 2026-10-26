#!/usr/bin/env python3
"""Read existing Docker settings and write non-secret compatibility overrides.
Run BEFORE stopping the old deployment. Does not alter containers, data or .env.
"""
import argparse,json,os,pathlib,subprocess,urllib.parse
p=argparse.ArgumentParser();p.add_argument('project',help='Existing Compose project name from docker compose ls');p.add_argument('--output',default='.env.upgrade-names');a=p.parse_args()
def inspect_service(service):
 ids=subprocess.check_output(['docker','ps','-aq','--filter','label=com.docker.compose.project='+a.project,'--filter','label=com.docker.compose.service='+service],text=True).split()
 if len(ids)!=1:raise SystemExit('Expected exactly one container for service '+service)
 return json.loads(subprocess.check_output(['docker','inspect',ids[0]],text=True))[0]
core=inspect_service('core');env=dict(x.split('=',1) for x in core['Config']['Env'] if '=' in x)
url=urllib.parse.urlsplit(env['DATABASE_URL'])
values={'CORE_DB_USER':urllib.parse.unquote(url.username or ''),'CORE_DB_NAME':urllib.parse.unquote(url.path.lstrip('/')),'S3_BUCKET':env.get('S3_BUCKET',''),'LOGTO_RESOURCE':env.get('LOGTO_RESOURCE','')}
for service,target,key in [('db','/var/lib/postgresql/data','DB_VOLUME_NAME'),('minio','/data','MINIO_VOLUME_NAME'),('n8n','/home/node/.n8n','N8N_VOLUME_NAME')]:
 mounts=[m for m in inspect_service(service)['Mounts'] if m['Destination']==target]
 if len(mounts)!=1 or mounts[0]['Type']!='volume':raise SystemExit('Expected named volume for '+service+'; review mounts manually')
 values[key]=mounts[0]['Name']
for k,v in values.items():
 if not v or any(c in v for c in '\n\r\x00\'"$ #'):raise SystemExit('Review unsupported value for '+k+' manually')
path=pathlib.Path(a.output)
# Refuse overwrites and keep this file private even though it excludes passwords.
fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as out:
 out.write('# Compatibility settings copied from the existing deployment. No passwords.\n')
 out.write(''.join(k+'='+v+'\n' for k,v in values.items()))
print('Created '+str(path)+'. Review and use with --env-file .env --env-file '+str(path))

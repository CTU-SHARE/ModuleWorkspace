#!/usr/bin/env python3
"""Refresh brand identifiers in generated JSON after configure.py. No network calls."""
import argparse,json,pathlib
p=argparse.ArgumentParser();p.add_argument('--env-file',action='append',default=[]);a=p.parse_args()
root=pathlib.Path(__file__).resolve().parent.parent
values={}
for name in a.env_file or ['.env']:
 for line in (root/name).read_text().splitlines():
  line=line.strip()
  if not line or line.startswith('#') or '=' not in line:continue
  k,v=line.split('=',1);values[k.strip()]=v.strip().strip('\'"')
config=root/'generated/config.json'
if config.exists():
 data=json.loads(config.read_text());data['resource']=values.get('LOGTO_RESOURCE',data.get('resource'))
 config.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
workflow=root/'generated/n8n/notifications.json'
if workflow.exists():
 data=json.loads(workflow.read_text())
 if not isinstance(data,dict):raise SystemExit('Expected a single workflow object; review generated workflow manually')
 data['id']='ModuleWorkspaceNotify1';data['name']='Module Workspace · Durable event notifications'
 for node in data.get('nodes',[]):
  if 'webhookId' in node:node['webhookId']='module-workspace-events'
 workflow.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('Updated existing generated JSON files; .env and secrets were not modified.')

#!/usr/bin/env python3
"""Convert an existing v1 exported app package to the current format identifier."""
import argparse,json,pathlib
p=argparse.ArgumentParser();p.add_argument('input');p.add_argument('output');a=p.parse_args()
data=json.loads(pathlib.Path(a.input).read_text())
if data.get('version')!=1 or not isinstance(data.get('app'),dict) or not isinstance(data.get('collections'),list):raise SystemExit('Expected a v1 application package')
data['format']='module-workspace.app'
with pathlib.Path(a.output).open('x') as f:json.dump(data,f,ensure_ascii=False,indent=2);f.write('\n')
print('Converted package; the server still validates every field during import.')

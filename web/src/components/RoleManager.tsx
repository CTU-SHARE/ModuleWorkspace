import {useState} from 'react';
import type {API} from '../useApi';
import {useLoad} from '../builder/hooks';
import {AsyncForm} from './AsyncForm';
type Role={id:string;name:string;description:string;base_role:string;permissions:string[];version:number;member_count?:number};
type Entry={key:string;label:string;level:string};
const ranks:Record<string,number>={viewer:0,editor:1,admin:2};
export function RoleManager({api,changed}:{api:API;changed:()=>void}){
 const [tick,setTick]=useState(0),[selected,setSelected]=useState<Role|null>(null),[creating,setCreating]=useState(false);
 const {data,error,loading}=useLoad(api,'/api/roles',tick);
 const refresh=()=>{setTick(t=>t+1);changed();};
 return <section className="surface role-manager"><header className="page-heading"><div><h1>Vai trò & quyền hạn</h1><p>Owner tạo role riêng cho tổ chức và chọn từng quyền thao tác.</p></div><button className="primary" onClick={()=>{setSelected(null);setCreating(true);}}>Tạo role</button></header>
 <p className="info">Quyền thực tế là giao của quyền nền, quyền thao tác và cấu hình ứng dụng/trường. Editor chỉ sửa hồ sơ của mình nhưng có thể đọc hồ sơ khác. Role này chưa thay thế chính sách dữ liệu theo từng học sinh.</p>
 {error&&<p role="alert">{error}</p>}{loading&&<p role="status">Đang tải role…</p>}
 {data&&<><div className="table-scroll"><table><thead><tr><th>Role</th><th>Quyền nền</th><th>Quyền thao tác</th><th>Thành viên</th><th/></tr></thead><tbody>{data.items.map((r:Role)=><tr key={r.id}><td><strong>{r.name}</strong><p>{r.description}</p></td><td>{r.base_role}</td><td>{r.permissions.length}</td><td>{r.member_count}</td><td><button onClick={()=>{setSelected(r);setCreating(false);}}>Chỉnh sửa</button></td></tr>)}</tbody></table></div>{!data.items.length&&<p>Chưa có role tùy chỉnh. Bốn role hệ thống vẫn hoạt động như trước.</p>}
 {(selected||creating)&&<RoleEditor key={selected?.id+':'+selected?.version+':'+creating} api={api} role={selected} catalog={data.catalog} dependencies={data.dependencies} saved={()=>{setSelected(null);setCreating(false);refresh();}}/>}
 </>}
 </section>;
}
function RoleEditor({api,role,catalog,dependencies,saved}:{api:API;role:Role|null;catalog:Entry[];dependencies:Record<string,string[]>;saved:()=>void}){
 const [base,setBase]=useState(role?.base_role||'viewer'),[permissions,setPermissions]=useState<string[]>(role?.permissions||[]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 function toggle(key:string,enabled:boolean){
  const next=new Set(permissions);
  if(enabled){const add=(p:string)=>{if(next.has(p))return;next.add(p);(dependencies[p]||[]).forEach(add);};add(key);}
  else {next.delete(key);let changed=true;while(changed){changed=false;for(const p of next)if((dependencies[p]||[]).some(d=>!next.has(d))){next.delete(p);changed=true;}}}
  setPermissions([...next]);
 }
 return <section className="role-editor"><h2>{role?'Chỉnh sửa role':'Role mới'}</h2><AsyncForm submit={async f=>{
  await api(role?'/api/roles/'+role.id:'/api/roles',role?'PUT':'POST',{name:f.get('name'),description:f.get('description'),base_role:base,permissions,...(role?{version:role.version}:{})});saved();
 }}>
 <label>Tên role<input name="name" required maxLength={80} defaultValue={role?.name||''} placeholder="Ví dụ: Giáo vụ, Người duyệt mua hàng"/></label>
 <label>Mô tả<textarea name="description" maxLength={1000} defaultValue={role?.description||''}/></label>
 <label>Quyền nền<select aria-label="Quyền nền" value={base} onChange={e=>{const b=e.target.value;setBase(b);setPermissions(p=>p.filter(k=>ranks[catalog.find(c=>c.key===k)!.level]<=ranks[b]));}}><option value="viewer">Viewer — chỉ đọc</option><option value="editor">Editor — thao tác hồ sơ của mình</option><option value="admin">Admin — thiết kế và thao tác trong tổ chức</option></select></label>
 <p>Chọn quyền sẽ tự bật các quyền đọc cần thiết. Bỏ quyền nền tảng sẽ bỏ các quyền phụ thuộc.</p>
 <div className="permission-grid">{catalog.map(p=><label key={p.key} className="permission-choice"><input type="checkbox" checked={permissions.includes(p.key)} disabled={ranks[p.level]>ranks[base]} onChange={e=>toggle(p.key,e.target.checked)}/><span>{p.label}<small>{p.key}</small></span></label>)}</div>
 <div className="actions"><button className="primary">Lưu role</button><button type="button" onClick={saved}>Đóng</button></div>
 </AsyncForm>
 {role&&<button className="danger" disabled={busy||!!role.member_count} onClick={async()=>{if(!confirm('Xóa role '+role.name+'?'))return;setBusy(true);setError('');try{await api('/api/roles/'+role.id,'DELETE',{version:role.version});saved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>Xóa role {role.member_count?'(cần gỡ khỏi thành viên trước)':''}</button>}
 {error&&<p role="alert">{error}</p>}</section>;
}
export function MemberRoleSelect({api,value,owner}:{api:API;value:string;owner:boolean}){
 const {data,error}=useLoad(api,owner?'/api/roles':null);
 return <label>Vai trò<select name="role" defaultValue={value} key={value+':'+!!data}>
 {['admin','editor','viewer'].map(r=><option key={r} value={r}>{r}</option>)}
 {data?.items.map((r:Role)=><option key={r.id} value={'custom:'+r.id}>{r.name} ({r.base_role})</option>)}
 {!data&&value.startsWith('custom:')&&<option value={value}>Role tùy chỉnh hiện tại</option>}
 </select>{error&&<span role="alert">{error}</span>}</label>;
}

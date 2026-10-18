import { Card, SelectField, TextAreaField, TextField } from '../../components/ui.tsx';
import type { LetterType } from '../../lib/letter-kinds.ts';
import { letterFieldGroups, type LetterField } from './fields.ts';

export function LetterFields({ type, values, onChange, positions, teams }: { readonly type: LetterType; readonly values: Readonly<Record<string,string>>; readonly onChange: (key:string,value:string)=>void; readonly positions: readonly string[]; readonly teams: readonly string[] }) {
  const control = (field: LetterField) => {
    const props = { key:field.key, label:field.label, hint:field.hint, value:values[field.key]??'', onChange:(event:{target:{value:string}})=>onChange(field.key,event.target.value), required:field.required };
    if (field.choices) return <SelectField {...props}>{field.choices.map((value)=><option key={value} value={value}>{value || 'None'}</option>)}</SelectField>;
    if (field.kind==='area') return <TextAreaField {...props} rows={3} maxLength={8000} />;
    const list = /position/.test(field.key) ? 'letter-position-options' : /(?:team|department)(?:-|$)/.test(field.key) ? 'letter-team-options' : undefined;
    return <TextField {...props} type={field.kind==='date'?'date':field.kind==='time'?'time':'text'} list={list} maxLength={255} />;
  };
  return <><datalist id="letter-position-options">{positions.map((title)=><option key={title} value={title}/>)}</datalist><datalist id="letter-team-options">{teams.map((name)=><option key={name} value={name}/>)}</datalist>
    {letterFieldGroups(type,values).map((group)=><Card key={group.title} title={group.title}><div className="form">{group.fields.map(control)}</div></Card>)}
  </>;
}

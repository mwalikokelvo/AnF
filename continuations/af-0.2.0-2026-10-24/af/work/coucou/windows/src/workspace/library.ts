import {h} from '../views/dom';
import {documentInfo} from './library-data';
import type {ReadingSource} from './reader-data';
import './library.css';
const refreshers=new WeakMap<HTMLElement,()=>void>();
const sorts=new WeakMap<HTMLElement,HTMLSelectElement>();
export function refreshLibrary(root:HTMLElement){const cards=Array.from(root.querySelectorAll<HTMLElement>('article'));for(const card of cards)refreshers.get(card)?.();const sort=sorts.get(root)?.value;if(sort==='title')cards.sort((a,b)=>(a.getAttribute('data-title')||'').localeCompare(b.getAttribute('data-title')||''));if(sort==='progress')cards.sort((a,b)=>Number(b.getAttribute('data-position'))-Number(a.getAttribute('data-position')));if(sort)root.append(...cards);}
export function libraryControls(root:HTMLElement){const select=h('select',{'aria-label':'Sort documents',class:'studio-sort'},h('option',{value:'title',text:'Title · A–Z'}),h('option',{value:'progress',text:'Saved position · highest first'}));sorts.set(root,select);select.addEventListener('change',()=>refreshLibrary(root));return select;}
export function libraryCard(source:ReadingSource,...actions:HTMLElement[]){
 const info=documentInfo(source),progress=h('progress',{max:100,value:info.position,'aria-label':'Saved position in '+source.name}),status=h('p',{class:'library-meta'});
 const card=h('article',{class:'library-card'},h('div',{class:'library-cover','aria-hidden':true,'data-format':info.format},h('span',{text:info.format}),h('strong',{text:source.name.replace(/^https?:\/\//i,'').slice(0,100)})),h('div',{class:'library-content'},h('h3',{text:source.name}),h('p',{class:'library-meta',text:`${info.format} · ${source.text.length.toLocaleString()} characters`}),progress,status,h('div',{class:'library-actions'},...actions)));
 const refresh=()=>{const current=documentInfo(source);progress.value=current.position;card.setAttribute('data-title',source.name);card.setAttribute('data-position',String(current.position));status.textContent=`Saved position ${current.position}% · ${current.notes} highlights · ${current.bookmarks} bookmarks`;};refreshers.set(card,refresh);refresh();return card;
}

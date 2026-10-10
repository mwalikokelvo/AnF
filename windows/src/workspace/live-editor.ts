import {autocompletion,type CompletionContext} from '@codemirror/autocomplete';
import {EditorState,Compartment} from '@codemirror/state';
import {EditorView,keymap,Decoration,ViewPlugin,type DecorationSet} from '@codemirror/view';
import {defaultKeymap} from '@codemirror/commands';
import {markdown} from '@codemirror/lang-markdown';
import {syntaxHighlighting,HighlightStyle,syntaxTree} from '@codemirror/language';
import {tags} from '@lezer/highlight';

export function liveEditor(parent:HTMLElement,draft:HTMLTextAreaElement,changed:()=>void,undo:()=>void,redo:()=>void,notify:(s:string)=>void,noteNames:()=>Promise<{name:string}[]>){
  let external=false;const editable=new Compartment();
  const marks=ViewPlugin.fromClass(class{
    decorations:DecorationSet;
    constructor(view:EditorView){this.decorations=this.build(view);}
    update(update:any){if(update.docChanged||update.selectionSet||update.viewportChanged)this.decorations=this.build(update.view);}
    build(view:EditorView){const ranges:any[]=[];const active=view.state.doc.lineAt(view.state.selection.main.head).number;
      for(const {from,to} of view.visibleRanges)syntaxTree(view.state).iterate({from,to,enter(node){
        if(['HeaderMark','EmphasisMark'].includes(node.name)&&view.state.doc.lineAt(node.from).number!==active)ranges.push(Decoration.mark({class:'cm-quiet-mark'}).range(node.from,node.to));
      }});return Decoration.set(ranges,true);
    }
  },{decorations:v=>v.decorations});
  async function wikiCompletions(context:CompletionContext){
    const match=context.matchBefore(/\[\[[^\]\n|]{0,120}/);if(!match)return null;
    for(let node=syntaxTree(context.state).resolveInner(context.pos,-1);node;node=node.parent!){if(['FencedCode','CodeBlock','InlineCode'].includes(node.name))return null;}
    const entries=await noteNames();if(context.aborted)return null;
    const names=[...new Set(entries.map(n=>n.name.trim()).filter(n=>n&&!/[\[\]\n|]/.test(n)))];
    return {from:match.from+2,options:names.slice(0,1000).map(name=>({label:name,type:'text',detail:'Saved conversation',apply:(view:EditorView,_completion:unknown,from:number,to:number)=>{const close=view.state.doc.sliceString(to,to+2)===']]';view.dispatch({changes:{from,to:to+(close?2:0),insert:name+']]'},selection:{anchor:from+name.length+2}});}})),validFor:/^[^\]\n|]*$/};
  }
  const view=new EditorView({parent,state:EditorState.create({doc:draft.value,extensions:[markdown(),EditorView.lineWrapping,marks,autocompletion({override:[wikiCompletions],maxRenderedOptions:12}),
    syntaxHighlighting(HighlightStyle.define([{tag:tags.heading1,fontSize:'1.65em',fontWeight:'700'},{tag:tags.heading2,fontSize:'1.35em',fontWeight:'700'},{tag:tags.heading,fontWeight:'700'},{tag:tags.strong,fontWeight:'700'},{tag:tags.emphasis,fontStyle:'italic'},{tag:tags.quote,color:'var(--muted,#819c99)'},{tag:tags.monospace,fontFamily:'monospace'},{tag:tags.link,textDecoration:'underline'}])),
    keymap.of([{key:'Mod-z',run:()=>{undo();return true;}},{key:'Mod-Shift-z',run:()=>{redo();return true;}},{key:'Mod-y',run:()=>{redo();return true;}},...defaultKeymap]),
    editable.of(EditorView.editable.of(!draft.disabled)),EditorView.contentAttributes.of({'aria-label':'Live Markdown writing',spellcheck:'true'}),
    EditorState.transactionFilter.of(tr=>{if(tr.docChanged&&!external&&new TextEncoder().encode(tr.newDoc.toString()).length>200000){notify('Writing limit reached. Export or start another draft.');return [];}return tr;}),
    EditorView.updateListener.of(update=>{const range=update.state.selection.main;draft.setSelectionRange(range.from,range.to);if(update.docChanged&&!external){draft.value=update.state.doc.toString();draft.setSelectionRange(range.from,range.to);changed();}}),
    EditorView.theme({'&':{backgroundColor:'transparent',color:'inherit',minHeight:'350px'},'.cm-content':{fontFamily:'inherit',padding:'22px',lineHeight:'1.8',caretColor:'var(--accent,#78cbbb)'},'.cm-scroller':{fontFamily:'inherit',overflow:'auto'},'.cm-cursor':{borderLeftColor:'var(--accent,#78cbbb)'},'&.cm-focused':{outline:'none'},'.cm-selectionBackground':{backgroundColor:'#567d7866 !important'}})
  ]})});
  return{sync(){if(view.state.doc.toString()!==draft.value){external=true;try{view.dispatch({changes:{from:0,to:view.state.doc.length,insert:draft.value},selection:{anchor:Math.min(draft.selectionStart||0,draft.value.length)}});}finally{external=false;}}},focusSelection(){view.dispatch({selection:{anchor:draft.selectionStart||0,head:draft.selectionEnd||0},scrollIntoView:true});view.focus();},setReadOnly(value:boolean){view.dispatch({effects:editable.reconfigure(EditorView.editable.of(!value))});}};
}
